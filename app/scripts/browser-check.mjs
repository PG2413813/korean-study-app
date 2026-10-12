/**
 * 真实浏览器验证（puppeteer-core 驱动本机 Chrome）。
 *
 * 为什么不用无头 Chrome 的 --virtual-time-budget：
 *   虚拟时间模式下 **IndexedDB 的回调不会触发**（连 error 都不回调），
 *   导致依赖真实异步的存储层完全测不了。
 *   换成 puppeteer 后可以真正地等待、读取和点击。
 *
 * 覆盖两块：
 *   A. 存储层（P1）：真的用上了 IndexedDB、旧数据能迁移、刷新后数据还在
 *   B. 视觉与交互：背景图、绘制层级、主题配色、弹窗按钮、搜索、无批量选择
 * 同时把首页/单词库/设置/弹窗截图到 .shots/ 供人眼对比。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(here, '../..')
const APP = path.join(ROOT, '韩语学习记录.html')
const SHOTS = path.join(ROOT, '.shots')

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome'
]
const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
if (!chrome) {
  console.log('⚠ 未找到 Chrome/Edge，跳过浏览器验证（不影响其它测试）')
  process.exit(0)
}

let pass = 0
let failCount = 0
function check(cond, label, detail) {
  if (cond) { pass++; console.log('  ✓ ' + label) }
  else { failCount++; console.log('  ✗ ' + label + (detail ? '　→ ' + detail : '')) }
}

fs.rmSync(SHOTS, { recursive: true, force: true })
fs.mkdirSync(SHOTS, { recursive: true })

const SEED_WORDS = [
  ['공부하다', '学习', '动词'], ['운동하다', '运动', '动词'], ['날씨', '天气', '名词'],
  ['아침', '早晨', '名词'], ['생각하다', '想、认为', '动词'], ['학교', '学校', '名词']
].map((p, i) => ({
  id: 'w' + i, ko: p[0], zh: p[1], tags: [p[2]],
  createdAt: '2026-01-0' + (i + 1), lastReviewedAt: null, isError: false, errorSince: null, correctStreak: 0
}))

const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/')
  .split('/').map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg))).join('/')

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 }
})

/** 每个用例开一个独立的浏览器上下文（localStorage / IndexedDB 互相隔离） */
async function openApp({ view = 'home', words = SEED_WORDS, studyLog = {} } = {}) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  // 只种一次：刷新页面时 sessionStorage 还在，不会把数据又清掉
  await page.evaluateOnNewDocument((seed) => {
    try {
      if (!sessionStorage.getItem('__seeded')) {
        sessionStorage.setItem('__seeded', '1')
        localStorage.clear()
        localStorage.setItem('hanStudyApp.v1', JSON.stringify(seed))
      }
    } catch (e) { /* noop */ }
  }, { version: 1, settings: { roundSize: 20, removeAfter: 3, lastView: view }, words, studyLog })
  await page.goto(fileUrl(APP), { waitUntil: 'load' })
  await page.waitForSelector('.sidebar', { timeout: 20000 })
  // 等数据真正填进来（initState 是异步的）
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-storage'), { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 350))
  return { ctx, page }
}

const css = (page, sel, props) => page.evaluate((s, ps) => {
  const el = document.querySelector(s)
  if (!el) return null
  const cs = getComputedStyle(el)
  const o = {}
  ps.forEach((p) => { o[p] = cs.getPropertyValue(p) })
  return o
}, sel, props)

const hitOk = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s)
  if (!el) return { ok: false, missing: true }
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
  return { ok: hit === el || el.contains(hit), hit: hit ? String(hit.className || hit.tagName) : null }
}, sel)

const shot = async (page, name) => {
  const f = path.join(SHOTS, name)
  await page.screenshot({ path: f })
  console.log('       → .shots/' + name)
}

