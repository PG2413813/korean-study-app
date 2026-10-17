/**
 * 复习会话。
 *
 * 相比旧版的增强：把「方向」和「呈现方式」拆成两个独立维度。
 *   方向：zh2ko（看中文写韩语）/ ko2zh（看韩语写中文）
 *   方式：type（打字）/ choice（四选一）/ flash（闪卡自评）
 * 旧版的两种模式在这里等价于 方向 × type，行为完全保留。
 *
 * 答题节奏（用户 2026-10-17 确认）：
 *   答对 —— 有同义词时展示所有写法、等用户按回车；无同义词则按设置自动进入下一题。
 *   答错 —— **不提供「下一题」，必须重做到答对才能继续**；
 *           按回车 = 重做本题（清空输入 / 恢复选项），重做的答案**会真正判题**；
 *           重做又答错 → 提示「再试一次」，可以继续重做。
 *   申诉 —— 点过「我答对了」后按回车 = 进入下一题。
 * 重做不会重复计入统计，也不会二次改动单词状态（错题标记只记第一次）。
 */
import { ref, computed } from 'vue'
import * as C from './core'
import {
  state, updateWord, findWord, recReviewed, recCorrect, persist, today, autoNextDelay
} from './appState'

const SESSION_KEY = 'hanStudyApp.reviewSession'

export const onlyErrors = ref(false)
export const session = ref(null)
export const feedback = ref(null)
export const options = ref([])
export const flipped = ref(false)
/** 每次进入重做就 +1，视图据此清空输入框并聚焦 */
export const retryTick = ref(0)

let autoTimer = null

export const DIRECTIONS = [
  { id: 'zh2ko', label: '中 → 韩', sub: '给中文写韩语' },
  { id: 'ko2zh', label: '韩 → 中', sub: '给韩语写中文' }
]

export const STYLES = [
  { id: 'type', label: '打字', em: '⌨️' },
  { id: 'choice', label: '选择题', em: '🔢' },
  { id: 'flash', label: '闪卡', em: '🃏' }
]

/* ---------------- 派生 ---------------- */

export const queueWords = computed(() => {
  if (!session.value) return []
  return session.value.queueIds.map((id) => findWord(id)).filter(Boolean)
})

export const currentWord = computed(() => {
  if (!session.value) return null
  return findWord(session.value.queueIds[session.value.index]) || null
})

export const progress = computed(() => {
  if (!session.value) return { now: 0, total: 0, pct: 0 }
  const total = session.value.queueIds.length
  const now = Math.min(session.value.index + (session.value.answered ? 1 : 0), total)
  return { now, total, pct: total ? Math.round((now / total) * 100) : 0 }
})

export const promptText = computed(() => {
  const w = currentWord.value
  if (!w || !session.value) return ''
  return session.value.dir === 'zh2ko' ? w.zh : w.ko
})

export const answerText = computed(() => {
  const w = currentWord.value
  if (!w || !session.value) return ''
  if (session.value.dir === 'zh2ko') {
    const group = C.findSynonymGroup(state.words, w)
    if (group.length > 1) return group.map((g) => g.ko).join('、')
    return w.ko
  }
  return w.zh
})

export const isFinished = computed(() => !!session.value && session.value.index >= session.value.queueIds.length)

/** 输入框是否可用：未作答，或正在重做 */
export const canInput = computed(() => !!session.value && (!session.value.answered || session.value.retrying))

/* ---------------- 出题队列 ---------------- */

export function previewQueueSize() {
  return C.buildReviewQueue(state.words, state.settings, today(), { onlyErrors: onlyErrors.value }).length
}

export function startReview({ dir = 'zh2ko', style = 'type' } = {}) {
  const queue = C.buildReviewQueue(state.words, state.settings, today(), { onlyErrors: onlyErrors.value })
  if (!queue.length) { session.value = null; clearStorage(); return false }
  session.value = {
    queueIds: queue.map((w) => w.id),
    index: 0,
    dir,
    style,
    correct: 0,
    wrong: 0,
    newErrors: 0,
    answered: false,
    retrying: false,
    picked: null
  }
  feedback.value = null
  flipped.value = false
  prepareQuestion()
  saveStorage()
  return true
}

function resetQuestionState() {
  feedback.value = null
  flipped.value = false
  if (session.value) {
    session.value.answered = false
    session.value.retrying = false
    session.value.picked = null
  }
}

export function setDir(dir) {
  if (!session.value) return
  session.value.dir = dir
  resetQuestionState()
  prepareQuestion()
  saveStorage()
}

export function setStyle(style) {
  if (!session.value) return
  session.value.style = style
  resetQuestionState()
  prepareQuestion()
  saveStorage()
}

/* ---------------- 选择题选项 ---------------- */

