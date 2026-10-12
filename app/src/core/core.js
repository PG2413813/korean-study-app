/**
 * 核心算法层 —— 从旧版单文件 `韩语学习记录.html` 的 CORE 区**原样移植**。
 *
 * 移植原则：行为完全不变。所有函数保持纯函数、不依赖 DOM。
 * 旧版通过 globalThis.AppCore 暴露，测试文件也是按那套接口写的，
 * 所以这里额外导出一个 AppCore 对象，方便逐条对照回归。
 */

export const STORAGE_KEY = 'hanStudyApp.v1'

/* ---------------- 日期 ---------------- */

export function todayKey(d) {
  d = d || new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export function dateOffset(base, n) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayKey(d)
}

export function weekStartKey(base) {
  const d = new Date(base + 'T00:00:00')
  const wd = d.getDay() // 0=周日
  d.setDate(d.getDate() - (wd === 0 ? 6 : wd - 1)) // 周一起始
  return todayKey(d)
}

export function dateGt(a, b) {
  return new Date(a + 'T00:00:00') > new Date(b + 'T00:00:00')
}

/* ---------------- 状态与持久化 ---------------- */

export function defaultState() {
  return { version: 1, settings: { roundSize: 20, removeAfter: 3 }, words: [], studyLog: {} }
}

export function normalizeState(s) {
  const def = defaultState()
  if (!s || typeof s !== 'object') return def
  s.version = 1
  s.settings = Object.assign({}, def.settings, s.settings || {})
  s.settings.roundSize = Math.max(1, Math.min(100, s.settings.roundSize | 0 || 20))
  s.settings.removeAfter = Math.max(1, Math.min(10, s.settings.removeAfter | 0 || 3))
  const log = s.studyLog && typeof s.studyLog === 'object' ? s.studyLog : {}
  s.studyLog = log
  s.words = (Array.isArray(s.words) ? s.words : [])
    .map((w) => {
      w = w || {}
      return {
        id: String(w.id != null ? w.id : 'w' + Math.random().toString(36).slice(2)),
        ko: String(w.ko || ''),
        zh: String(w.zh || ''),
        tags: Array.isArray(w.tags) ? w.tags.map(String).filter(Boolean) : [],
        createdAt: String(w.createdAt || todayKey()),
        lastReviewedAt: w.lastReviewedAt ? String(w.lastReviewedAt) : null,
        isError: !!w.isError,
        errorSince: w.errorSince ? String(w.errorSince) : null,
        correctStreak: w.correctStreak | 0
      }
    })
    .filter((w) => w.ko && w.zh)
  return s
}

export function getStorage(storage) {
  if (storage) return storage
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

export function loadState(storage) {
  storage = getStorage(storage)
  const raw = storage ? storage.getItem(STORAGE_KEY) : null
  if (!raw) {
    const fresh = defaultState()
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(fresh))
    return fresh
  }
  try {
    return normalizeState(JSON.parse(raw))
  } catch (e) {
    const reset = defaultState()
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(reset))
    return reset
  }
}

export function saveState(state, storage) {
  storage = getStorage(storage)
  if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export function exportJSON(state) {
  return JSON.stringify(
    { app: 'han-study', version: 1, exportedAt: todayKey(), data: state },
    null,
    2
  )
}

export function importJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: '文件不是有效的 JSON：' + e.message }
  }
  const data = parsed && (parsed.data || parsed)
  if (!data || typeof data !== 'object') return { ok: false, error: '备份文件缺少数据内容' }
  if (!Array.isArray(data.words)) return { ok: false, error: '备份文件缺少 words 数组' }
  return { ok: true, state: normalizeState(data) }
}

/* ---------------- 判题与释义 ---------------- */

export function normalizeText(s) {
  return String(s == null ? '' : s).trim()
}

