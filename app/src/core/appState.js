/**
 * 应用状态与数据操作。
 * 数据模型与旧版完全一致，只多了一个可选的 settings.autoNextDelay（答对后自动跳转延时）。
 */
import { reactive, computed } from 'vue'
import * as C from './core'
import { detectStorage, migrateFromLegacy, loadRaw, saveRaw, storageMode } from './storage'

/**
 * 主状态。注意：初始化是异步的（数据在 IndexedDB 里），
 * 所以先给一份空状态占位，等 initState() 读完再填进来。
 */
export const state = reactive(C.defaultState())

export const DEFAULT_AUTO_NEXT = 700

/** 把读到的数据填进响应式 state（保持同一个对象引用，避免各处持有的引用失效） */
function applyState(next) {
  state.version = next.version
  state.settings = next.settings
  state.words = next.words
  state.studyLog = next.studyLog
}

let saveTimer = null

function plainSnapshot() {
  // IndexedDB 的结构化克隆不能直接克隆 Vue 的响应式代理，必须先转成普通对象
  return JSON.parse(JSON.stringify({
    version: state.version,
    settings: state.settings,
    words: state.words,
    studyLog: state.studyLog
  }))
}

function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
  saveRaw(plainSnapshot())
}

/**
 * 持久化。localStorage 回退时同步写（行为与旧版一致）；
 * IndexedDB 时做防抖，避免频繁操作时反复序列化大对象。
 */
export function persist() {
  if (storageMode() === 'localstorage') { saveNow(); return }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(saveNow, 250)
}

/** 立即落盘（关页面前调用） */
export function flushPersist() {
  saveNow()
}

/**
 * 应用启动前调用：探测存储 → 迁移旧数据 → 读取 → 填进 state。
 * 返回 { mode, migrated } 便于诊断。
 */
export async function initState() {
  await detectStorage()
  const migrated = await migrateFromLegacy()

  let raw = null
  try {
    raw = await loadRaw()
  } catch (e) {
    raw = null
  }

  let next
  if (raw) {
    try {
      next = C.normalizeState(raw)
    } catch (e) {
      next = C.defaultState()
    }
  } else {
    next = C.defaultState()
  }
  applyState(next)
  if (!raw) saveNow()

  // 把实际使用的存储方式写到 <html> 上，方便自查、也方便自动化测试断言
  try {
    document.documentElement.setAttribute('data-storage', storageMode())
  } catch (e) { /* 非浏览器环境忽略 */ }

  // 关闭/切后台前把防抖中的数据落盘
  try {
    window.addEventListener('beforeunload', flushPersist)
    window.addEventListener('pagehide', flushPersist)
    document.addEventListener('visibilitychange', () => { if (document.hidden) flushPersist() })
  } catch (e) { /* noop */ }

  return { mode: storageMode(), migrated }
}

export function today() {
  return C.todayKey()
}

/* ---------------- 派生数据 ---------------- */

export const stats = computed(() => C.computeStats(state.words, state.studyLog, today()))
export const todayLog = computed(() => C.dayLog(state.studyLog, today()))
export const summary = computed(() => C.computeSummary(state.studyLog))

export const allTags = computed(() => {
  const out = []
  state.words.forEach((w) => w.tags.forEach((t) => { if (out.indexOf(t) < 0) out.push(t) }))
  return out
})

export const errorWords = computed(() => state.words.filter((w) => w.isError))

/* ---------------- 主题 ---------------- */

export const THEMES = [
  { id: 'green', label: '淡绿' },
  { id: 'blue', label: '淡蓝' },
  { id: 'light', label: '浅灰' },
  { id: 'dark', label: '深色' }
]

export const theme = computed(() => (state.settings && state.settings.theme) || 'green')

export function setTheme(t) {
  if (!state.settings) state.settings = { roundSize: 20, removeAfter: 3 }
  state.settings.theme = t
  persist()
}

/* ---------------- 单词操作 ---------------- */

export function findWord(id) {
  for (let i = 0; i < state.words.length; i++) if (state.words[i].id === id) return state.words[i]
  return null
}