function pickDistractors(correctWord, groupIds, n) {
  const field = session.value.dir === 'zh2ko' ? 'ko' : 'zh'
  const correctText = correctWord[field]
  const used = new Set([correctText])

  const candidates = state.words.filter((w) => {
    if (groupIds.has(w.id)) return false
    if (!w[field]) return false
    if (used.has(w[field])) return false
    return true
  })

  const sameTag = candidates.filter((w) => w.tags.some((t) => correctWord.tags.includes(t)))
  const rest = candidates.filter((w) => !sameTag.includes(w))

  const out = []
  const take = (arr, count) => {
    const pool = arr.slice()
    while (pool.length && out.length < count) {
      const i = Math.floor(Math.random() * pool.length)
      const w = pool.splice(i, 1)[0]
      if (used.has(w[field])) continue
      used.add(w[field])
      out.push(w)
    }
  }
  take(sameTag, n)
  take(rest, n)
  return out
}

export function prepareQuestion() {
  feedback.value = null
  flipped.value = false
  options.value = []
  if (!session.value || isFinished.value) return
  const w = currentWord.value
  if (!w) return

  if (session.value.style === 'choice') {
    const field = session.value.dir === 'zh2ko' ? 'ko' : 'zh'
    const group = C.findSynonymGroup(state.words, w)
    const groupIds = new Set(group.map((g) => g.id))
    const distractors = pickDistractors(w, groupIds, 3)
    const items = [
      { id: w.id, text: w[field], correct: true },
      ...distractors.map((d) => ({ id: d.id, text: d[field], correct: false }))
    ]
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const t = items[i]; items[i] = items[j]; items[j] = t
    }
    options.value = items
  }
}

/* ---------------- 作答 ---------------- */

function commit(correct, { keepStreak = false } = {}) {
  const item = currentWord.value
  if (!item || !session.value) return
  const wasError = !!item.isError
  const beforeStreak = item.correctStreak | 0

  const updated = C.applyAnswer(item, correct, today(), state.settings)
  if (keepStreak && correct) updated.correctStreak = beforeStreak
  updated.lastReviewedAt = today()
  updateWord(item.id, updated)

  recReviewed()
  if (correct) {
    session.value.correct++
    recCorrect()
  } else {
    session.value.wrong++
    if (!wasError) session.value.newErrors++
  }
  session.value.answered = true
  persist()
  saveStorage()
}

function scheduleAutoNext(delay) {
  clearTimeout(autoTimer)
  const d = delay != null ? delay : autoNextDelay.value
  if (!d) return
  autoTimer = setTimeout(() => nextQuestion(), d)
}

export function cancelAutoNext() {
  clearTimeout(autoTimer)
  autoTimer = null
}

export function submitTyped(text) {
  const s = session.value
  if (!s) return
  if (s.answered && !s.retrying) return

  if (!C.normalizeText(text)) {
    feedback.value = { kind: 'warn', text: '还没有输入答案哦，先写下你的答案再按回车', manual: false }
    return
  }

  const item = currentWord.value
  const isRetry = !!s.retrying

  let correct
  if (s.dir === 'zh2ko') {
    const group = C.findSynonymGroup(state.words, item)
    const inp = C.normalizeText(text)
    correct = group.some((g) => g.ko === inp)
  } else {
    correct = C.judgeAnswer(text, item.zh, s.dir)
  }

  if (!s.answered) commit(correct)

  const hasSyn = s.dir === 'zh2ko' && C.findSynonymGroup(state.words, item).length > 1

  if (correct) {
    // 重做答对与首次答对走同一套节奏：
    // 有同义词 → 展示所有写法并等回车；无同义词 → 按设置自动进入下一题
    if (hasSyn) {
      feedback.value = {
        kind: 'ok',
        text: (isRetry ? '这次答对了！' : '答对了！') + '所有写法：',
        strong: answerText.value,
        manual: true
      }
    } else {
      feedback.value = { kind: 'ok', text: isRetry ? '这次答对了！' : '答对了！', manual: false }
      scheduleAutoNext()
    }
    if (isRetry) s.retrying = false // 答对即结束重做：输入框禁用、回车进入下一题
  } else {
    // 答错不提供「下一题」入口 —— 必须重做到答对才能继续
    feedback.value = {
      kind: 'no',
      text: '正确答案：',
      strong: answerText.value,
      manual: false,
      note: isRetry ? '再试一次？' : '已加入错题库',
      appealable: !isRetry,
      retryHint: true
    }
  }
}

export function chooseOption(index) {
  const s = session.value
  if (!s) return
  if (s.answered && !s.retrying) return
  const opt = options.value[index]
  if (!opt) return

  const item = currentWord.value
  const group = C.findSynonymGroup(state.words, item)
  const field = s.dir === 'zh2ko' ? 'ko' : 'zh'
  const isRight = opt.correct || group.some((g) => g[field] === opt.text)
  const isRetry = !!s.retrying

  if (!s.answered) commit(isRight)
  s.picked = index
  saveStorage()

  if (isRight) {
    // 与打字模式一致：答对后按设置自动进入下一题（选择题不区分同义词）
    feedback.value = { kind: 'ok', text: isRetry ? '这次答对了！' : '答对了！', manual: false }
    scheduleAutoNext()
    if (isRetry) s.retrying = false // 答对即结束重做：选项重新禁用、回车进入下一题
  } else {
    // 与打字模式一致：答错不提供「下一题」，必须重选到正确
    feedback.value = {
      kind: 'no',
      text: '正确答案：',
      strong: answerText.value,
      manual: false,
      note: isRetry ? '再选一次？' : '已加入错题库',
      appealable: !isRetry,
      retryHint: true
    }
  }
}

