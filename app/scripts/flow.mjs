/**
 * 流程测试：端到端跑一遍「录入 → 复习 → 判题 → 进错题库 → 小结」，
 * 并重点验证本次的答题节奏改动（问题 4）：
 *   答错后按回车 = 重做本题（不重复计数）；
 *   点过「我答对了」后按回车 = 进入下一题；
 *   答对后按回车 = 进入下一题。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../../tests/package.json'))
const { JSDOM, VirtualConsole } = require('jsdom')

const FILE = path.resolve(here, '../../韩语学习记录.html')
const html = fs.readFileSync(FILE, 'utf8')

function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function offset(base, n) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayKey(d)
}

const TODAY = todayKey()
const YESTERDAY = offset(TODAY, -1)

const MAP = { '学习': '공부하다', '运动': '운동하다', '天气': '날씨' }

const seed = {
  version: 1,
  settings: { roundSize: 20, removeAfter: 3, autoNextDelay: 0 },
  words: [
    { id: 'w1', ko: '공부하다', zh: '学习', tags: ['动词'], createdAt: YESTERDAY, lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
    { id: 'w2', ko: '운동하다', zh: '运动', tags: ['动词'], createdAt: YESTERDAY, lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
    { id: 'w3', ko: '날씨', zh: '天气', tags: ['名词'], createdAt: YESTERDAY, lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
    { id: 'w4', ko: '아침', zh: '早晨', tags: ['名词'], createdAt: TODAY, lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
  ],
  studyLog: { [YESTERDAY]: { added: 3, reviewed: 0, correct: 0, seconds: 0 } }
}

let pass = 0
let failCount = 0
function ok(m) { pass++; console.log('  ✓ ' + m) }
function fail(m) { failCount++; console.log('  ✗ ' + m) }
function check(cond, m) { cond ? ok(m) : fail(m) }

const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push(e.message))

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc,
  beforeParse(window) {
    window.localStorage.setItem('hanStudyApp.v1', JSON.stringify(seed))
  }
})

const { window } = dom
const { document } = window
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
const pressEnter = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
const byText = (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t))

function setInput(el, value) {
  el.value = value
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}
function navTo(label) {
  const btn = byText('.nav-item', label)
  if (!btn) throw new Error('找不到导航：' + label)
  click(btn)
}
const store = () => JSON.parse(window.localStorage.getItem('hanStudyApp.v1'))
function promptText() { return document.querySelector('.q-prompt')?.textContent.replace('🔊', '').trim() }
function currentNo() {
  const m = document.querySelector('.qmode')?.textContent.match(/第\s*(\d+)\s*\/\s*(\d+)/)
  return m ? { now: Number(m[1]), total: Number(m[2]) } : null
}
const inputEl = () => document.querySelector('.q-input input')
/* 只取渲染区域文本：内联脚本在 <body> 里，用 body.textContent 会把 JS 源码也算进去 */
const pageText = () => document.querySelector('.content')?.textContent || ''

await wait(500)

console.log('— 首页统计 —')
check(pageText().includes('今日待复习'), '首页显示今日待复习')
check(document.querySelectorAll('.cards .card').length === 3, '首页三张统计卡（旧版版式）')

console.log('— 进入复习 —')
navTo('单词复习')
await wait(600)
click(byText('button', '开始复习'))
await wait(600)

check(!!document.querySelector('.qcard'), '进入答题界面（旧版 qcard 大卡）')
const p1 = promptText()
check(!!p1, '出现题干：' + p1)
check(!pageText().includes('아침'), '今天录入的单词今天不出现在复习池')
check(inputEl() && !inputEl().disabled, '输入框可用')

/* ===== 问题 4-A：答错后按回车 = 重做本题 ===== */
console.log('— 问题 4-A：答错后回车重做 —')
setInput(inputEl(), '틀린답')
await wait(60)
click(byText('button', '提交'))
await wait(200)

