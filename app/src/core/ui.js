/**
 * 界面状态：导航、全局提示（toast）、弹窗。
 * 相比旧版新增：toast 三态提示、弹窗支持 ESC / 点击遮罩关闭、记忆上次所在页面。
 */
import { ref, reactive, computed } from 'vue'
import { state, persist, today } from './appState'
import * as C from './core'

export const NAV = [
  { id: 'home', label: '首页总览', short: '首页', em: '🏠', tab: true },
  { id: 'words', label: '单词库', short: '词库', em: '🗂️', tab: true },
  { id: 'add', label: '每日学习录入', short: '录入', em: '✏️', tab: true },
  { id: 'review', label: '单词复习', short: '复习', em: '🔁', tab: true },
  { id: 'errors', label: '错题库管理', short: '错题', em: '⭐', tab: true },
  { id: 'stats', label: '时间管理', short: '统计', em: '📊', tab: false },
  { id: 'settings', label: '数据与设置', short: '设置', em: '⚙️', tab: false }
]

export const TAB_NAV = NAV.filter((n) => n.tab)

/* 当前页面。
   注意不能像以前那样在模块加载时直接读 state.settings.lastView ——
   现在数据是异步从 IndexedDB 读的，模块加载时 state 还是空的默认值，
   会把 lastView 读成 undefined，导致"记住上次页面"失效。
   改成：手动导航前跟随设置里的 lastView，手动导航后以手动为准。 */
const manualView = ref(null)

export const currentView = computed(() => {
  const v = manualView.value || (state.settings && state.settings.lastView)
  return NAV.some((n) => n.id === v) ? v : 'home'
})

export function navigate(view) {
  if (!NAV.some((n) => n.id === view)) return
  manualView.value = view
  persistView()
}

function persistView() {
  if (!state.settings) state.settings = {}
  state.settings.lastView = currentView.value
  persist()
}

/* ---------------- 全局提示 ---------------- */

let toastSeq = 0
export const toasts = reactive([])

export function toast(text, type = 'ok', ms = 2400) {
  const id = ++toastSeq
  toasts.push({ id, text, type })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, ms)
  return id
}

export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id)
  if (i >= 0) toasts.splice(i, 1)
}

/* ---------------- 弹窗 ---------------- */

export const modal = reactive({ type: null, props: {} })

export function openModal(type, props = {}) {
  modal.type = type
  modal.props = props
}

export function closeModal() {
  modal.type = null
  modal.props = {}
}

/** 二次确认弹窗。onConfirm 为确认后的回调。 */
export function confirmDialog({ title, text, confirmText = '确定', danger = false, onConfirm }) {
  openModal('confirm', { title, text, confirmText, danger, onConfirm })
}

/* ---------------- 移动端"更多"面板 ---------------- */

export const moreOpen = ref(false)
export const mobileSearchOpen = ref(false)

/* ---------------- 小工具 ---------------- */

export function fmtDuration(totalSec) {
  totalSec = totalSec | 0
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return h + ' 小时 ' + String(m).padStart(2, '0') + ' 分'
  if (m > 0) return m + ' 分 ' + String(s).padStart(2, '0') + ' 秒'
  return s + ' 秒'
}

export function weekdayCN(d = new Date()) {
  return ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()]
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '잘 지냈나요'
  if (h < 12) return '좋은 아침이에요'
  if (h < 18) return '안녕하세요'
  return '오늘도 수고했어요'
}

export { today, C }
