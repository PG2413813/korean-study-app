/**
 * 扫描 ../backgrounds/，按内容哈希去重，生成图片清单。
 *
 * 为什么需要它：旧版是「暴力探测 bg1.jpg … bg200.jpg」，每次打开最多发 400 个请求，
 * 控制台一堆 404，而且一旦部署到 http(s) 服务器就完全失效（旧代码只在 file: 协议下工作）。
 * 改成清单后：一次拿到列表、无 404、本地和云端都能用。
 *
 * 只读操作：不会删除任何图片，只是把重复的排除在清单之外。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BG_DIR = path.resolve(here, '../../backgrounds')
const OUT = path.resolve(here, '../src/assets/backgrounds.gen.js')

const IMG_RE = /\.(jpe?g|png|webp)$/i

if (!fs.existsSync(BG_DIR)) {
  console.warn('[manifest] 未找到 backgrounds 目录，生成空清单：' + BG_DIR)
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, 'export const PAGE_BACKGROUNDS = []\nexport const IDOL_PHOTOS = []\nexport const SKIPPED_DUPLICATES = []\nexport const IGNORED_FILES = []\n')
  process.exit(0)
}

const files = fs.readdirSync(BG_DIR).filter((f) => IMG_RE.test(f)).sort()

const seen = new Map()   // hash -> 首次出现的文件名
const pageBgs = []
const idols = []
const skipped = []
const ignored = []

for (const name of files) {
  const full = path.join(BG_DIR, name)
  const buf = fs.readFileSync(full)
  const hash = crypto.createHash('sha1').update(buf).digest('hex')

  if (seen.has(hash)) { skipped.push({ name, duplicateOf: seen.get(hash) }); continue }
  seen.set(hash, name)

  const url = 'backgrounds/' + name

  // 命名规则与旧版保持一致：旧版只用 probeImages(['bg','g']) 找页面背景、
  // probeImages(['idol']) 找偶像小卡，其它命名一律不参与（否则竖幅人像会被当成
  // 页面背景，整页观感就变了）。
  if (/^idol/i.test(name)) idols.push(url)
  else if (/^(bg|g)\d+\.(jpe?g|png|webp)$/i.test(name)) pageBgs.push(url)
  else ignored.push(name)
}

if (!pageBgs.length) {
  console.warn('[manifest] 警告：没有找到 bg*.jpg / g*.jpg 命名的页面背景图，页面将使用纯渐变底色')
}

const banner = '/* 此文件由 scripts/gen-manifest.mjs 自动生成，请勿手改 */\n'
const body =
  banner +
  'export const PAGE_BACKGROUNDS = ' + JSON.stringify(pageBgs, null, 2) + '\n\n' +
  'export const IDOL_PHOTOS = ' + JSON.stringify(idols, null, 2) + '\n\n' +
  'export const SKIPPED_DUPLICATES = ' + JSON.stringify(skipped, null, 2) + '\n\n' +
  'export const IGNORED_FILES = ' + JSON.stringify(ignored, null, 2) + '\n'

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, body)

console.log('[manifest] 页面背景 ' + pageBgs.length + ' 张：' + (pageBgs.join('、') || '（无）'))
console.log('[manifest] 偶像小卡 ' + idols.length + ' 张')
if (skipped.length) {
  console.log('[manifest] 跳过重复文件 ' + skipped.length + ' 个（内容与已收录文件完全相同）：')
  skipped.forEach((s) => console.log('           ' + s.name + '  ==  ' + s.duplicateOf))
}
if (ignored.length) {
  console.log('[manifest] 忽略 ' + ignored.length + ' 个不符合命名规则的文件（不会出现在页面上）：')
  ignored.slice(0, 8).forEach((n) => console.log('           ' + n))
  if (ignored.length > 8) console.log('           …还有 ' + (ignored.length - 8) + ' 个')
}
