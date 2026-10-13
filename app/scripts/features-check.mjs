/**
 * 功能测试：本轮 4 个细节改动的回归验证（jsdom）
 *   1) 主题变量挂在 <html> 上 —— 弹窗（Teleport 到 body）也能取到主题色
 *   2) 每日学习录入支持编辑
 *   3) 图片素材可切换/上传；清空数据必须两次确认
 *   4) 学习数据每天自动保存一次，只保留最近 2 天
 *
 * 弹窗按钮「看得见」（背景不是透明）属于渲染问题，jsdom 测不出，
 * 由 scripts/visual-check.mjs 在真实浏览器里断言。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../../tests/package.json'))
const { JSDOM, VirtualConsole } = require('jsdom')

const APP = path.resolve(here, '../../韩语学习记录.html')
const html = fs.readFileSync(APP, 'utf8')

let pass = 0
let failCount = 0
function ok(m) { pass++; console.log('  ✓ ' + m) }
function fail(m) { failCount++; console.log('  ✗ ' + m) }
const check = (c, m) => (c ? ok(m) : fail(m))

/* ---------------- 工具 ---------------- */
function todayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
function offset(base, n) {
  const d = new Date(base + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return todayKey(d)
}
const TODAY = todayKey()

const SEED_WORDS = [
  { id: 'w1', ko: '공부하다', zh: '学习', tags: ['动词'], createdAt: TODAY, lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 },
  { id: 'w2', ko: '날씨', zh: '天气', tags: ['名词'], createdAt: offset(TODAY, -1), lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0 }
]

const openDoms = []

async function boot({ snapshots } = {}) {
  const errors = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', (e) => errors.push(e.message))
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/',
    virtualConsole: vc,
    beforeParse(window) {
      window.localStorage.setItem('hanStudyApp.v1', JSON.stringify({
        version: 1, settings: { roundSize: 20, removeAfter: 3 }, words: SEED_WORDS, studyLog: {}
      }))
      if (snapshots) window.localStorage.setItem('hanStudyApp.snapshots.v1', JSON.stringify(snapshots))
    }
  })
  // 应用里有 setInterval（自动快照巡检），不关掉窗口 Node 会一直不退出，
  // 输出缓冲也会在超时被杀时丢掉。
  openDoms.push(dom)
  await new Promise((r) => setTimeout(r, 500))
  return { dom, window: dom.window, document: dom.window.document, errors }
}

function closeAll() {
  while (openDoms.length) {
    const d = openDoms.pop()
    try { d.window.close() } catch (e) { /* noop */ }
  }
}

const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
const pageText = (document) => document.querySelector('.content')?.textContent || ''
const byText = (document, sel, t) => [...document.querySelectorAll(sel)].find((e) => e.textContent.includes(t))

function navTo(w, document, label) {
  const btn = byText(document, '.nav-item', label)
  if (!btn) throw new Error('找不到导航：' + label)
  click(w, btn)
}

function modalButtons(document) {
  return [...document.querySelectorAll('.modal .btn')]
}
function modalTitle(document) {
  return document.querySelector('.modal h3')?.textContent.trim() || ''
}

/* ================= 1. 主题变量挂载点 ================= */
console.log('— 1. 主题变量挂在 <html>（弹窗按钮才能取到主题色）—')
{
  const { window: w, document, errors } = await boot()
  const root = document.documentElement
  check(root.getAttribute('data-theme') === 'green', '<html> 上有 data-theme=green', String(root.getAttribute('data-theme')))
  check(!document.querySelector('.app')?.hasAttribute('data-theme'), '不再挂在 .app 上（避免只覆盖组件内部）')

  // 弹窗宿主是 Teleport 到 body 的，必须是 <html> 的后代才能继承主题变量
  const body = document.body
  check(root.contains(body), 'body 是 <html> 的后代 —— 弹窗能继承主题变量')

  // 切主题，验证 <html> 上的属性跟着变
  navTo(w, document, '数据与设置')
  await new Promise((r) => setTimeout(r, 500))
  const darkPill = byText(document, '.page .pill', '深色')
  check(!!darkPill, '找到「深色」主题按钮')
  if (darkPill) {
    click(w, darkPill)
    await new Promise((r) => setTimeout(r, 300))
    check(root.getAttribute('data-theme') === 'dark', '切换后 <html> 变为 data-theme=dark', String(root.getAttribute('data-theme')))
  }
  check(errors.length === 0, '运行期间无报错', errors.slice(0, 2).join(' | '))
}