export function updateWord(id, patch) {
  state.words = state.words.map((w) => (w.id === id ? Object.assign({}, w, patch) : w))
  persist()
}

/** 录入。返回值与旧版一致：{status:'added'|'duplicate'|'invalid', message?, existing?} */
export function addWord(ko, zh, tags) {
  const res = C.addWordEntry(state.words, ko, zh, tags, today())
  if (res.status === 'invalid') return { status: 'invalid', message: '韩语和中文都不能为空' }
  if (res.status === 'duplicate') {
    return {
      status: 'duplicate',
      existing: res.existing,
      message: '该单词已存在：' + res.existing.ko + ' = ' + res.existing.zh
    }
  }
  state.words = res.words
  recAdded(1)
  persist()
  return { status: 'added' }
}

export function mergeEntry(id, zh, tags) {
  const w = findWord(id)
  if (!w) return
  const merged = C.mergeEntry(w, zh, tags || [])
  updateWord(id, merged)
}

/** 删除单词。若该词是今天录的，同步把今日录入数减 1（与旧版一致） */
export function removeWord(id) {
  const w = findWord(id)
  if (w && w.createdAt === today()) {
    const t = today()
    if (state.studyLog[t]) state.studyLog[t].added = Math.max(0, (state.studyLog[t].added || 0) - 1)
  }
  state.words = state.words.filter((x) => x.id !== id)
  persist()
}

/** 移除错题标记（回归普通词库，不计入"连续答对移出"的自动逻辑） */
export function clearError(id) {
  updateWord(id, { isError: false, errorSince: null, correctStreak: 0 })
}

export function wordsOrdered(list) {
  if (state.settings && state.settings.wordsOrder === 'desc') return list.slice().reverse()
  return list
}

export function toggleWordsOrder() {
  if (!state.settings) state.settings = { roundSize: 20, removeAfter: 3 }
  state.settings.wordsOrder = state.settings.wordsOrder === 'desc' ? 'asc' : 'desc'
  persist()
}

/* ---------------- 学习记录回写 ---------------- */

export function ensureDayLog() {
  const t = today()
  if (!state.studyLog[t]) state.studyLog[t] = { added: 0, reviewed: 0, correct: 0, seconds: 0 }
  return t
}

export function recAdded(n) {
  const t = ensureDayLog()
  state.studyLog[t].added = (state.studyLog[t].added || 0) + n
}
export function recReviewed() {
  const t = ensureDayLog()
  state.studyLog[t].reviewed = (state.studyLog[t].reviewed || 0) + 1
}
export function recCorrect() {
  const t = ensureDayLog()
  state.studyLog[t].correct = (state.studyLog[t].correct || 0) + 1
}

/* ---------------- 设置 ---------------- */

export function saveSettings(patch) {
  if (!state.settings) state.settings = { roundSize: 20, removeAfter: 3 }
  if (patch.roundSize != null) state.settings.roundSize = Math.max(1, Math.min(100, patch.roundSize | 0 || 20))
  if (patch.removeAfter != null) state.settings.removeAfter = Math.max(1, Math.min(10, patch.removeAfter | 0 || 3))
  if (patch.autoNextDelay != null) {
    const v = patch.autoNextDelay | 0
    state.settings.autoNextDelay = v <= 0 ? 0 : Math.min(3000, v)
  }
  persist()
}

export function resetSettings() {
  const keepTheme = state.settings && state.settings.theme
  state.settings = { roundSize: 20, removeAfter: 3 }
  if (keepTheme) state.settings.theme = keepTheme
  persist()
}

export const autoNextDelay = computed(() => {
  const v = state.settings && state.settings.autoNextDelay
  return v == null ? DEFAULT_AUTO_NEXT : v
})

/* ---------------- 备份 ---------------- */

export function doExport() {
  return C.exportJSON(state)
}

export function doImport(text) {
  const res = C.importJSON(text)
  if (res.ok) {
    const next = res.state
    state.version = next.version
    state.settings = next.settings
    state.words = next.words
    state.studyLog = next.studyLog
    persist()
  }
  return res
}
