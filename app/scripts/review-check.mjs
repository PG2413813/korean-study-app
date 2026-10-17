/**
 * 复习答题节奏测试 —— 答错后的「重做」必须真正判题，且答对才能继续。
 *
 * 覆盖的行为（用户 2026-10-17 确认）：
 *   1) 答错后不再提供「下一题」入口，必须重做到答对；
 *   2) 重做时按回车 = 判题（修复前会直接跳到下一题，这才是要防的 bug）；
 *   3) 重做又答错 → 提示「再试一次」，可继续重做；
 *   4) 重做答对后：有同义词 → 展示所有写法、等用户按回车；无同义词 → 自动进入下一题；
 *   5) 重做不重复计入统计；
 *   6) 选择题模式同样处理，且重做期间按回车不会误跳题。
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

/** s1/s2 中文同为「学习」→ 互为一组同义词；n1/n2 无同义词 */
function makeSeed(autoNextDelay) {
  const mk = (id, ko, zh) => ({
    id, ko, zh, tags: [], createdAt: YESTERDAY,
    lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0
  })
  return {
    version: 1,
    settings: { roundSize: 20, removeAfter: 3, autoNextDelay },
    words: [
      mk('s1', '공부하다', '学习'),
      mk('s2', '배우다', '学习'),
      mk('n1', '날씨', '天气'),
      mk('n2', '아침', '早晨')
    ],
    studyLog: {}
  }
}

let pass = 0
let failCount = 0
const ok = (m) => { pass++; console.log('  ✓ ' + m) }
const fail = (m) => { failCount++; console.log('  ✗ ' + m) }
const check = (c, m) => (c ? ok(m) : fail(m))

const openDoms = []

async function boot(seed) {
  const errors = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', (e) => errors.push(e.message))
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse(w) { w.localStorage.setItem('hanStudyApp.v1', JSON.stringify(seed)) }
  })
  // 应用里有 setInterval（自动快照巡检），不关窗口 Node 不会退出
  openDoms.push(dom)
  await new Promise((r) => setTimeout(r, 500))
  return { window: dom.window, document: dom.window.document, errors }
}

function closeAll() {
  while (openDoms.length) {
    try { openDoms.pop().window.close() } catch (e) { /* noop */ }
  }
}

/** 把 window/document 包成一组便捷操作 */
function ctx(window, document, errors) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  const pressEnter = () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  const byText = (sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t))
  const setInput = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })) }
  const inputEl = () => document.querySelector('.q-input input')
  const fb = () => document.querySelector('.fb')
  const fbText = () => (document.querySelector('.fb')?.textContent || '').replace(/\s+/g, ' ').trim()
  const currentNo = () => {
    const m = document.querySelector('.qmode')?.textContent.match(/第\s*(\d+)\s*\//)
    return m ? Number(m[1]) : null
  }
  const hasBtn = (t) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(t))
  const pageText = () => document.querySelector('.content')?.textContent || ''
  const store = () => JSON.parse(window.localStorage.getItem('hanStudyApp.v1'))
  return { window, document, errors, wait, click, pressEnter, byText, setInput, inputEl, fb, fbText, currentNo, hasBtn, pageText, store }
}

/** 进入复习并开始；styleText 传「打字」/「选择题」 */
async function gotoReview(c, styleText) {
  c.click(c.byText('.nav-item', '单词复习'))
  await c.wait(500)
  if (styleText) {
    const card = c.byText('.mode-card', styleText)
    if (card) c.click(card)
    await c.wait(100)
  }
  c.click(c.byText('button', '开始复习'))
  await c.wait(500)
}

/** 打字模式：先答错 → 回车重做 → 输入 answer → 回车（重做判题）
 *  最后只等 120ms：够 Vue 渲染出反馈，又不会让 250ms 的自动跳转先发生。 */
async function wrongThenRetry(c, answer) {
  c.setInput(c.inputEl(), '故意答错')
  await c.wait(60)
  c.pressEnter()
  await c.wait(250)
  c.pressEnter()
  await c.wait(250)
  c.setInput(c.inputEl(), answer)
  await c.wait(60)
  c.pressEnter()
  await c.wait(120)
}

/* ================= 1. 打字模式：重做必须判题 ================= */
console.log('— 1. 打字模式：答错后重做要判题，答对才能继续 —')
{
  const { window: w, document, errors } = await boot(makeSeed(0))
  const c = ctx(w, document, errors)
  await gotoReview(c, '打字')

  check(!!c.document.querySelector('.qcard'), '进入答题界面')
  check(!!c.inputEl() && c.inputEl().disabled === false, '输入框可用')

  // 首次答错
  c.setInput(c.inputEl(), '틀린답')
  await c.wait(60)
  c.pressEnter()
  await c.wait(250)
  check(c.fb()?.className.includes('no'), '首次答错')
  check(!c.hasBtn('下一题'), '答错后【没有】「下一题」按钮（必须答对才能继续）')
  check(!!c.byText('button', '重做本题'), '有「重做本题」按钮')

  const reviewed0 = c.store().studyLog[TODAY].reviewed

  // 回车 → 进入重做
  c.pressEnter()
  await c.wait(250)
  check(!!c.inputEl() && c.inputEl().disabled === false, '回车后进入重做（输入框重新可用）')
  check(c.inputEl().value === '', '重做时输入框已清空')
  check(!c.fb(), '重做时上一次的判题提示已清除')

  const at = c.currentNo()

  // ★ 核心：重做时按回车必须判题，而不是跳题
  c.setInput(c.inputEl(), '还是错的')
  await c.wait(60)
  c.pressEnter()
  await c.wait(250)
  check(c.currentNo() === at, '重做按回车【不会跳题】，仍在第 ' + at + ' 题')
  check(c.fb()?.className.includes('no'), '重做的答案被真正判定了（判为错误）')
  check(/再试一次/.test(c.fbText()), '提示「再试一次」：' + c.fbText())
  check(!c.hasBtn('下一题'), '重做答错同样不出现「下一题」')

  // 再回车 → 继续重做
  c.pressEnter()
  await c.wait(250)
  check(!!c.inputEl() && c.inputEl().disabled === false && c.inputEl().value === '',
    '再按回车可继续重做（输入框再次清空可用）')

  // 重做答对
  c.setInput(c.inputEl(), '공부하다')
  await c.wait(60)
  c.pressEnter()
  await c.wait(250)
  check(c.fb()?.className.includes('ok'), '重做答对')
  check(/这次答对了/.test(c.fbText()), '反馈显示「这次答对了」：' + c.fbText())
  check(c.inputEl().disabled === true, '答对后输入框禁用')
  check(c.currentNo() === at, 'delay=0 时不自动跳转，停在本题（第 ' + at + ' 题）')

  check(c.store().studyLog[TODAY].reviewed === reviewed0,
    '重做不重复计入复习数（' + reviewed0 + ' → ' + c.store().studyLog[TODAY].reviewed + '）')
  check(c.store().words.filter((x) => x.isError).length === 1, '重做不会重复改动错题状态')
  check(errors.length === 0, '运行期间无报错')
}

