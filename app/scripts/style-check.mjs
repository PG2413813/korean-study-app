/**
 * 样式回归测试（问题 1）：逐条断言新版的视觉取值与旧版单文件应用一致。
 *
 * 为什么不放在 jsdom 里测：jsdom 不解析 CSS 变量（会返回 var(--x) 本身），
 * 而且构建产物里的颜色会被压缩成 #ffffff8c 之类，文本比对不可靠。
 * 这里直接读源码 CSS，把「旧版长什么样」写成一张期望表 —— 既是测试，也是文档。
 *
 * 比对前会把 CSS 规范化：去掉注释与空白（包括逗号/冒号/花括号周围的空格），
 * 这样就不会因为排版差异误判。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(here, '../src')
const OLD_HTML = path.resolve(here, '../../backup/韩语学习记录-v1-原始版.html')

function norm(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};:,>])\s*/g, '$1')
    .trim()
}

const rawTokens = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8')
const rawBase = fs.readFileSync(path.join(SRC, 'styles/base.css'), 'utf8')
const ui = fs.readFileSync(path.join(SRC, 'core/ui.js'), 'utf8')
const topbar = fs.readFileSync(path.join(SRC, 'components/AppTopbar.vue'), 'utf8')

const oldHtml = fs.readFileSync(OLD_HTML, 'utf8')
const oldCss = oldHtml.slice(oldHtml.indexOf('<style>'), oldHtml.indexOf('</style>'))

const T = norm(rawTokens)
const B = norm(rawBase)
const OLD = norm(oldCss)

let pass = 0
let failCount = 0
function check(cond, label, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { failCount++; console.log('  ✗ ' + label + (detail ? '　→ ' + detail : '')) }
}
const rx = (src, re) => re.test(src)

function themeBlock(name) {
  const start = T.indexOf(`[data-theme="${name}"]`)
  const end = T.indexOf('}', start)
  return T.slice(start, end)
}

