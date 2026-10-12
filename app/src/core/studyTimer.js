/**
 * 学习计时器（今日有效学习时长）。
 * 规则与旧版一致：仅前台且有操作时累计；后台或闲置 5 分钟自动暂停；每 5 秒持久化一次。
 */
import { ref } from 'vue'
import * as C from './core'
import { state, ensureDayLog, persist, today } from './appState'

export const timerRunning = ref(false)
export const timerSeconds = ref(C.dayLog(state.studyLog, today()).seconds)

const IDLE_LIMIT_MS = 5 * 60 * 1000
const IDLE_CHECK_MS = 30000
const TICK_PERSIST_EVERY = 5

let tickId = null
let idleId = null
let tickCount = 0
let lastActiveTs = 0
let bound = false

function refresh() {
  timerSeconds.value = C.dayLog(state.studyLog, today()).seconds
}

function tick() {
  if (!timerRunning.value) return
  const t = ensureDayLog()
  state.studyLog[t].seconds = (state.studyLog[t].seconds || 0) + 1
  tickCount++
  if (tickCount % TICK_PERSIST_EVERY === 0) persist()
  refresh()
}

function idleCheck() {
  if (timerRunning.value && Date.now() - lastActiveTs > IDLE_LIMIT_MS) pauseTimer()
}

export function startTimer() {
  if (timerRunning.value) return
  ensureDayLog()
  timerRunning.value = true
  lastActiveTs = Date.now()
  if (!tickId) tickId = setInterval(tick, 1000)
  if (!idleId) idleId = setInterval(idleCheck, IDLE_CHECK_MS)
  bindActivity()
}

export function pauseTimer() {
  if (!timerRunning.value) return
  timerRunning.value = false
  persist()
  if (tickId) { clearInterval(tickId); tickId = null }
  if (idleId) { clearInterval(idleId); idleId = null }
  refresh()
}

export function toggleTimer() {
  if (timerRunning.value) pauseTimer()
  else startTimer()
}

function bindActivity() {
  if (bound) return
  bound = true
  ;['mousemove', 'keydown', 'pointerdown', 'scroll'].forEach((ev) => {
    document.addEventListener(ev, () => { if (timerRunning.value) lastActiveTs = Date.now() }, { passive: true })
  })
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseTimer() })
}

export { refresh as refreshTimer }
