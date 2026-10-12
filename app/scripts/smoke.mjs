/**
 * 冒烟测试：把构建好的单文件 HTML 真正跑起来（jsdom），
 * 确认 Vue 能挂载、页面能渲染、导航能切换，并校验本次的几项修复。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(path.resolve(here, '../../tests/package.json'))
const { JSDOM, VirtualConsole } = require('jsdom')

const FILE = process.argv[2] || path.resolve(here, '../../韩语学习记录.html')
const html = fs.readFileSync(FILE, 'utf8')

const errors = []
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => errors.push(e.message))

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  virtualConsole: vc
})

const { window } = dom
const { document } = window
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let failCount = 0
function ok(m) { pass++; console.log('  ✓ ' + m) }
function fail(m) { failCount++; console.log('  ✗ ' + m) }
function check(cond, m) { cond ? ok(m) : fail(m) }
function click(el) { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) }
function navTo(label) {
  const btn = [...document.querySelectorAll('.nav-item')].find((b) => b.textContent.includes(label))
  if (!btn) throw new Error('找不到导航：' + label)
  click(btn)
}
function computed(el, prop) {
  try { return window.getComputedStyle(el).getPropertyValue(prop).trim() } catch (e) { return '' }
}
/* 只取渲染出来的内容区文本。注意不能用 document.body.textContent —— 内联脚本在 <body> 里，
   会把 JS 源码也当成文本，导致断言被误判为通过。 */
const pageText = () => document.querySelector('.content')?.textContent || ''

await wait(500)

console.log('— 挂载 —')
if (errors.length) errors.slice(0, 3).forEach((e) => console.log('    运行时错误：' + String(e).slice(0, 160)))

const app = document.querySelector('#app')
check(!!app && app.children.length > 0, 'Vue 已挂载到 #app')
check(!!document.querySelector('.sidebar'), '侧栏已渲染')
check(document.querySelectorAll('.nav-item').length === 7, '导航 7 项齐全')
check(document.querySelectorAll('.tabbar .tab-item').length === 6, '底部 Tab 已渲染')

/* ============ 问题 5：旧版小标语（招呼语） ============ */
console.log('— 问题 5：招呼语小标语 —')
const greet = document.querySelector('.topbar .greet')
const gsub = document.querySelector('.topbar .gsub')
const datePill = document.querySelector('.topbar .date')
check(!!greet && greet.textContent.includes('今天也要加油学习 ✦'), '顶栏招呼语「…今天也要加油学习 ✦」已恢复')
check(!!greet && !!greet.querySelector('.kr'), '韩语问候使用 .kr 渐变字')
check(!!gsub && /今日待复习\s*\d+\s*个单词，开始吧~/.test(gsub.textContent), '小标语「今日待复习 N 个单词，开始吧~」已恢复')
check(!!datePill && /\d{4}-\d{2}-\d{2}\s*·\s*星期/.test(datePill.textContent.trim()), '右侧日期胶囊已恢复')

/* ============ 问题 1：旧版 UI 风格 ============ */
/* 说明：jsdom 不会解析 CSS 变量（getComputedStyle 会原样返回 var(--x)），
   构建产物里的颜色也会被压成 #ffffff8c 之类，所以这里只做「结构 + 产物文本」层面的确认，
   逐条取值的一致性由 scripts/style-check.mjs 负责。 */
console.log('— 问题 1：旧版玻璃风格 —')
check(!!document.querySelector('.card'), '存在 .card（旧版卡片/面板）')
check(!!document.querySelector('.brand-mark'), '侧栏 logo = 旧版的圆点 .brand-mark')
const foot = document.querySelector('.sidebar-foot')
check(!!foot && foot.textContent.includes('每天一点点'), '侧栏落款「매일 조금씩 … 每天一点点」已恢复')
check(!!document.querySelector('.cards'), '首页使用旧版 .cards 统计卡行')
check(document.querySelectorAll('.cards .card .num').length === 3, '三张统计卡都用 .num（旧版 46px 渐变数字）')
check([...document.querySelectorAll('.nav-item .em')].some((e) => e.textContent.includes('🏠')), '导航恢复旧版 emoji 图标')

check(/linear-gradient\(135deg,\s*(rgba\(255,\s*255,\s*255,\s*\.55\)|#ffffff8c),\s*(rgba\(255,\s*255,\s*255,\s*\.35\)|#ffffff59)\)/.test(html),
  '背景白色柔化罩随产物一起打包（旧版观感的来源）')
check(/background:\s*linear-gradient\(135deg,\s*#d8efe2,\s*#cfe6f5\)/.test(html), '背景兜底渐变沿用旧版 #d8efe2 → #cfe6f5')
check(/--accent:\s*#3fae7e/.test(html), '默认主题沿用旧版 --accent:#3fae7e')
check(/--r-card:\s*22px/.test(html), '卡片圆角令牌 = 22px（旧版值）')

/* ============ 问题 3：热力图已删除 ============ */
console.log('— 问题 3：删除热力图 —')
check(document.querySelectorAll('.heat-cell').length === 0, '首页没有热力图单元格')
check(!pageText().includes('热力图'), '首页不再出现「热力图」')
navTo('时间管理')
await wait(600)
check(!pageText().includes('热力图'), '时间管理页也没有热力图')
check(pageText().includes('历史记录'), '时间管理页仍保留历史记录')

/* ============ 问题 2：小卡样式 ============ */
console.log('— 问题 2：今日小卡 —')
navTo('首页总览')
await wait(600)
check(/width:\s*180px;\s*height:\s*220px/.test(html), '小卡图片固定 180×220（旧版拍立得尺寸）')
check(/transform:\s*rotate\(-2deg\)/.test(html), '小卡恢复 -2° 倾斜的拍立得观感')
check(pageText().includes('今日小卡'), '首页存在「今日小卡」区域')

/* ============ 页面可用性 ============ */
console.log('— 各页面渲染 —')
check(pageText().includes('今日待复习'), '首页含「今日待复习」')
check(!!document.querySelector('input[placeholder*="韩语单词"]'), '首页含快捷录入输入框')

navTo('单词库')
await wait(600)
check(document.querySelector('.page-title').textContent.includes('单词库'), '单词库页面标题正确')
check(!!document.querySelector('input[placeholder*="搜索韩语"]'), '单词库有搜索框')

navTo('单词复习')
await wait(600)
const rvText = pageText()
;['给中文写韩语', '给韩语写中文', '打字', '选择题', '闪卡', '只刷错题'].forEach((k) => {
  check(rvText.includes(k), '复习设置包含「' + k + '」')
})

navTo('数据与设置')
await wait(600)
const stText = pageText()
;['导出备份文件', '每轮题量', '答对后自动跳转', '图片素材'].forEach((k) => {
  check(stText.includes(k), '设置页包含「' + k + '」')
})

/* 关掉 jsdom 窗口：应用内有 setInterval（自动快照巡检），
   不关窗口 Node 会一直挂着，进程会被超时杀掉、输出也拿不到。 */
try { dom.window.close() } catch (e) { /* noop */ }

console.log('')
console.log(failCount === 0
  ? `✅ 冒烟测试通过（${pass} 项）`
  : `❌ 冒烟测试失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exitCode = failCount === 0 ? 0 : 1