check(document.querySelector('.fb')?.className.includes('no'), '判为答错')
check(inputEl().disabled === true, '答错后输入框禁用')
check(!!byText('button', '我答对了'), '出现「我答对了」申诉按钮')
check(!!byText('button', '重做本题'), '出现「重做本题」按钮')

const reviewedAfterWrong = store().studyLog[TODAY].reviewed
const errAfterWrong = store().words.filter((w) => w.isError).length
check(errAfterWrong === 1, '错题库新增 1 个（实际 ' + errAfterWrong + '）')

pressEnter()
await wait(300)
check(inputEl() && inputEl().disabled === false, '按回车后输入框重新可用（进入重做）')
check(inputEl().value === '', '重做时输入框已清空')
check(!document.querySelector('.fb'), '重做时上一题的判题提示已清除')
check(promptText() === p1, '重做的是同一道题')

/* 重做并答对：不应重复计入统计 */
setInput(inputEl(), MAP[p1] || '')
await wait(60)
click(byText('button', '提交'))
await wait(200)
check(document.querySelector('.fb')?.className.includes('ok'), '重做后答对')
check(store().studyLog[TODAY].reviewed === reviewedAfterWrong,
  '重做不重复计入复习数（' + reviewedAfterWrong + ' → ' + store().studyLog[TODAY].reviewed + '）')
check(store().words.filter((w) => w.isError).length === 1, '重做不会重复修改错题状态')

/* ===== 问题 4-B：答对后按回车 = 下一题 ===== */
console.log('— 问题 4-B：答对后回车进入下一题 —')
const before = currentNo()
pressEnter()
await wait(300)
const after = currentNo()
check(after && before && after.now === before.now + 1, '回车后进入下一题（' + before.now + ' → ' + (after ? after.now : '?') + '）')

/* ===== 问题 4-C：申诉后按回车 = 下一题，且撤销错题 ===== */
console.log('— 问题 4-C：申诉后回车进入下一题 —')
const p2 = promptText()
setInput(inputEl(), '还是错的')
await wait(60)
click(byText('button', '提交'))
await wait(200)
check(document.querySelector('.fb')?.className.includes('no'), '第二题判错')

const errBefore = store().words.filter((w) => w.isError).length
click(byText('button', '我答对了'))
await wait(300)
check(document.querySelector('.fb')?.className.includes('warn'), '申诉后反馈变为「已按我答对了处理」')
check(store().words.filter((w) => w.isError).length === errBefore - 1, '申诉撤销了该词的错题标记')
check(promptText() === p2, '申诉本身不会跳到下一题')

const beforeC = currentNo()
pressEnter()
await wait(300)
const afterC = currentNo()
check(afterC && beforeC && afterC.now === beforeC.now + 1,
  '申诉后回车进入下一题（' + beforeC.now + ' → ' + (afterC ? afterC.now : '?') + '）')

/* ===== 收尾：走完小结 ===== */
console.log('— 走到小结 —')
for (let i = 0; i < 20; i++) {
  if (pageText().includes('本轮小结')) break
  // 未作答的题要先填答案，否则回车只会提示「还没有输入答案」
  const inp = inputEl()
  if (inp && !inp.disabled) {
    setInput(inp, MAP[promptText()] || '不知道')
    await wait(80)
  }
  pressEnter()
  await wait(300)
}
check(pageText().includes('本轮小结'), '走到本轮小结')
check(pageText().includes('新增错题'), '小结显示新增错题')
check(store().studyLog[TODAY].reviewed >= 2, '复习数已回写今日学习记录')

/* 关掉 jsdom 窗口：应用内有 setInterval（自动快照巡检），
   不关窗口 Node 会一直挂着，进程会被超时杀掉、输出也拿不到。 */
try { dom.window.close() } catch (e) { /* noop */ }

console.log('')
if (errors.length) {
  console.log('运行时报错：')
  errors.slice(0, 5).forEach((e) => console.log('  ' + String(e).slice(0, 160)))
}
console.log(failCount === 0
  ? `✅ 流程测试全部通过（${pass} 项）`
  : `❌ 流程测试失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exitCode = failCount === 0 ? 0 : 1