/* ==================== A. 存储层 ==================== */
console.log('')
console.log('— A. 存储层：IndexedDB、旧数据迁移、持久化 —')
{
  const { ctx, page } = await openApp({ view: 'words' })

  const mode = await page.evaluate(() => document.documentElement.getAttribute('data-storage'))
  check(mode === 'indexeddb', '真实浏览器实际使用 IndexedDB', String(mode))

  const idb = await page.evaluate(() => new Promise((resolve) => {
    try {
      const req = indexedDB.open('hanStudyApp', 1)
      req.onsuccess = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('kv')) { resolve(null); return }
        const g = db.transaction('kv', 'readonly').objectStore('kv').get('state')
        g.onsuccess = () => resolve(g.result || null)
        g.onerror = () => resolve(null)
      }
      req.onerror = () => resolve(null)
    } catch (e) { resolve(null) }
  }))

  check(!!idb, 'IndexedDB 里已写入主数据')
  check(idb && Array.isArray(idb.words) && idb.words.length === SEED_WORDS.length,
    '旧数据完整迁移进 IndexedDB（' + (idb && idb.words ? idb.words.length : 0) + ' 个词）')
  check(idb && !!idb.studyLog, '学习记录一并迁移')
  check(idb && idb.words[0] && idb.words[0].ko === SEED_WORDS[0].ko,
    '迁移内容正确：' + (idb && idb.words[0] ? idb.words[0].ko : ''))

  const uiRows = await page.evaluate(() => document.querySelectorAll('.list .row').length)
  check(uiRows === SEED_WORDS.length, '界面从新存储读到 ' + uiRows + ' 个词')

  const legacyKept = await page.evaluate(() => !!localStorage.getItem('hanStudyApp.v1'))
  check(legacyKept === true, 'localStorage 旧副本保留作安全网（不删）')

  // 刷新后数据仍在 —— 证明真的落盘了
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.sidebar', { timeout: 20000 })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-storage'), { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 400))
  const afterReload = await page.evaluate(() => document.querySelectorAll('.list .row').length)
  check(afterReload === SEED_WORDS.length, '刷新后数据仍在（' + afterReload + ' 个词）')

  // 新增一个词 → 刷新 → 还在（写路径生效）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.nav-item')]
    const home = btns.find((b) => b.textContent.includes('首页'))
    if (home) home.click()
  })
  await new Promise((r) => setTimeout(r, 600))
  await page.type('input[placeholder*="韩语单词"]', '테스트')
  await page.type('input[placeholder*="中文释义"]', '测试')
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.btn')].find((x) => x.textContent.trim() === '添加')
    if (b) b.click()
  })
  await new Promise((r) => setTimeout(r, 800))
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('.sidebar', { timeout: 20000 })
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-storage'), { timeout: 20000 })
  await new Promise((r) => setTimeout(r, 500))
  // 切到单词库数行数：新增的词应该在里面
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.nav-item')].find((x) => x.textContent.includes('单词库'))
    if (b) b.click()
  })
  await page.waitForSelector('.list .row', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 400))
  const rowsAfterAdd = await page.evaluate(() => document.querySelectorAll('.list .row').length)
  const hasNew = await page.evaluate(() => document.querySelector('.list').innerText.includes('테스트'))
  check(rowsAfterAdd === SEED_WORDS.length + 1,
    '新录入的词写入后刷新仍在（' + rowsAfterAdd + ' 行，应为 ' + (SEED_WORDS.length + 1) + '）')
  check(hasNew, '新词确实出现在列表里')

  await shot(page, 'storage-words.png')
  await ctx.close()
}

/* ==================== B. 视觉与交互 ==================== */
console.log('')
console.log('— B. 视觉：背景图与绘制层级 —')
{
  const { ctx, page } = await openApp({ view: 'home' })

  const bg = await page.evaluate(() => {
    const el = document.querySelector('.bg')
    return el ? getComputedStyle(el).backgroundImage : null
  })
  const m = /url\("?file:\/\/\/([^")]+)"?\)/.exec(bg || '')
  const rel = m ? decodeURIComponent(m[1]).replace(/^\/+/, '') : ''
  check(!!m, '背景层设置了图片 URL', bg || '（无）')
  check(!!rel && fs.existsSync(rel), '背景图文件真实存在', rel || '无法解析')
  if (rel && fs.existsSync(rel)) console.log('       → ' + rel)

  for (const [sel, label] of [['.topbar .greet', '顶栏招呼语'], ['.card', '统计卡'], ['.toolbar', '工具条']]) {
    const r = await hitOk(page, sel)
    check(r.ok, label + '可被鼠标命中（背景层没盖住内容）', JSON.stringify(r))
  }

  const sidebar = await css(page, '.sidebar', ['background-color', 'color', 'backdrop-filter'])
  check(/rgba\(22,\s*58,\s*44,\s*0?\.45\)/.test(sidebar['background-color']), '侧栏底色 = 旧版 rgba(22,58,44,.45)', sidebar['background-color'])
  check(/rgb\(255,\s*255,\s*255\)/.test(sidebar.color), '侧栏文字白色', sidebar.color)
  check(/blur\(28px\)/.test(sidebar['backdrop-filter']), '侧栏玻璃 blur(28px)', sidebar['backdrop-filter'])

  const card = await css(page, '.card', ['background-color', 'border-radius'])
  check(/rgba\(255,\s*255,\s*255,\s*0?\.55\)/.test(card['background-color']), '卡片底色 = 旧版 rgba(255,255,255,.55)', card['background-color'])
  check(/22px/.test(card['border-radius']), '卡片圆角 22px', card['border-radius'])

  const num = await css(page, '.card .num', ['background-image', '-webkit-text-fill-color'])
  check(/linear-gradient/.test(num['background-image']), '统计数字用主题渐变', num['background-image'])
  check(/rgba\(0,\s*0,\s*0,\s*0\)/.test(num['-webkit-text-fill-color']), '统计数字做了渐变裁切')

  const btn = await css(page, '.btn.primary', ['background-image', 'color'])
  check(/linear-gradient/.test(btn['background-image']), '主按钮用主题渐变', btn['background-image'])

  await shot(page, 'home.png')
  await ctx.close()
}

