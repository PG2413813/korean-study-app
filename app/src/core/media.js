/**
 * 图片素材：页面背景 与 偶像小卡 的选择逻辑。
 *
 * 三种模式：
 *   daily —— 跟随「一年中的第几天」自动轮换（旧版行为，默认）
 *   fixed —— 固定使用清单里的某一张
 *   custom —— 使用用户手动上传的图片（存成 dataURL）
 */
import { computed } from 'vue'
import { state, persist } from './appState'
import { PAGE_BACKGROUNDS, IDOL_PHOTOS } from '../assets/backgrounds.gen'

export const MEDIA_MODES = [
  { id: 'daily', label: '跟随每日轮换' },
  { id: 'fixed', label: '固定一张' },
  { id: 'custom', label: '使用我上传的图片' }
]

export function dayIndexOf(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0)
  return Math.floor((d - start) / 86400000)
}

const DEFAULT_MEDIA = { mode: 'daily', pick: null, custom: null }

export function normalizeMedia(m) {
  if (!m || typeof m !== 'object') return { ...DEFAULT_MEDIA }
  const mode = ['daily', 'fixed', 'custom'].indexOf(m.mode) >= 0 ? m.mode : 'daily'
  return {
    mode,
    pick: typeof m.pick === 'string' ? m.pick : null,
    custom: typeof m.custom === 'string' && m.custom ? m.custom : null
  }
}

export function resolveMedia(media, list) {
  const m = normalizeMedia(media)
  if (m.mode === 'custom' && m.custom) return m.custom
  if (m.mode === 'fixed' && m.pick) {
    if (!list.length || list.indexOf(m.pick) >= 0) return m.pick
  }
  if (!list.length) return ''
  return list[dayIndexOf() % list.length]
}

export const backgroundUrl = computed(() => resolveMedia(state.settings && state.settings.bg, PAGE_BACKGROUNDS))
export const idolUrl = computed(() => resolveMedia(state.settings && state.settings.idol, IDOL_PHOTOS))

export const bgMedia = computed(() => normalizeMedia(state.settings && state.settings.bg))
export const idolMedia = computed(() => normalizeMedia(state.settings && state.settings.idol))

export const BG_LIST = PAGE_BACKGROUNDS
export const IDOL_LIST = IDOL_PHOTOS

/** 设置某种素材的配置。kind: 'bg' | 'idol' */
export function setMedia(kind, patch) {
  if (!state.settings) state.settings = {}
  const cur = normalizeMedia(state.settings[kind])
  state.settings[kind] = normalizeMedia(Object.assign({}, cur, patch))
  persist()
}

export function resetMedia(kind) {
  setMedia(kind, { mode: 'daily', pick: null, custom: null })
}

/**
 * 把用户选的图片压缩成 dataURL。
 * 直接存原图会撑爆 localStorage（上限约 5MB），这里先按最长边缩放再转 JPEG。
 */
export function fileToCompressedDataURL(file, maxSize = 1800, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('请选择图片文件')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('这不是有效的图片'))
      img.onload = () => {
        let w = img.naturalWidth || img.width
        let h = img.naturalHeight || img.height
        const scale = Math.min(1, maxSize / Math.max(w, h))
        w = Math.max(1, Math.round(w * scale))
        h = Math.max(1, Math.round(h * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        try {
          resolve(c.toDataURL('image/jpeg', quality))
        } catch (e) {
          reject(new Error('处理图片失败'))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** dataURL 的体积（字节，粗略） */
export function dataUrlSize(dataUrl) {
  if (!dataUrl) return 0
  const i = dataUrl.indexOf(',')
  return i < 0 ? 0 : Math.round((dataUrl.length - i - 1) * 0.75)
}

export function fmtBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1024 / 1024).toFixed(2) + ' MB'
}