/* ================= 2. 每日学习录入可编辑 ================= */
console.log('')
console.log('— 2. 每日学习录入支持编辑 —')
{
  const { window: w, document, errors } = await boot()
  navTo(w, document, '每日学习录入')
  await new Promise((r) => setTimeout(r, 500))

  const rows = [...document.querySelectorAll('.list .row')]
  check(rows.length === 1, '今日已录只有今天录入的 1 条', '实际 ' + rows.length)

  const editBtn = rows[0] && byText(document, '.list .row .ops .btn', '编辑')
  check(!!editBtn, '今日已录的条目有「编辑」按钮')
  if (editBtn) {
    click(w, editBtn)
    await new Promise((r) => setTimeout(r, 300))
    check(modalTitle(document) === '编辑单词', '点编辑后弹出「编辑单词」', modalTitle(document))
    const koInput = document.querySelector('.modal input')
    check(!!koInput && koInput.value === '공부하다', '弹窗里已带出原值：' + (koInput ? koInput.value : ''))

    // 改中文释义后保存，验证落库
    const inputs = document.querySelectorAll('.modal input')
    inputs[1].value = '学习、学问'
    inputs[1].dispatchEvent(new w.Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 100))
    const saveBtn = byText(document, '.modal .btn', '保存')
    check(!!saveBtn, '弹窗里有「保存」按钮')
    if (saveBtn) {
      click(w, saveBtn)
      await new Promise((r) => setTimeout(r, 400))
      const stored = JSON.parse(w.localStorage.getItem('hanStudyApp.v1'))
      const saved = stored.words.find((x) => x.id === 'w1')
      check(saved && saved.zh === '学习、学问', '保存后写入 localStorage：' + (saved ? saved.zh : ''))
    }
  }
  check(errors.length === 0, '运行期间无报错', errors.slice(0, 2).join(' | '))
}

/* ================= 3. 图片素材 + 两次确认清空 ================= */
console.log('')
console.log('— 3. 图片素材与二次确认 —')
{
  const { window: w, document, errors } = await boot()
  navTo(w, document, '数据与设置')
  await new Promise((r) => setTimeout(r, 500))
  const txt = pageText(document)

  check(txt.includes('图片素材'), '设置页有「图片素材」区块')
  check(!txt.includes('已自动跳过重复文件'), '已移除原有的张数统计内容')
  check(!txt.includes('400 个探测请求'), '已移除原有的说明文字')

  check(txt.includes('页面背景') && txt.includes('偶像小卡'), '有「页面背景」与「偶像小卡」两组')
  check(!!byText(document, '.page .pill', '跟随每日轮换'), '有「跟随每日轮换」按钮')
  check(!!byText(document, '.page .pill', '固定一张'), '有「固定一张」按钮')
  check(!!byText(document, '.page .btn', '上传本地图片'), '有「上传本地图片」入口')
  check(document.querySelectorAll('input[type="file"][accept="image/*"]').length === 2, '背景与小卡各有 1 个图片选择器')

  // 切到「固定一张」应出现下拉选择
  const fixedBtn = [...document.querySelectorAll('.page .pill')].find((b) => b.textContent.trim().startsWith('固定一张'))
  click(w, fixedBtn)
  await new Promise((r) => setTimeout(r, 300))
  const selects = [...document.querySelectorAll('.page select')]
  check(selects.length >= 1, '选择「固定一张」后出现图片下拉框')
  if (selects[0]) {
    const opt = [...selects[0].options].find((o) => o.value)
    if (opt) {
      selects[0].value = opt.value
      selects[0].dispatchEvent(new w.Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 300))
      const stored = JSON.parse(w.localStorage.getItem('hanStudyApp.v1'))
      check(stored.settings.bg && stored.settings.bg.pick === opt.value,
        '选择后写入 settings.bg.pick = ' + opt.value, JSON.stringify(stored.settings.bg))
    }
  }

  // 两次确认：取消 → 数据还在
  const clearBtn = byText(document, '.page .btn', '清空全部学习数据')
  check(!!clearBtn, '有「清空全部学习数据」按钮')
  click(w, clearBtn)
  await new Promise((r) => setTimeout(r, 300))
  check(modalTitle(document) === '清空全部学习数据', '第一次确认弹窗出现', modalTitle(document))
  click(w, byText(document, '.modal .btn', '取消'))
  await new Promise((r) => setTimeout(r, 300))
  check(!document.querySelector('.modal'), '取消后弹窗关闭')
  check(JSON.parse(w.localStorage.getItem('hanStudyApp.v1')).words.length === 2, '取消不会清空数据')

  // 两次确认：继续 → 第二次确认 → 确认清空
  click(w, clearBtn)
  await new Promise((r) => setTimeout(r, 300))
  check(modalTitle(document) === '清空全部学习数据', '再次点开第一次确认')
  click(w, byText(document, '.modal .btn', '继续'))
  await new Promise((r) => setTimeout(r, 300))
  check(/再次确认/.test(modalTitle(document)), '出现第二次确认弹窗：' + modalTitle(document))
  check(JSON.parse(w.localStorage.getItem('hanStudyApp.v1')).words.length === 2, '只点一次「继续」不会清空')

  click(w, byText(document, '.modal .btn', '确认清空'))
  await new Promise((r) => setTimeout(r, 400))
  check(JSON.parse(w.localStorage.getItem('hanStudyApp.v1')).words.length === 0, '两次确认后才真正清空')
  check(w.localStorage.getItem('hanStudyApp.snapshots.v1') === null, '自动保存的快照一并清掉')
  check(errors.length === 0, '运行期间无报错', errors.slice(0, 2).join(' | '))
}

