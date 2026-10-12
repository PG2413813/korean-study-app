/**
 * 构建后处理：
 *  1) 把内联的 <script type="module" crossorigin> 改成经典 <script>。
 *     原因：ES module 在 file:// 协议下会被浏览器按 CORS 拦截，
 *     而这个 App 的硬要求是「双击即用、断网可用」。
 *     打包产物已无任何 import/export，降级为经典脚本是安全的。
 *  2) 把该脚本整体移动到 </body> 之前。
 *     关键：<script type="module"> 是延迟执行的，改成经典脚本后会变成「立即执行」，
 *     此时 <body> 还没解析出来，Vue 找不到 #app 会直接挂载失败。
 *     内联经典脚本的 defer 属性无效，所以只能移动位置。
 *  3) 校验降级后的脚本能被解析（含 import/export/顶层 await 会直接报错）。
 *  4) 复制成品到项目根目录，覆盖「韩语学习记录.html」。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(here, '../dist/index.html')
const ROOT_OUT = path.resolve(here, '../../韩语学习记录.html')

let html = fs.readFileSync(DIST, 'utf8')

/* ---------- 1. 取出脚本 ---------- */
const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/
const m = html.match(scriptRe)
if (!m) {
  console.error('[postbuild] 找不到内联脚本，构建产物不符合预期')
  process.exit(1)
}
const scriptBody = m[1]
const isModule = /type="module"/.test(m[0])

/* ---------- 2. 校验能作为经典脚本解析 ---------- */
try {
  // eslint-disable-next-line no-new-func
  new Function(scriptBody)
} catch (err) {
  console.error('[postbuild] 脚本无法作为经典脚本解析：' + err.message)
  console.error('（可能含 import/export 或顶层 await，此时应保留 type="module"）')
  process.exit(1)
}

/* ---------- 3. 从 head 移除，改放到 </body> 前 ---------- */
html = html.replace(scriptRe, '')
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/g, '')

const banner = isModule
  ? '\n<script>\n/* 由 postbuild 从 head 移到这里：经典脚本会立即执行，\n   必须等 DOM 就绪才能挂载 Vue。 */\n'
  : '\n<script>\n'

// 注意：这里必须用「函数式替换」而不是字符串。
// 字符串替换会把 $&、$'、$` 当成特殊记号展开，
// 而压缩后的 Vue 代码里恰好含有 $& 这样的序列 —— 会被悄悄换成匹配到的 </body>，
// 结果把脚本写坏（而且插入前的校验查不出来）。
html = html.replace('</body>', () => banner + scriptBody + '</script>\n</body>')

/* ---------- 3.5 重新抽出成品里的脚本，再校验一次 ---------- */
const finalMatch = html.match(scriptRe)
if (!finalMatch) {
  console.error('[postbuild] 组装后找不到脚本')
  process.exit(1)
}
try {
  // eslint-disable-next-line no-new-func
  new Function(finalMatch[1])
} catch (err) {
  console.error('[postbuild] 组装后的脚本解析失败（替换过程可能损坏了内容）：' + err.message)
  process.exit(1)
}

fs.writeFileSync(DIST, html, 'utf8')
fs.writeFileSync(ROOT_OUT, html, 'utf8')

/* ---------- 4. 复查结构 ---------- */
const okScriptAtEnd = /<script>[\s\S]*<\/script>\s*<\/body>/.test(html)
const scriptCount = (html.match(/<script\b/g) || []).length

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1)
console.log('[postbuild] 已降级为经典脚本并通过解析校验' + (isModule ? '（原为 module，已移出 head）' : ''))
console.log('[postbuild] 脚本数量 ' + scriptCount + '，位于 </body> 前：' + okScriptAtEnd)
console.log('[postbuild] 产物 ' + kb + ' KB → ' + ROOT_OUT)

if (!okScriptAtEnd || scriptCount !== 1) {
  console.error('[postbuild] 结构复查未通过')
  process.exit(1)
}