/* ---------------------------------------------------------- */
console.log('— 底噪检查：这些取值确实来自旧版 CSS —')
;[['白罩', /\.bg::after\{[^}]*rgba\(255,255,255,\.55\),rgba\(255,255,255,\.35\)/],
  ['卡片圆角', /\.card\{[^}]*border-radius:22px/],
  ['主题变量', /--accent:#3fae7e/],
  ['按钮内边距', /\.btn\{padding:9px 16px/],
  ['小卡尺寸', /\.polaroid img\{width:180px;height:220px/]
].forEach(([label, re]) => check(rx(OLD, re), `旧版 CSS 中确实存在：${label}`))

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：四套主题的配色令牌 —')
const THEMES = [
  ['green', '#3fae7e', '#7fd6ab', '#24463a', '#6f9384', 'rgba\\(22,58,44,\\.45\\)', 'rgba\\(40,110,80,\\.16\\)'],
  ['blue', '#3d8fd0', '#8ecbf0', '#243c52', '#6f8aa3', 'rgba\\(24,52,76,\\.45\\)', 'rgba\\(40,80,120,\\.16\\)'],
  ['light', '#4a6b8a', '#9fb4c6', '#2b3a4a', '#6b7d8d', '#2f3f4f', 'rgba\\(40,50,60,\\.12\\)'],
  ['dark', '#6fd6a4', '#9be0c4', '#e6f0ea', '#9fb4aa', 'rgba\\(16,24,28,\\.6\\)', 'rgba\\(0,0,0,\\.45\\)']
]
THEMES.forEach(([name, accent, accent2, ink, sub, sidebarBg, shadow]) => {
  const b = themeBlock(name)
  check(b.includes(`--accent:${accent}`), `${name} 主题 --accent = ${accent}`)
  check(b.includes(`--accent2:${accent2}`), `${name} 主题 --accent2 = ${accent2}`)
  check(b.includes(`--ink:${ink}`), `${name} 主题 --ink = ${ink}`)
  check(b.includes(`--sub:${sub}`), `${name} 主题 --sub = ${sub}`)
  check(new RegExp(`--sidebar-bg:${sidebarBg}`).test(b), `${name} 主题 --sidebar-bg 一致`)
  check(new RegExp(`--shadow:${shadow}`).test(b), `${name} 主题 --shadow 一致`)
})

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：背景层（旧版观感的来源）—')
check(rx(B, /\.bg\{[^}]*background:linear-gradient\(135deg,#d8efe2,#cfe6f5\)/), '兜底渐变 = 旧版 #d8efe2 → #cfe6f5')
check(rx(B, /\.bg::after\{[^}]*linear-gradient\(135deg,rgba\(255,255,255,\.55\),rgba\(255,255,255,\.35\)\)/),
  '白色柔化罩 = 旧版 rgba(255,255,255,.55) → .35')
check(!/\[data-theme="dark"\] \.bg/.test(B), '深色主题不覆盖背景遮罩（旧版从未覆盖）')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：字体与基准字号 —')
check(/--font-sans:system-ui,-apple-system,"Malgun Gothic","Microsoft YaHei",sans-serif/.test(T),
  '字体族 = 旧版 system-ui / Malgun Gothic / Microsoft YaHei')
check(/body\{font-family:var\(--font-sans\);font-size:16px/.test(B), 'body 基准字号 16px')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：组件视觉取值 —')
;[
  ['侧栏宽 200px', /--sidebar-w:200px/],
  ['侧栏圆角 24px', /--r-sidebar:24px/],
  ['侧栏玻璃 blur(28px) saturate(160%)', /\.sidebar\{[^}]*blur\(28px\) saturate\(160%\)/],
  ['侧栏描边 rgba(255,255,255,.22)', /\.sidebar\{[^}]*border:1px solid rgba\(255,255,255,\.22\)/],
  ['侧栏阴影 0 12px 40px', /\.sidebar\{[^}]*box-shadow:0 12px 40px var\(--shadow\)/],
  ['logo 圆点 26×26 / 圆角 9px', /\.brand-mark\{width:26px;height:26px;border-radius:9px/],
  ['导航选中态渐变 .28→.12', /\.nav-item\.on\{background:linear-gradient\(135deg,rgba\(255,255,255,\.28\),rgba\(255,255,255,\.12\)\)/],
  ['顶栏圆角 22px / padding 16px 22px', /\.topbar\{[^}]*border-radius:var\(--r-topbar\);padding:16px 22px/],
  ['顶栏玻璃 blur(24px) saturate(180%)', /\.topbar\{[^}]*blur\(24px\) saturate\(180%\)/],
  ['顶栏底色 rgba(255,255,255,.5)', /--topbar-bg:rgba\(255,255,255,\.5\)/],
  ['顶栏描边 rgba(255,255,255,.65)', /--topbar-border:rgba\(255,255,255,\.65\)/],
  ['招呼语 20px', /--fs-xl:20px/],
  ['招呼语字重 800', /--fw-black:800/],
  ['招呼语韩文渐变裁切', /\.topbar \.greet \.kr\{[^}]*background-clip:text/],
  ['日期胶囊圆角 999px', /\.topbar \.date\{[^}]*border-radius:999px/],
  ['卡片圆角 22px', /--r-card:22px/],
  ['卡片玻璃 blur(26px) saturate(190%)', /\.card\{[^}]*blur\(26px\) saturate\(190%\)/],
  ['卡片描边 rgba(255,255,255,.7)', /--glass-border:rgba\(255,255,255,\.7\)/],
  ['卡片阴影 0 10px 30px', /\.card\{[^}]*box-shadow:0 10px 30px var\(--shadow\)/],
  ['统计数字 46px', /--fs-3xl:46px/],
  ['统计数字渐变裁切', /\.card \.num\{[^}]*background-clip:text/],
  ['面板圆角 20px / padding 16px 18px', /\.panel\{border-radius:var\(--r-panel\);padding:16px 18px/],
  ['输入框 padding 9px 12px', /input,select,textarea\{padding:9px 12px/],
  ['输入框圆角 12px', /--r-input:12px/],
  ['输入框底色 rgba(255,255,255,.7)', /input,select,textarea\{[^}]*background:rgba\(255,255,255,\.7\)/],
  ['按钮 padding 9px 16px', /\.btn\{[^}]*padding:9px 16px/],
  ['按钮圆角 12px', /--r-btn:12px/],
  ['按钮小号圆角 9px', /--r-btn-sm:9px/],
  ['危险按钮实色 #c96a4a', /--danger-solid:#c96a4a/],
  ['列表圆角 18px', /--r-list:18px/],
  ['列表底色 rgba(255,255,255,.45)', /--list-bg:rgba\(255,255,255,\.45\)/],
  ['列表行 padding 11px 14px', /\.row\{[^}]*padding:11px 14px/],
  ['行分隔线 rgba(127,127,127,.1)', /--line:rgba\(127,127,127,\.1\)/],
  ['韩语列 700 字重 / 最小宽 110px', /\.row \.ko\{font-weight:var\(--fw-bold\);min-width:110px/],
  ['标签圆角 99px', /\.tag\{[^}]*border-radius:99px/],
  ['胶囊 padding 6px 14px / 12.5px', /\.pill\{[^}]*padding:6px 14px;font-size:12\.5px/],
  ['空状态 padding 26px', /\.empty\{padding:26px/],
  ['提示文字 13px', /--fs-sm:13px/],
  ['弹窗白底 / 圆角 16px / 宽 420px', /\.modal\{background:#fff;color:#223;border-radius:var\(--r-modal\);padding:18px;width:420px/],
  ['复习大卡圆角 28px / padding 56px 48px', /\.qcard\{[^}]*border-radius:var\(--r-qcard\);padding:56px 48px/],
  ['题干 68px', /--fs-q:68px/],
  ['复习输入框 380px / 22px', /\.q-input input\{width:380px;font-size:22px/],
  ['进度条 70×7 / 圆角 99px', /\.bar\{width:70px;height:7px;border-radius:99px/],
  ['模式卡圆角 20px / 2px 描边', /\.mode-card\{[^}]*border-radius:20px;padding:24px 18px[^}]*border:2px solid/],
  ['反馈条 padding 10px 13px / 圆角 12px', /\.fb\{padding:10px 13px;border-radius:12px/]
].forEach(([label, re]) => check(rx(B + ' ' + T, re), label))

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：反馈色沿用旧版硬编码值 —')
check(/--ok:#1f6b43/.test(T) && /--ok-soft:#dff5e8/.test(T), '答对：字色 #1f6b43 / 底色 #dff5e8')
check(/--err:#9a4326/.test(T) && /--err-soft:#fbe6df/.test(T), '答错：字色 #9a4326 / 底色 #fbe6df')
check(/--warn:#8a5b1f/.test(T) && /--warn-soft:#fdf3dd/.test(T), '警告：字色 #8a5b1f / 底色 #fdf3dd')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：深色主题的玻璃覆盖按旧版单独声明 —')
const dark = themeBlock('dark')
check(dark.includes('--surface:rgba(40,52,58,.55)'), '深色卡片底 rgba(40,52,58,.55)')
check(dark.includes('--topbar-bg:rgba(36,48,54,.5)'), '深色顶栏底 rgba(36,48,54,.5)')
check(dark.includes('--list-bg:rgba(30,42,48,.45)'), '深色列表底 rgba(30,42,48,.45)')
check(/\[data-theme="dark"\] \.mode-card\{/.test(B), '深色模式保留 mode-card 的单独覆盖')
check(/\[data-theme="dark"\] \.mode-card\.on\{/.test(B), '深色模式保留 mode-card.on 覆盖')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 1：导航图标恢复旧版 emoji —')
;['🏠', '🗂️', '✏️', '🔁', '⭐', '📊', '⚙️'].forEach((e) => check(ui.includes(e), `导航包含旧版图标 ${e}`))
check(['首页总览', '单词库', '每日学习录入', '单词复习', '错题库管理', '时间管理', '数据与设置'].every((t) => ui.includes(t)),
  '导航文案与旧版完全一致')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 2：今日小卡沿用旧版拍立得 —')
check(/\.polaroid\{background:#fff;border-radius:14px;padding:10px 10px 14px;transform:rotate\(-2deg\)/.test(B),
  '拍立得：白底 / 圆角 14px / -2° 倾斜 / padding 10px 10px 14px')
check(/\.polaroid\{[^}]*width:200px;margin:4px auto/.test(B), '拍立得整体宽 200px、居中')
check(/\.polaroid img\{width:180px;height:220px;object-fit:cover;border-radius:8px/.test(B),
  '图片 180×220 竖幅裁切（不会只露半张）')
check(/\.polaroid \.cap\{text-align:center;font-size:12\.5px;color:#5a8a72;margin-top:8px;font-weight:var\(--fw-bold\)/.test(B),
  '底部标注 12.5px / #5a8a72 / 加粗')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 3：热力图已彻底移除 —')
const srcFiles = []
;(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else srcFiles.push(p)
  }
})(SRC)
/* 检查「页面会不会出现热力图」时要排除注释，否则会被说明性的注释误伤 */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1')

check(!srcFiles.some((f) => f.includes('Heatmap')), '不存在 Heatmap 组件文件')
check(!srcFiles.some((f) => fs.readFileSync(f, 'utf8').includes('heat-cell')), '不含热力图样式类 .heat-cell')
check(!srcFiles.some((f) => /热力图/.test(stripComments(fs.readFileSync(f, 'utf8')))),
  '源码中不含任何「热力图」文案（注释除外）')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 2：批量选择已移除 —')
const allSource = srcFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
check(!/bulkbar/.test(allSource), '源码中不存在批量操作条 .bulkbar')
check(!/class="ck"/.test(allSource), '源码中不存在批量选择复选框 .ck')
check(!/(toggleSelectAll|batchDelete|batchTag|batchToError|clearSelection)/.test(allSource), '源码中不存在批量操作函数')
check(!/selected\.size|selected\.has/.test(allSource), '源码中不存在选中集合相关逻辑')
check(/\.row \.ops\{[^}]*display:flex/.test(B), '列表行右侧操作区样式保留')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 3：单词库搜索框 —')
const words = fs.readFileSync(path.join(SRC, 'views/WordsView.vue'), 'utf8')
check(/v-model="searchQuery"/.test(words), '搜索框绑定 searchQuery')
check(/@input="onSearch"/.test(words), '输入时重置到第 1 页')
check(/placeholder="搜索韩语或中文"/.test(words), '占位文案与旧版一致')
check(/w\.ko\.indexOf\(q\)\s*<\s*0\s*&&\s*w\.zh\.indexOf\(q\)\s*<\s*0/.test(words), '按韩语或中文子串过滤（旧版规则）')
check(/class="search-input"/.test(words) && /\.search-input\s*\{\s*width:\s*100%/.test(words), '搜索框撑满整行')

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 4：背景图的加载方式 —')
const manifest = fs.readFileSync(path.join(SRC, 'assets/backgrounds.gen.js'), 'utf8')
const pageBgs = JSON.parse(manifest.match(/PAGE_BACKGROUNDS = (\[[\s\S]*?\])/)[1])
const idols = JSON.parse(manifest.match(/IDOL_PHOTOS = (\[[\s\S]*?\])/)[1])
/* 清单里的路径是相对「构建产物所在目录」的，产物被放到项目根目录，
   所以这里要以项目根为基准判断文件是否存在。 */
const ROOT = path.resolve(here, '../..')
const existsAtRoot = (p) => fs.existsSync(path.join(ROOT, p))
check(pageBgs.length > 0, '清单中存在页面背景图：' + pageBgs.join('、'))
check(pageBgs.every(existsAtRoot), '每张页面背景图都真实存在（防止指向已改名的文件）',
  pageBgs.filter((p) => !existsAtRoot(p)).join('、'))
check(idols.length > 0 && idols.every(existsAtRoot), '每张偶像小卡都真实存在（共 ' + idols.length + ' 张）',
  idols.filter((p) => !existsAtRoot(p)).join('、'))
check(pageBgs.every((p) => /backgrounds\/(bg|g)\d+\.(jpe?g|png|webp)$/i.test(p)),
  '页面背景只取 bg*/g* 命名（与旧版探测规则一致，不会把竖幅人像当背景）', pageBgs.join('、'))

/* ---------------------------------------------------------- */
console.log('')
console.log('— 问题 5：旧版小标语 —')
check(topbar.includes('今天也要加油学习 ✦'), '招呼语「…今天也要加油学习 ✦」')
check(/class="kr"/.test(topbar), '韩语问候用 .kr 包裹（渐变字）')
check(/今日待复习/.test(topbar) && /个单词，开始吧~/.test(topbar), '小标语「今日待复习 N 个单词，开始吧~」')
check(/weekdayCN/.test(topbar), '右侧显示日期与星期')
check(/좋은 아침이에요/.test(ui) && /오늘도 수고했어요/.test(ui) && /잘 지냈나요/.test(ui),
  '按时段切换的韩语问候沿用旧版文案')

console.log('')
console.log(failCount === 0
  ? `✅ 样式回归测试通过（${pass} 项）`
  : `❌ 样式回归测试失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exitCode = failCount === 0 ? 0 : 1