/* ================= 4. 每天自动保存，保留 2 天 ================= */
console.log('')
console.log('— 4. 学习数据自动保存 —')
{
  const { window: w, document, errors } = await boot()
  const raw = w.localStorage.getItem('hanStudyApp.snapshots.v1')
  check(!!raw, '打开应用时自动生成快照')
  if (raw) {
    const store = JSON.parse(raw)
    check(!!store[TODAY], '快照按日期归档：' + TODAY, Object.keys(store).join('、'))
    const snap = store[TODAY]
    check(!!snap.savedAt, '记录保存时间：' + snap.savedAt)
    check(snap.data && Array.isArray(snap.data.words) && snap.data.words.length === 2, '快照内含 2 个单词')
    check(snap.data && !!snap.data.studyLog, '快照内含学习记录')
    check(!snap.data.settings.bg || !snap.data.settings.bg.custom, '快照不含上传的自定义图片（体积太大）')
  }

  navTo(w, document, '数据与设置')
  await new Promise((r) => setTimeout(r, 500))
  const txt = pageText(document)
  check(txt.includes('学习数据自动保存'), '设置页有「学习数据自动保存」区块')
  check(/保留最近\s*2\s*天/.test(txt), '说明里写明保留 2 天')
  check(txt.includes('最近一次保存'), '显示最近一次保存时间')
  check(txt.includes('当前保留'), '显示当前保留份数')
  const keepRow = document.querySelector('.page .list .row .ko')
  check(!!keepRow && keepRow.textContent.includes(TODAY), '列出了今天的快照：' + (keepRow ? keepRow.textContent : ''))
  check(!!byText(document, '.page .btn', '立即保存一份'), '有「立即保存一份」按钮')
  check(errors.length === 0, '运行期间无报错', errors.slice(0, 2).join(' | '))
}

console.log('')
console.log('— 4b. 到期自动删除（只保留今天与昨天）—')
{
  // 预置：3 天前 + 昨天 + 今天 的快照，启动后应只剩最近 2 天
  const seeded = {
    [offset(TODAY, -3)]: { savedAt: offset(TODAY, -3) + 'T00:00:00.000Z', data: { version: 1, settings: {}, words: [], studyLog: {} } },
    [offset(TODAY, -1)]: { savedAt: offset(TODAY, -1) + 'T00:00:00.000Z', data: { version: 1, settings: {}, words: [], studyLog: {} } }
  }
  const { window: w } = await boot({ snapshots: seeded })
  const store = JSON.parse(w.localStorage.getItem('hanStudyApp.snapshots.v1') || '{}')
  const dates = Object.keys(store).sort()
  check(!store[offset(TODAY, -3)], '3 天前的快照已被自动删除')
  check(!!store[offset(TODAY, -1)], '昨天的快照保留')
  check(!!store[TODAY], '今天的快照已补上')
  check(dates.length === 2, '当前共保留 2 份', dates.join('、'))
}