console.log('')
console.log('— B2. 弹窗保存按钮必须看得见 —')
{
  const { ctx, page } = await openApp({ view: 'words' })
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.list .row .btn')].find((x) => x.textContent.includes('编辑'))
    if (b) b.click()
  })
  await page.waitForSelector('.modal', { timeout: 8000 })
  const save = await page.evaluate(() => {
    const b = [...document.querySelectorAll('.modal .btn')].find((x) => x.textContent.includes('保存'))
    if (!b) return null
    const cs = getComputedStyle(b)
    const r = b.getBoundingClientRect()
    const hit = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return {
      bgImage: cs.backgroundImage, color: cs.color,
      size: Math.round(r.width) + 'x' + Math.round(r.height),
      hittable: hit === b || b.contains(hit)
    }
  })
  check(!!save, '弹窗内有「保存」按钮')
  check(save && /linear-gradient/.test(save.bgImage), '保存按钮取到主题渐变 var(--grad)', save && save.bgImage)
  check(save && /rgb\(/.test(save.bgImage), '渐变由实色构成（不是透明填充）')
  check(save && /255,\s*255,\s*255/.test(save.color), '保存按钮文字白色')
  check(save && save.size !== '0x0', '保存按钮有实际尺寸：' + (save && save.size))
  check(save && save.hittable === true, '保存按钮可点击')
  await shot(page, 'modal.png')
  await ctx.close()
}

console.log('')
console.log('— B3. 单词库：无批量选择、搜索可用 —')
{
  const { ctx, page } = await openApp({ view: 'words' })
  const boxes = await page.evaluate(() => document.querySelectorAll('.ck').length)
  const bulk = await page.evaluate(() => !!document.querySelector('.bulkbar'))
  check(boxes === 0, '已移除批量选择复选框', '仍有 ' + boxes + ' 个')
  check(!bulk, '不存在批量操作条')

  const before = await page.evaluate(() => document.querySelectorAll('.list .row').length)
  await page.type('input[placeholder*="搜索"]', '学习')
  await new Promise((r) => setTimeout(r, 400))
  const after = await page.evaluate(() => document.querySelectorAll('.list .row').length)
  check(before === SEED_WORDS.length, '搜索前 ' + before + ' 行')
  check(after === 1, '搜索「学习」精确过滤为 1 条', '实际 ' + after)
  await shot(page, 'words.png')
  await ctx.close()
}

console.log('')
console.log('— B4. 设置页截图 —')
{
  const { ctx, page } = await openApp({ view: 'settings' })
  const txt = await page.evaluate(() => (document.querySelector('.content') || {}).textContent || '')
  check(txt.includes('图片素材'), '设置页有图片素材区块')
  check(txt.includes('学习数据自动保存'), '设置页有自动保存区块')
  await page.screenshot({ path: path.join(SHOTS, 'settings.png'), fullPage: true })
  console.log('       → .shots/settings.png')
  await ctx.close()
}

await browser.close()

console.log('')
console.log('截图目录：.shots/')
console.log(failCount === 0
  ? `✅ 浏览器验证通过（${pass} 项）`
  : `❌ 浏览器验证失败 ${failCount} 项 / 共 ${pass + failCount} 项`)
process.exit(failCount === 0 ? 0 : 1)