export function splitMeanings(zh) {
  return normalizeText(zh)
    .split(/[、；，,/]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function judgeAnswer(input, answer, mode) {
  const inp = normalizeText(input)
  if (!inp) return false
  if (mode === 'zh2ko') return inp === normalizeText(answer)
  return splitMeanings(answer).indexOf(inp) >= 0
}

// 查找与 item 中文释义完全一致的单词（一个中文对应多个韩语）。
// 规则：释义集合完全相同才算同义（顺序无关）；包含关系不算。
export function findSynonymGroup(words, item) {
  const target = splitMeanings(item.zh).slice().sort().join('|')
  return (words || []).filter((w) => {
    if (w.id === item.id) return true
    const m = splitMeanings(w.zh).slice().sort().join('|')
    return m === target
  })
}

/* ---------------- 统计 ---------------- */

export function consecutiveStudyDays(studyLog, today) {
  today = today || todayKey()
  const cur = new Date(today + 'T00:00:00')
  function has(key) {
    const r = studyLog[key]
    return !!(r && (r.added > 0 || r.reviewed > 0))
  }
  if (!has(todayKey(cur))) cur.setDate(cur.getDate() - 1)
  let count = 0
  while (has(todayKey(cur))) {
    count++
    cur.setDate(cur.getDate() - 1)
  }
  return count
}

export function computeStats(words, studyLog, today) {
  today = today || todayKey()
  const added = (studyLog[today] && studyLog[today].added) || 0
  let due = 0
  let errors = 0
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w.isError) errors++
    if (!w.isError && w.createdAt < today && (w.lastReviewedAt == null || w.lastReviewedAt < today)) due++
  }
  return {
    newAdded: added,
    dueReview: due,
    errorCount: errors,
    totalWords: words.length,
    studyDays: consecutiveStudyDays(studyLog, today)
  }
}

// 取某天学习记录，字段缺失时补默认值（兼容旧备份数据）
export function dayLog(studyLog, date) {
  date = date || todayKey()
  const r = studyLog[date] || {}
  return { added: r.added | 0, reviewed: r.reviewed | 0, correct: r.correct | 0, seconds: r.seconds | 0 }
}

// 单日统计：新学 / 复习 / 正确 / 时长 / 掌握率（正确÷复习，无复习时为 null）
export function computeDayStats(studyLog, date) {
  const d = dayLog(studyLog, date)
  const rate = d.reviewed > 0 ? Math.round((d.correct / d.reviewed) * 100) : null
  return { added: d.added, reviewed: d.reviewed, correct: d.correct, seconds: d.seconds, correctRate: rate }
}

// 趋势聚合：day=最近N天 / week=最近N周（周一起始）/ month=最近N月
export function computeTrend(studyLog, today, mode, span) {
  today = today || todayKey()
  mode = mode || 'day'
  span = span || ({ day: 14, week: 8, month: 12 }[mode] || 14)
  const out = []
  const empty = () => ({ added: 0, reviewed: 0, seconds: 0 })

  if (mode === 'day') {
    for (let i = 0; i < span; i++) {
      const ds = dateOffset(today, -i)
      const d = dayLog(studyLog, ds)
      out.push({ label: ds.slice(5), date: ds, added: d.added, reviewed: d.reviewed, seconds: d.seconds })
    }
  } else if (mode === 'week') {
    const wkStart = weekStartKey(today)
    for (let j = 0; j < span; j++) {
      const start = dateOffset(wkStart, -j * 7)
      const end = dateOffset(start, 6)
      const agg = empty()
      for (let dd = start; !dateGt(dd, end); dd = dateOffset(dd, 1)) {
        const w = dayLog(studyLog, dd)
        agg.added += w.added
        agg.reviewed += w.reviewed
        agg.seconds += w.seconds
      }
      out.push({ label: start.slice(5) + ' 周', added: agg.added, reviewed: agg.reviewed, seconds: agg.seconds })
    }
  } else {
    const curY = parseInt(today.slice(0, 4), 10)
    const curM = parseInt(today.slice(5, 7), 10)
    for (let k = 0; k < span; k++) {
      const mIdx = curM - k
      const y = curY + Math.floor((mIdx - 1) / 12)
      const m = (((mIdx - 1) % 12) + 12) % 12 + 1
      const key = y + '-' + String(m).padStart(2, '0')
      const agg2 = empty()
      for (let dayIn = 1; dayIn <= 31; dayIn++) {
        const ds2 = key + '-' + String(dayIn).padStart(2, '0')
        if (dateGt(ds2, today)) break
        const w2 = dayLog(studyLog, ds2)
        agg2.added += w2.added
        agg2.reviewed += w2.reviewed
        agg2.seconds += w2.seconds
      }
      out.push({ label: key, added: agg2.added, reviewed: agg2.reviewed, seconds: agg2.seconds })
    }
  }
  return out
}

// 历史记录：筛选有学习痕迹的日期，倒序返回
export function historyDays(studyLog) {
  const arr = []
  for (const k in studyLog) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue
    const d = studyLog[k] || {}
    if ((d.added || 0) > 0 || (d.reviewed || 0) > 0 || (d.seconds || 0) > 0) {
      const reviewed = d.reviewed || 0
      arr.push({
        date: k,
        added: d.added || 0,
        reviewed,
        correct: d.correct || 0,
        seconds: d.seconds || 0,
        rate: reviewed > 0 ? Math.round(((d.correct || 0) / reviewed) * 100) : null
      })
    }
  }
  arr.sort((a, b) => (a.date < b.date ? 1 : -1))
  return arr
}