/* ================= 2. 重做答对后的去向 ================= */
console.log('')
console.log('— 2. 重做答对后：有同义词等回车，无同义词自动跳 —')
{
  const { window: w, document, errors } = await boot(makeSeed(250))
  const c = ctx(w, document, errors)
  await gotoReview(c, '打字')

  // Q1 = s1（中文「学习」，与 s2 同义）
  await wrongThenRetry(c, '공부하다')
  check(c.fb()?.className.includes('ok'), 'Q1 重做答对')
  check(/所有写法/.test(c.fbText()), '有同义词 → 展示所有写法：' + c.fbText())
  const at1 = c.currentNo()
  await c.wait(600)
  check(c.currentNo() === at1, '有同义词 → 不自动跳转（仍在第 ' + at1 + ' 题）')
  c.pressEnter()
  await c.wait(300)
  check(c.currentNo() === at1 + 1, '按回车进入下一题（' + at1 + ' → ' + c.currentNo() + '）')

  // Q2 = s2（同样有同义词）
  await wrongThenRetry(c, '배우다')
  await c.wait(600)
  const at2 = c.currentNo()
  check(at2 === at1 + 1, '同义词题不自动跳，仍停在第 ' + at2 + ' 题')
  c.pressEnter()
  await c.wait(300)

  // Q3 = n1（无同义词）→ 重做答对后应自动进入下一题
  const at3 = c.currentNo()
  check(at3 === at2 + 1, '进入第 ' + at3 + ' 题')
  await wrongThenRetry(c, '날씨')
  check(c.fb()?.className.includes('ok'), 'Q3（无同义词）重做答对')
  await c.wait(650)
  check(c.currentNo() === at3 + 1, '无同义词 → 自动进入下一题（' + at3 + ' → ' + c.currentNo() + '）')
  check(errors.length === 0, '运行期间无报错')
}

/* ================= 3. 选择题模式 ================= */
console.log('')
console.log('— 3. 选择题模式：同样处理 —')
{
  const { window: w, document, errors } = await boot(makeSeed(250))
  const c = ctx(w, document, errors)
  await gotoReview(c, '选择题')

  const opts = () => [...c.document.querySelectorAll('.opt')]
  check(!!c.document.querySelector('.opts'), '进入选择题界面')
  check(opts().length >= 2, '出现 ' + opts().length + ' 个选项')

  // 选一个错的（Q1 = s1，正确项文本为 공부하다）
  const wrongIdx = opts().findIndex((o) => !o.textContent.includes('공부하다'))
  c.click(opts()[wrongIdx])
  await c.wait(250)
  check(c.fb()?.className.includes('no'), '选择题选错')
  check(!c.hasBtn('下一题'), '选择题答错后同样没有「下一题」')
  check(opts().every((o) => o.disabled), '答错后选项被禁用')

  const at = c.currentNo()
  c.pressEnter()
  await c.wait(250)
  check(opts().every((o) => !o.disabled), '回车后进入重做，选项重新可选')
  check(c.currentNo() === at, '重做期间按回车【不会跳题】（仍在第 ' + at + ' 题）')
  c.pressEnter()
  await c.wait(250)
  check(c.currentNo() === at, '重做期间再按回车仍不会跳题（选择题必须重新选）')

  // 重做选对（等 120ms 看反馈，避免 250ms 的自动跳转抢先）
  const rightIdx = opts().findIndex((o) => o.textContent.includes('공부하다'))
  c.click(opts()[rightIdx])
  await c.wait(120)
  check(c.fb()?.className.includes('ok'), '重做选对')
  check(/这次答对了/.test(c.fbText()), '反馈显示「这次答对了」')
  check(opts().every((o) => o.disabled), '答对后选项再次禁用')
  await c.wait(650)
  check(c.currentNo() === at + 1, '选择题重做答对后自动进入下一题（' + at + ' → ' + c.currentNo() + '）')
  check(errors.length === 0, '运行期间无报错')
}

console.log('')
closeAll()
console.log(failCount === 0
  ? `✅ 复习节奏测试全部通过（${pass} 项）`
  : `❌ 复习节奏测试失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exitCode = failCount === 0 ? 0 : 1
