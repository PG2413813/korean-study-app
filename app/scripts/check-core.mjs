/**
 * 算法对拍：把旧版 HTML 里的 CORE 区抽出来，和新版 src/core/core.js 逐函数比对。
 * 目的：确认「移植后行为完全不变」，而不是只是"看起来像"。
 * 用固定种子的伪随机数据，两边跑同样的输入，深比较输出。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as NEW from '../src/core/core.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const OLD_HTML = path.resolve(here, '../../backup/韩语学习记录-v1-原始版.html')

const html = fs.readFileSync(OLD_HTML, 'utf8')
const s = html.indexOf('/* ==== CORE-START ==== */')
const e = html.indexOf('/* ==== CORE-END ==== */')
if (s < 0 || e < 0) { console.error('找不到旧版 CORE 区标记'); process.exit(1) }
const coreSrc = html.slice(s, e)

// eslint-disable-next-line no-new-func
const raw = new Function(coreSrc + '\nreturn { core: globalThis.AppCore, dateOffset, weekStartKey, dateGt };')()
// 旧版把 dateOffset / weekStartKey / dateGt 留在模块作用域、没有挂到 AppCore 上，
// 这里一并取出来参与对拍。
const OLD = Object.assign({}, raw.core, {
  dateOffset: raw.dateOffset,
  weekStartKey: raw.weekStartKey,
  dateGt: raw.dateGt
})

/* ---------------- 工具 ---------------- */
let failures = 0
let checks = 0

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

function cmp(label, a, b) {
  checks++
  if (!deepEqual(a, b)) {
    failures++
    console.log('  ✗ ' + label)
    console.log('     旧: ' + JSON.stringify(a).slice(0, 220))
    console.log('     新: ' + JSON.stringify(b).slice(0, 220))
  }
}

/* ---------------- 造数据 ---------------- */
const rnd = mulberry32(20261011)

const KO = ['공부하다', '운동하다', '일하다', '생각하다', '날씨', '아침', '학교', '친구', '시간', '음식']
const ZH = ['学习', '运动', '工作', '想、认为', '天气', '早晨', '学校', '朋友', '时间', '食物、饭']
const TAGS = ['动词', '名词', 'TOPIK3', 'TOPIK4', '高频']

function makeWords(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const created = NEW.dateOffset('2026-10-11', -Math.floor(rnd() * 40))
    out.push({
      id: 'w' + i,
      ko: KO[i % KO.length] + (i >= KO.length ? '_' + i : ''),
      zh: ZH[Math.floor(rnd() * ZH.length)],
      tags: [TAGS[Math.floor(rnd() * TAGS.length)]],
      createdAt: created,
      lastReviewedAt: rnd() < 0.5 ? NEW.dateOffset('2026-10-11', -Math.floor(rnd() * 10)) : null,
      isError: rnd() < 0.3,
      errorSince: null,
      correctStreak: Math.floor(rnd() * 4)
    })
  }
  return out
}

function makeLog() {
  const log = {}
  for (let i = 0; i < 120; i++) {
    const d = NEW.dateOffset('2026-10-11', -i)
    if (rnd() < 0.75) {
      log[d] = {
        added: Math.floor(rnd() * 8),
        reviewed: Math.floor(rnd() * 40),
        correct: Math.floor(rnd() * 30),
        seconds: Math.floor(rnd() * 2400)
      }
    }
  }
  log['bad-key'] = { added: 3 }
  log['2026-13-99'] = { added: 1 }
  return log
}

const words = makeWords(60)
const studyLog = makeLog()
const settings = { roundSize: 20, removeAfter: 3 }
const TODAY = '2026-10-11'

/* ---------------- 日期 ---------------- */
console.log('— 日期 —')
;['2026-01-01', '2026-02-28', '2026-10-11', '2026-12-31'].forEach((d) => {
  ;[-400, -35, -7, -1, 0, 1, 30, 365].forEach((n) => {
    cmp(`dateOffset(${d}, ${n})`, OLD.dateOffset(d, n), NEW.dateOffset(d, n))
  })
  cmp(`weekStartKey(${d})`, OLD.weekStartKey(d), NEW.weekStartKey(d))
})
;[['2026-01-01', '2026-01-02'], ['2026-10-11', '2026-10-11']].forEach(([a, b]) => {
  cmp(`dateGt(${a},${b})`, OLD.dateGt(a, b), NEW.dateGt(a, b))
})

/* ---------------- 释义与判题 ---------------- */
console.log('— 释义与判题 —')
const ZH_SAMPLES = ['学习', '想、认为', '食物、饭', ' a , b ；c，d/e ', '', '  前后空格  ', '时间']
ZH_SAMPLES.forEach((z) => {
  cmp(`splitMeanings(${JSON.stringify(z)})`, OLD.splitMeanings(z), NEW.splitMeanings(z))
})
const JUDGE = [
  ['学习', '学习、学问', 'ko2zh'], ['学问', '学习、学问', 'ko2zh'], ['学', '学习、学问', 'ko2zh'],
  ['공부하다', ' 공부하다 ', 'zh2ko'], ['공부', '공부하다', 'zh2ko'], ['', '学习', 'ko2zh'],
  [' 学习 ', '学习', 'ko2zh']
]
JUDGE.forEach(([i, a, m]) => cmp(`judgeAnswer(${JSON.stringify(i)},${JSON.stringify(a)},${m})`, OLD.judgeAnswer(i, a, m), NEW.judgeAnswer(i, a, m)))
ZH_SAMPLES.forEach((z) => {
  cmp(`normalizeText(${JSON.stringify(z)})`, OLD.normalizeText(z), NEW.normalizeText(z))
})

