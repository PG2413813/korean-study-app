/**
 * 存储层：优先 IndexedDB，不可用时自动退回 localStorage。
 *
 * 为什么换掉 localStorage：
 *   - 上限只有约 5MB，而现在已经用了 3MB+（1874 个词 + 学习记录 + 自定义图片），快到顶了；
 *   - 它是同步 API，数据一大每次写入都会卡住界面；
 *   - 后面要做多端同步，需要「按记录读写」的能力，localStorage 只能整份覆盖。
 *
 * 为什么保留 localStorage 回退：
 *   - 测试环境（jsdom）没有 IndexedDB；
 *   - 少数浏览器/隐私模式下 IndexedDB 不可用，退回 localStorage 至少还能用。
 *   两条路径的对外行为一致，上层不需要关心用的哪一种。
 *
 * 说明：快照、复习会话这些小数据仍然留在 localStorage（体积小、且是设备本地的东西），
 * 只有主数据（单词 / 学习记录 / 设置）搬进 IndexedDB。
 */

const DB_NAME = 'hanStudyApp'
const DB_VERSION = 1
const STORE = 'kv'
const KEY_STATE = 'state'

/** 旧版主数据的 localStorage key（迁移来源，也作为回退时的存储位置） */
export const LEGACY_KEY = 'hanStudyApp.v1'

let mode = 'unknown'
let dbPromise = null

/**
 * 打开/操作 IndexedDB 的超时时间。
 * 为什么必须有：IndexedDB 在部分环境下会「不报错也不回调」（隐私模式、
 * 存储被策略禁用、无头浏览器等）。没有超时的话 wait 会永远不返回，
 * 应用就会卡在白屏 —— 这是比"用不上 IndexedDB"严重得多的故障。
 * 超时后按不可用处理，退回 localStorage。
 */
const IDB_TIMEOUT_MS = 2000

function withTimeout(promise, ms = IDB_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), ms))
  ])
}

function hasIndexedDB() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch (e) {
    return false
  }
}

function openDb() {
  if (!hasIndexedDB()) return Promise.resolve(null)
  if (dbPromise) return dbPromise
  dbPromise = withTimeout(new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (e) {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  }))
  return dbPromise
}

function idbGet(key) {
  return openDb().then((db) => {
    if (!db) return undefined
    return withTimeout(new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readonly')
        const r = tx.objectStore(STORE).get(key)
        r.onsuccess = () => resolve(r.result)
        r.onerror = () => resolve(undefined)
      } catch (e) {
        resolve(undefined)
      }
    }))
  })
}

function idbPut(key, value) {
  return openDb().then((db) => {
    if (!db) return false
    return withTimeout(new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => resolve(true)
        tx.onerror = () => resolve(false)
        tx.onabort = () => resolve(false)
      } catch (e) {
        resolve(false)
      }
    })).then((r) => r === true)
  })
}

/** 探测可用存储，并缓存结果。初始化时调用一次即可。 */
export async function detectStorage() {
  const db = await openDb()
  mode = db ? 'indexeddb' : 'localstorage'
  return mode
}

export function storageMode() {
  return mode
}

/* ---------------- 旧数据（localStorage） ---------------- */

function readLegacyRaw() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function writeLegacyRaw(obj) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(obj))
  } catch (e) { /* 配额不足等，忽略 */ }
}

/* ---------------- 对外接口 ---------------- */

/** 读取主数据。返回解析后的对象；没有则返回 null。 */
export async function loadRaw() {
  if (mode === 'unknown') await detectStorage()
  if (mode === 'indexeddb') {
    const v = await idbGet(KEY_STATE)
    if (v !== undefined && v !== null) return v
    return null
  }
  return readLegacyRaw()
}

/** 写入主数据。返回是否成功。 */
export async function saveRaw(obj) {
  if (mode === 'unknown') await detectStorage()
  if (mode === 'indexeddb') {
    const ok = await idbPut(KEY_STATE, obj)
    if (ok) return true
    // IndexedDB 写失败（配额/被禁用）时退回 localStorage，至少别丢数据
    mode = 'localstorage'
    writeLegacyRaw(obj)
    return true
  }
  writeLegacyRaw(obj)
  return true
}

/**
 * 把 localStorage 里的旧数据迁移到 IndexedDB。
 * 迁移完成后**不删除** localStorage 的副本 —— 留作安全网，
 * 万一新存储出问题还能回退。
 * 返回是否发生了迁移。
 */
export async function migrateFromLegacy() {
  if (mode === 'unknown') await detectStorage()
  if (mode !== 'indexeddb') return false
  const legacy = readLegacyRaw()
  if (!legacy) return false
  const existing = await idbGet(KEY_STATE)
  if (existing !== undefined && existing !== null) return false
  return idbPut(KEY_STATE, legacy)
}

/** 仅供测试/调试：把已迁移的旧副本清掉 */
export function clearLegacyCopy() {
  try { localStorage.removeItem(LEGACY_KEY) } catch (e) { /* noop */ }
}
