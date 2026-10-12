/**
 * 学习数据的自动快照。
 *
 * 规则（按需求）：
 *   - 每天零点自动保存一次；
 *   - 保存周期两天：只保留「今天」和「昨天」两份，更早的到期自动删除。
 *
 * 实现说明：这是纯本地单文件应用，没有常驻服务，所以只能在「页面打开期间」执行。
 * 因此做成两段：
 *   1) 打开应用时补一次（若今天还没有快照就立刻存一份）——这样即使零点时没开电脑，
 *      当天首次打开也会补上；
 *   2) 运行期间每 30 秒检查一次日期是否跨天，跨了就立刻存 —— 保证零点那一刻在场时会准时保存。
 * 快照里不含用户上传的自定义图片（体积太大），其它数据（单词、学习记录、设置）都完整保留。
 */
import { ref, reactive } from 'vue'
import { state } from './appState'
import { todayKey, dateOffset } from './core'

const KEY = 'hanStudyApp.snapshots.v1'
export const RETENTION_DAYS = 2
const CHECK_INTERVAL_MS = 30 * 1000

/** { 'YYYY-MM-DD': { savedAt: ISOString, data: {...} } } */
export const snapshots = reactive({})
export const lastSavedAt = ref(null)

let lastEnsuredDate = null
let timerId = null

function loadRaw() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch (e) {
    return {}
  }
}

function saveRaw(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj))
    return true
  } catch (e) {
    return false
  }
}

function syncReactive(obj) {
  Object.keys(snapshots).forEach((k) => { delete snapshots[k] })
  Object.keys(obj).forEach((k) => { snapshots[k] = obj[k] })
  const dates = Object.keys(obj).sort()
  const latest = dates.length ? obj[dates[dates.length - 1]] : null
  lastSavedAt.value = latest ? latest.savedAt : null
}

function snapshotData() {
  const clone = {
    version: state.version,
    settings: JSON.parse(JSON.stringify(state.settings || {})),
    words: JSON.parse(JSON.stringify(state.words || [])),
    studyLog: JSON.parse(JSON.stringify(state.studyLog || {}))
  }
  if (clone.settings.bg) clone.settings.bg.custom = null
  if (clone.settings.idol) clone.settings.idol.custom = null
  return clone
}

/** 保留「今天」和「昨天」，更早的删除 */
function pruneTo(store, today) {
  const cutoff = dateOffset(today, -(RETENTION_DAYS - 1))
  let removed = 0
  Object.keys(store).forEach((k) => {
    if (k < cutoff) { delete store[k]; removed++ }
  })
  return removed
}

export function ensureDailySnapshot(force = false) {
  const today = todayKey()
  if (!force && lastEnsuredDate === today) return false
  lastEnsuredDate = today

  const store = loadRaw()
  let changed = pruneTo(store, today) > 0

  if (force || !store[today]) {
    store[today] = { savedAt: new Date().toISOString(), data: snapshotData() }
    changed = true
  }

  if (changed) {
    if (!saveRaw(store)) {
      // 配额不足：退化成只存学习记录，别让快照把主数据挤掉
      const slim = {}
      Object.keys(store).forEach((k) => {
        const d = store[k].data || {}
        slim[k] = { savedAt: store[k].savedAt, data: { version: 1, settings: {}, words: [], studyLog: d.studyLog || {} } }
      })
      saveRaw(slim)
      syncReactive(slim)
      return true
    }
    syncReactive(store)
  }
  return changed
}

export function startAutoSnapshot() {
  if (timerId) return
  timerId = setInterval(() => { ensureDailySnapshot() }, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureDailySnapshot()
  })
  ensureDailySnapshot()
}

export function stopAutoSnapshot() {
  if (timerId) { clearInterval(timerId); timerId = null }
}

/** 有快照的日期，倒序 */
export function snapshotDates() {
  return Object.keys(snapshots).sort().reverse()
}

export function readSnapshot(date) {
  const s = snapshots[date]
  return s ? s.data : null
}

export function clearSnapshots() {
  snapshots && Object.keys(snapshots).forEach((k) => { delete snapshots[k] })
  lastSavedAt.value = null
  try { localStorage.removeItem(KEY) } catch (e) { /* noop */ }
}

export function fmtSavedAt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

// 模块加载时先把已有快照同步进内存，供设置页展示
syncReactive(loadRaw())