/** 闪卡自评：again=不会 / hard=模糊 / good=会了 */
export function selfAssess(kind) {
  const s = session.value
  if (!s || s.answered) return
  if (kind === 'again') {
    commit(false)
    feedback.value = { kind: 'no', text: '已标记为「不会」，还会再出现', strong: answerText.value, manual: true, appealable: true }
  } else if (kind === 'hard') {
    commit(true, { keepStreak: true })
    feedback.value = { kind: 'warn', text: '标记为「模糊」：计入答对，但不推进错题进度', manual: true }
  } else {
    commit(true)
    feedback.value = { kind: 'ok', text: '标记为「会了」', manual: false }
    scheduleAutoNext(400)
  }
}

/** 重做本题：清空作答、恢复输入，但不撤销已经记录的判题结果。
 *  注意不要再拦 s.retrying —— 重做又答错时要能再次清空重来。 */
export function startRetry() {
  const s = session.value
  if (!s || !s.answered) return
  cancelAutoNext()
  s.retrying = true
  s.picked = null
  feedback.value = null
  flipped.value = false
  retryTick.value++
}

/* ---------------- 流程 ---------------- */

export function nextQuestion() {
  cancelAutoNext()
  const s = session.value
  if (!s) return
  s.index++
  s.answered = false
  s.retrying = false
  s.picked = null
  feedback.value = null
  saveStorage()
  if (!isFinished.value) prepareQuestion()
}

/** 回车键的统一行为
 *    未作答             → 提交判题
 *    重做中（已清空）    → 打字模式提交判题；选择题要重新选择，回车不跳题
 *    重做又答错         → 再清空一次，继续重做
 *    其余（重做答对 / 申诉后）→ 进入下一题
 */
export function handleEnter(typedText) {
  const s = session.value
  if (!s) return
  if (!s.answered) { submitTyped(typedText); return }
  if (s.style === 'flash') { nextQuestion(); return }

  if (s.retrying) {
    if (!feedback.value) {
      if (s.style === 'type') submitTyped(typedText)
      return
    }
    if (feedback.value.kind === 'no') { startRetry(); return }
    nextQuestion()
    return
  }

  if (feedback.value && feedback.value.kind === 'no') { startRetry(); return }
  nextQuestion()
}

export function restartReview() {
  if (!session.value) return
  const { dir, style } = session.value
  startReview({ dir, style })
}

export function exitReview() {
  cancelAutoNext()
  session.value = null
  feedback.value = null
  options.value = []
  clearStorage()
}

/** 申诉：把当前题目标记为答对（仅在首次判错时可用） */
export function appealCurrent() {
  const item = currentWord.value
  const s = session.value
  if (!item || !s) return
  if (!s.answered || !feedback.value || !feedback.value.appealable) return

  s.wrong = Math.max(0, s.wrong - 1)
  if (s.newErrors > 0) s.newErrors--
  s.correct++
  recCorrect()
  updateWord(item.id, { isError: false, errorSince: null, correctStreak: 0 })
  feedback.value = { kind: 'warn', text: '已按「我答对了」处理，该词不计入错题', manual: true, appealed: true }
  persist()
  saveStorage()
}

/* ---------------- 持久化 ---------------- */

function saveStorage() {
  try {
    if (!session.value) { localStorage.removeItem(SESSION_KEY); return }
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      queueIds: session.value.queueIds,
      index: session.value.index,
      dir: session.value.dir,
      style: session.value.style,
      correct: session.value.correct,
      wrong: session.value.wrong,
      newErrors: session.value.newErrors,
      answered: session.value.answered
    }))
  } catch (e) { /* 隐私模式等场景忽略 */ }
}

function clearStorage() {
  try { localStorage.removeItem(SESSION_KEY) } catch (e) { /* noop */ }
}

export function restoreFromStorage() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const d = JSON.parse(raw)
    if (!d || !Array.isArray(d.queueIds)) return false
    const ids = d.queueIds.filter((id) => !!findWord(id))
    if (!ids.length) return false
    session.value = {
      queueIds: ids,
      index: Math.max(0, d.index | 0),
      dir: d.dir || d.mode || 'zh2ko',
      style: d.style || 'type',
      correct: d.correct | 0,
      wrong: d.wrong | 0,
      newErrors: d.newErrors | 0,
      answered: !!d.answered,
      retrying: false,
      picked: null
    }
    if (session.value.answered) {
      session.value.answered = false
      session.value.index++
    }
    if (!isFinished.value) prepareQuestion()
    saveStorage()
    return true
  } catch (e) {
    return false
  }
}

export function hasSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return false
    const d = JSON.parse(raw)
    return !!(d && Array.isArray(d.queueIds) && d.queueIds.length)
  } catch (e) {
    return false
  }
}