/* ================= 5. 合并录入计入今日新录入 ================= */
console.log('')
console.log('— 5. 合并后的单词计入「今日新录入」—')
{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const { window: w, document, errors } = await boot()
  navTo(w, document, '每日学习录入')
  await wait(500)

  // 种子：w1 = 공부하다（今天录的）、w2 = 날씨（昨天录的）
  check(document.querySelectorAll('.list .row').length === 1, '合并前「今日已录」只有 1 条')

  // 录入一个「昨天录过」的词 → 触发重复
  const ins = [...document.querySelectorAll('.page .panel.toolbar input')]
  ins[0].value = '날씨'
  ins[0].dispatchEvent(new w.Event('input', { bubbles: true }))
  ins[1].value = '气候'
  ins[1].dispatchEvent(new w.Event('input', { bubbles: true }))
  await wait(80)
  click(w, byText(document, '.page .btn.primary', '添加'))
  await wait(400)

  check(modalTitle(document) === '该单词已存在', '弹出「该单词已存在」', modalTitle(document))
  const mergeBtn = modalButtons(document).find((b) => b.textContent.includes('合并'))
  check(!!mergeBtn, '弹窗里有「合并」按钮')

  if (mergeBtn) {
    click(w, mergeBtn)
    await wait(400)

    const saved = JSON.parse(w.localStorage.getItem('hanStudyApp.v1'))
    const log = saved.studyLog[TODAY] || {}
    const merged = saved.words.find((x) => x.id === 'w2')

    check((log.added || 0) === 1, '今日新录入 +1（实际 added=' + (log.added || 0) + '）')
    check(!!merged && merged.createdAt === TODAY,
      '被合并的词录入日期改为今天（实际 ' + (merged && merged.createdAt) + '）')
    check(!!merged && merged.zh.indexOf('气候') >= 0,
      '新释义已合并进去（' + (merged && merged.zh) + '）')
    check(document.querySelectorAll('.list .row').length === 2,
      '合并后出现在「今日已录」清单里（' + document.querySelectorAll('.list .row').length + ' 条）')
  }
  check(errors.length === 0, '运行期间无报错', errors.slice(0, 2).join(' | '))
}

console.log('')
console.log('— 5b. 合并「今天已录」的词不重复计数 —')
{
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const { window: w, document } = await boot()
  navTo(w, document, '每日学习录入')
  await wait(500)

  const ins = [...document.querySelectorAll('.page .panel.toolbar input')]
  ins[0].value = '공부하다' // w1，本身就是今天录的
  ins[0].dispatchEvent(new w.Event('input', { bubbles: true }))
  ins[1].value = '用功'
  ins[1].dispatchEvent(new w.Event('input', { bubbles: true }))
  await wait(80)
  click(w, byText(document, '.page .btn.primary', '添加'))
  await wait(400)

  const mergeBtn = modalButtons(document).find((b) => b.textContent.includes('合并'))
  check(!!mergeBtn, '今天已录的词再次录入同样提示重复')
  if (mergeBtn) {
    click(w, mergeBtn)
    await wait(400)
    const saved = JSON.parse(w.localStorage.getItem('hanStudyApp.v1'))
    const log = saved.studyLog[TODAY] || {}
    const w1 = saved.words.find((x) => x.id === 'w1')
    check((log.added || 0) === 0, '本来就是今天录的 → 不重复计数（实际 added=' + (log.added || 0) + '）')
    check(!!w1 && w1.zh.indexOf('用功') >= 0, '释义仍正常合并（' + (w1 && w1.zh) + '）')
  }
}

console.log('')
closeAll()
console.log(failCount === 0
  ? `✅ 功能测试全部通过（${pass} 项）`
  : `❌ 功能测试失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exitCode = failCount === 0 ? 0 : 1