// 成长总结：累计学习天数/新学/复习/时长/平均掌握率
export function computeSummary(studyLog) {
  const s = { days: 0, added: 0, reviewed: 0, correct: 0, seconds: 0, avgRate: null }
  for (const k in studyLog) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue
    const d = studyLog[k] || {}
    if ((d.added || 0) > 0 || (d.reviewed || 0) > 0 || (d.seconds || 0) > 0) {
      s.days++
      s.added += d.added || 0
      s.reviewed += d.reviewed || 0
      s.correct += d.correct || 0
      s.seconds += d.seconds || 0
    }
  }
  s.avgRate = s.reviewed > 0 ? Math.round((s.correct / s.reviewed) * 100) : null
  return s
}

/* ---------------- 复习 ---------------- */

export function shuffled(arr, rand) {
  rand = rand || Math.random
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = a[i]
    a[i] = a[j]
    a[j] = t
  }
  return a
}

export function buildReviewQueue(words, settings, today, opts) {
  opts = opts || {}
  today = today || todayKey()
  settings = settings || { roundSize: 20, removeAfter: 3 }
  const size = Math.max(1, settings.roundSize | 0)
  const rand = opts.rand || Math.random

  const errors = words.filter((w) => w.isError)
  if (opts.onlyErrors) return shuffled(errors, rand).slice(0, size)

  const normals = words.filter(
    (w) => !w.isError && w.createdAt < today && (w.lastReviewedAt == null || w.lastReviewedAt < today)
  )
  normals.sort((a, b) => {
    const ra = a.lastReviewedAt || ''
    const rb = b.lastReviewedAt || ''
    if (ra < rb) return -1
    if (ra > rb) return 1
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  })

  if (errors.length >= size) return shuffled(errors, rand).slice(0, size)

  const picked = normals.slice(0, size - errors.length)
  const queue = picked.slice()
  errors.forEach((e) => {
    const pos = Math.floor(rand() * (queue.length + 1))
    queue.splice(pos, 0, e)
  })
  return queue
}

export function applyAnswer(word, correct, today, settings) {
  today = today || todayKey()
  settings = settings || { removeAfter: 3 }
  const w = Object.assign({}, word)
  if (correct) {
    if (w.isError) {
      w.correctStreak = (w.correctStreak | 0) + 1
      if (w.correctStreak >= (settings.removeAfter | 0)) {
        w.isError = false
        w.errorSince = null
        w.correctStreak = 0
      }
    }
  } else {
    w.isError = true
    w.errorSince = today
    w.correctStreak = 0
  }
  return w
}

/* ---------------- 录入 ---------------- */

export function addWordEntry(words, ko, zh, tags, today) {
  today = today || todayKey()
  ko = normalizeText(ko)
  zh = normalizeText(zh)
  tags = (tags || []).map(normalizeText).filter(Boolean)
  if (!ko || !zh) return { status: 'invalid', words }

  let existing = null
  for (let i = 0; i < words.length; i++) {
    if (normalizeText(words[i].ko) === ko) {
      existing = words[i]
      break
    }
  }
  if (existing) return { status: 'duplicate', existing, words }

  const next = words.slice()
  next.push({
    id: 'w' + Date.now() + '_' + Math.floor(Math.random() * 1e6),
    ko,
    zh,
    tags,
    createdAt: today,
    lastReviewedAt: null,
    isError: false,
    errorSince: null,
    correctStreak: 0
  })
  return { status: 'added', words: next }
}

export function mergeEntry(existing, zh, tags) {
  const w = Object.assign({}, existing)
  const oldM = splitMeanings(w.zh)
  splitMeanings(zh).forEach((m) => {
    if (oldM.indexOf(m) < 0) oldM.push(m)
  })
  w.zh = oldM.join('、')
  const t = {}
  ;(w.tags || []).concat(tags || []).forEach((x) => {
    x = normalizeText(x)
    if (x) t[x] = 1
  })
  w.tags = Object.keys(t)
  return w
}

/* ---------------- 兼容旧测试的聚合导出 ---------------- */

export const AppCore = {
  STORAGE_KEY, todayKey, defaultState, normalizeState, loadState, saveState, exportJSON, importJSON,
  normalizeText, splitMeanings, judgeAnswer, consecutiveStudyDays, computeStats, buildReviewQueue,
  applyAnswer, addWordEntry, mergeEntry, findSynonymGroup, dayLog, computeDayStats, computeTrend,
  historyDays, computeSummary
}

if (typeof globalThis !== 'undefined') globalThis.AppCore = AppCore