/* ---------------- 统计 ---------------- */
console.log('— 统计 —')
cmp('computeStats', OLD.computeStats(words, studyLog, TODAY), NEW.computeStats(words, studyLog, TODAY))
cmp('consecutiveStudyDays', OLD.consecutiveStudyDays(studyLog, TODAY), NEW.consecutiveStudyDays(studyLog, TODAY))
cmp('dayLog(命中)', OLD.dayLog(studyLog, '2026-10-11'), NEW.dayLog(studyLog, '2026-10-11'))
cmp('dayLog(缺失)', OLD.dayLog(studyLog, '1999-01-01'), NEW.dayLog(studyLog, '1999-01-01'))
cmp('computeDayStats', OLD.computeDayStats(studyLog, '2026-10-11'), NEW.computeDayStats(studyLog, '2026-10-11'))
;['day', 'week', 'month'].forEach((m) => {
  cmp(`computeTrend(${m})`, OLD.computeTrend(studyLog, TODAY, m), NEW.computeTrend(studyLog, TODAY, m))
})
cmp('historyDays', OLD.historyDays(studyLog), NEW.historyDays(studyLog))
cmp('computeSummary', OLD.computeSummary(studyLog), NEW.computeSummary(studyLog))

/* ---------------- 复习队列（同种子对拍） ---------------- */
console.log('— 复习队列 —')
for (let k = 0; k < 40; k++) {
  const seed = 1000 + k
  const ro = mulberry32(seed)
  const rn = mulberry32(seed)
  const opt = k % 3 === 0 ? { onlyErrors: true } : {}
  const a = OLD.buildReviewQueue(words, settings, TODAY, { ...opt, rand: ro })
  const b = NEW.buildReviewQueue(words, settings, TODAY, { ...opt, rand: rn })
  cmp(`buildReviewQueue#${k}${opt.onlyErrors ? '(只错题)' : ''}`, a.map((x) => x.id), b.map((x) => x.id))
}
;[[20, 3], [5, 2], [1, 10]].forEach(([size, after]) => {
  const ro = mulberry32(7); const rn = mulberry32(7)
  const a = OLD.buildReviewQueue(words, { roundSize: size, removeAfter: after }, TODAY, { rand: ro })
  const b = NEW.buildReviewQueue(words, { roundSize: size, removeAfter: after }, TODAY, { rand: rn })
  cmp(`buildReviewQueue(size=${size})`, a.map((x) => x.id), b.map((x) => x.id))
})

/* ---------------- 错题状态机 ---------------- */
console.log('— 错题状态机 —')
const cases = [
  { isError: false, correctStreak: 0 }, { isError: true, correctStreak: 0 },
  { isError: true, correctStreak: 2 }, { isError: true, correctStreak: 3 }, { isError: true, correctStreak: 5 }
]
cases.forEach((c, i) => {
  [true, false].forEach((ok) => {
    const w = { id: 'x', ...c, errorSince: '2026-10-01' }
    cmp(`applyAnswer#${i}-${ok}`, OLD.applyAnswer(w, ok, TODAY, settings), NEW.applyAnswer(w, ok, TODAY, settings))
  })
})

/* ---------------- 录入与合并 ---------------- */
console.log('— 录入与合并 —')
;[['공부하다', '学习', ['动词']], ['新词', '新义', ['x']], ['', '学习', []], ['新词2', '', []]].forEach(([ko, zh, tg], i) => {
  const a = OLD.addWordEntry(words, ko, zh, tg, TODAY)
  const b = NEW.addWordEntry(words, ko, zh, tg, TODAY)
  cmp(`addWordEntry#${i}.status`, a.status, b.status)
  cmp(`addWordEntry#${i}.existing`, a.existing && a.existing.id, b.existing && b.existing.id)
  cmp(`addWordEntry#${i}.wordsLen`, a.words.length, b.words.length)
})
const ex = { id: 'w', ko: '공부하다', zh: '学习、学问', tags: ['动词'] }
cmp('mergeEntry', OLD.mergeEntry(ex, '学问、研究', ['名词', '动词']), NEW.mergeEntry(ex, '学问、研究', ['名词', '动词']))
ZH_SAMPLES.forEach((z) => {
  const item = { id: 'z', zh: z }
  const pool = words.concat([{ id: 'z', zh: z, ko: 'k', tags: [] }])
  cmp(`findSynonymGroup(${JSON.stringify(z)})`,
    OLD.findSynonymGroup(pool, item).map((x) => x.id),
    NEW.findSynonymGroup(pool, item).map((x) => x.id))
})

/* ---------------- 导入导出 ---------------- */
console.log('— 导入导出 —')
cmp('exportJSON', JSON.parse(OLD.exportJSON(NEW.defaultState())).data, JSON.parse(NEW.exportJSON(NEW.defaultState())).data)
;['{"data":{"words":[]}}', 'not json', '{"data":{"nope":1}}', JSON.stringify({ words: [{ ko: 'a', zh: 'b' }] })].forEach((t, i) => {
  const a = OLD.importJSON(t)
  const b = NEW.importJSON(t)
  cmp(`importJSON#${i}.ok`, a.ok, b.ok)
  cmp(`importJSON#${i}.error`, a.error, b.error)
  if (a.ok) {
    // id 缺失时两边各自随机生成，属预期差异；比对时剔除 id
    const strip = (arr) => arr.map((w) => { const c = { ...w }; delete c.id; return c })
    cmp(`importJSON#${i}.words`, strip(a.state.words), strip(b.state.words))
  }
})

/* ---------------- 汇总 ---------------- */
console.log('')
if (failures === 0) {
  console.log(`✅ 对拍通过：${checks} 项全部一致（旧版 AppCore vs 新版 core.js）`)
} else {
  console.log(`❌ 对拍失败：${failures} / ${checks} 项不一致`)
  process.exit(1)
}
