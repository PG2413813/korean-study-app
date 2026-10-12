<script setup>
import { ref, computed, watch } from 'vue'
import { state, doExport, doImport, saveSettings, resetSettings, theme, setTheme, THEMES, persist } from '../core/appState'
import { toast, confirmDialog, today } from '../core/ui'
import {
  BG_LIST, IDOL_LIST, bgMedia, idolMedia, backgroundUrl, idolUrl,
  setMedia, resetMedia, fileToCompressedDataURL, dataUrlSize, fmtBytes
} from '../core/media'
import {
  snapshots, lastSavedAt, ensureDailySnapshot, snapshotDates, readSnapshot,
  clearSnapshots, fmtSavedAt, RETENTION_DAYS
} from '../core/snapshots'

const roundSize = ref(state.settings.roundSize)
const removeAfter = ref(state.settings.removeAfter)
const autoNext = ref(state.settings.autoNextDelay == null ? 700 : state.settings.autoNextDelay)
const fileInput = ref(null)
const bgFile = ref(null)
const idolFile = ref(null)

watch(() => state.settings.roundSize, (v) => { roundSize.value = v })
watch(() => state.settings.removeAfter, (v) => { removeAfter.value = v })

const baseName = (p) => String(p).split('/').pop()
const bgCustomSize = computed(() => dataUrlSize(bgMedia.value.custom))
const idolCustomSize = computed(() => dataUrlSize(idolMedia.value.custom))
const MAX_CUSTOM_BYTES = 1.6 * 1024 * 1024

/* 缩略图样式：在脚本里拼好，避免模板里的引号转义把可读性搞乱 */
const bgThumbStyle = computed(() => (backgroundUrl.value ? { backgroundImage: 'url("' + backgroundUrl.value + '")' } : {}))
const idolThumbStyle = computed(() => (idolUrl.value ? { backgroundImage: 'url("' + idolUrl.value + '")' } : {}))

/* ---------------- 备份与设置 ---------------- */

function persistSettings() {
  saveSettings({
    roundSize: Number(roundSize.value),
    removeAfter: Number(removeAfter.value),
    autoNextDelay: Number(autoNext.value)
  })
  roundSize.value = state.settings.roundSize
  removeAfter.value = state.settings.removeAfter
  autoNext.value = state.settings.autoNextDelay
  toast('设置已保存', 'ok')
}

function onExport() {
  const text = doExport()
  const blob = new Blob([text], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '韩语学习备份_' + today() + '.json'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  document.body.removeChild(a)
  toast('已导出备份文件', 'ok')
}

function pickFile() { fileInput.value?.click() }

function onFile(e) {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const text = String(reader.result)
    confirmDialog({
      title: '导入备份',
      text: '导入将用备份文件覆盖当前全部数据，确定继续吗？',
      confirmText: '确认导入',
      danger: true,
      onConfirm: () => {
        const res = doImport(text)
        if (res.ok) {
          roundSize.value = state.settings.roundSize
          removeAfter.value = state.settings.removeAfter
          autoNext.value = state.settings.autoNextDelay == null ? 700 : state.settings.autoNextDelay
          toast('导入成功', 'ok')
        } else {
          toast('导入失败：' + res.error, 'err')
        }
      }
    })
  }
  reader.readAsText(file, 'utf-8')
  e.target.value = ''
}

function askReset() {
  confirmDialog({
    title: '恢复默认设置',
    text: '每轮题量回到 20，移出次数回到 3，自动跳转回到 0.7 秒。单词数据不受影响。',
    confirmText: '恢复默认',
    onConfirm: () => {
      resetSettings()
      roundSize.value = state.settings.roundSize
      removeAfter.value = state.settings.removeAfter
      autoNext.value = 700
      toast('已恢复默认设置', 'ok')
    }
  })
}

/* ---------------- 图片素材 ---------------- */

function changeMode(kind, mode) {
  setMedia(kind, { mode })
}

function changePick(kind, url) {
  setMedia(kind, { mode: 'fixed', pick: url })
}

function useDaily(kind) {
  resetMedia(kind)
  toast('已切回每日自动轮换', 'ok')
}

async function onUpload(kind, e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  try {
    const dataUrl = await fileToCompressedDataURL(file)
    const size = dataUrlSize(dataUrl)
    if (size > MAX_CUSTOM_BYTES) {
      toast('图片压缩后仍有 ' + fmtBytes(size) + '，超过 1.6MB 上限，请换一张小一点的', 'err')
      return
    }
    setMedia(kind, { mode: 'custom', custom: dataUrl })
    toast('已应用你上传的图片（' + fmtBytes(size) + '）', 'ok')
  } catch (err) {
    toast(String(err.message || err), 'err')
  }
}

function clearCustom(kind) {
  const cur = kind === 'bg' ? bgMedia.value : idolMedia.value
  setMedia(kind, { mode: 'daily', pick: cur.pick, custom: null })
  toast('已删除上传的图片', 'ok')
}

/* ---------------- 自动保存 ---------------- */

const snapshotList = computed(() => snapshotDates().map((d) => ({
  date: d,
  savedAt: snapshots[d] && snapshots[d].savedAt
})))

function saveNow() {
  ensureDailySnapshot(true)
  toast('已立即保存一份快照', 'ok')
}

function restoreSnapshot(date) {
  const data = readSnapshot(date)
  if (!data) { toast('这份快照读不出来', 'err'); return }
  confirmDialog({
    title: '恢复这份自动保存',
    text: `将用 ${date} 的快照覆盖当前的单词与学习记录（你上传的背景/小卡图片会保留）。确定吗？`,
    confirmText: '恢复',
    danger: true,
    onConfirm: () => {
      if (Array.isArray(data.words)) state.words = data.words
      if (data.studyLog) state.studyLog = data.studyLog
      if (data.settings) {
        const keepBg = state.settings.bg
        const keepIdol = state.settings.idol
        state.settings = Object.assign({}, data.settings)
        state.settings.bg = keepBg
        state.settings.idol = keepIdol
      }
      persist()
      toast('已恢复到 ' + date + ' 的数据', 'ok')
    }
  })
}

/* ---------------- 危险操作：两次确认 ---------------- */

function askClearAll() {
  // 第一次确认
  confirmDialog({
    title: '清空全部学习数据',
    text: '将删除所有单词、错题与学习记录，此操作不可恢复。确定要继续吗？',
    confirmText: '继续',
    danger: true,
    onConfirm: () => {
      // 第二次确认
      confirmDialog({
        title: '再次确认：真的要清空吗？',
        text: '这是最后一次确认。点击「确认清空」后会立即删除全部学习数据，并连同自动保存的快照一起清掉，无法撤销。建议先导出备份。',
        confirmText: '确认清空',
        danger: true,
        onConfirm: () => {
          state.words = []
          state.studyLog = {}
          persist()          // 必须写回，否则只改了内存、刷新就回来了
          clearSnapshots()
          toast('已清空全部学习数据', 'ok')
        }
      })
    }
  })
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">数据与设置</h1>

    <div class="panel">
      <h3 style="font-size:14px;margin-bottom:8px">备份与恢复</h3>
      <div class="toolbar">
        <button class="btn primary" @click="onExport">导出备份文件</button>
        <button class="btn" @click="pickFile">导入恢复文件</button>
        <input ref="fileInput" type="file" accept=".json,application/json" style="display:none" @change="onFile">
      </div>
      <div class="tip">备份文件是通用 JSON，含单词、错题、设置与学习记录；导入前会二次确认。</div>
    </div>

    <div class="panel">
      <h3 style="font-size:14px;margin-bottom:8px">偏好设置</h3>
      <div class="toolbar">
        <span style="line-height:32px">每轮题量：<input v-model.number="roundSize" type="number" min="1" max="100" style="width:80px"></span>
        <span style="line-height:32px">连续答对移出次数：<input v-model.number="removeAfter" type="number" min="1" max="10" style="width:80px"></span>
        <span style="line-height:32px">答对后自动跳转：<input v-model.number="autoNext" type="number" min="0" max="3000" step="100" style="width:90px"> 毫秒</span>
      </div>
      <div class="tip">自动跳转填 0 表示不自动跳，需手动按回车或点「下一题」。</div>

      <div class="toolbar" style="margin-top:12px">
        <span style="line-height:32px">主题色：</span>
        <button
          v-for="t in THEMES" :key="t.id"
          class="pill" :class="{ on: theme === t.id }"
          @click="setTheme(t.id)"
        >{{ t.label }}</button>
      </div>

      <div class="toolbar" style="margin-top:12px">
        <button class="btn primary" @click="persistSettings">保存设置</button>
        <button class="btn" @click="askReset">恢复默认设置</button>
      </div>
    </div>

    <!-- 图片素材 -->
    <div class="panel">
      <h3 style="font-size:14px;margin-bottom:12px">图片素材</h3>

      <div class="media-row">
        <div class="media-box">
          <div class="media-thumb" :style="bgThumbStyle"></div>
          <div class="media-cap">页面背景</div>
        </div>
        <div class="media-main">
          <div class="toolbar" style="margin-bottom:8px">
            <button class="pill" :class="{ on: bgMedia.mode === 'daily' }" @click="useDaily('bg')">跟随每日轮换</button>
            <button class="pill" :class="{ on: bgMedia.mode === 'fixed' }" @click="changeMode('bg', 'fixed')">固定一张</button>
            <button
              class="pill" :class="{ on: bgMedia.mode === 'custom' }"
              :disabled="!bgMedia.custom"
              @click="changeMode('bg', 'custom')"
            >用我上传的</button>
          </div>
          <div v-if="bgMedia.mode === 'fixed'" class="toolbar">
            <span style="line-height:32px;font-size:13px">选择图片：</span>
            <select :value="bgMedia.pick || ''" @change="changePick('bg', $event.target.value)" style="min-width:220px">
              <option value="" disabled>请选择</option>
              <option v-for="p in BG_LIST" :key="p" :value="p">{{ baseName(p) }}</option>
            </select>
            <span class="tip" style="margin:0">（共 {{ BG_LIST.length }} 张，放新图请加到 backgrounds/ 并重新构建）</span>
          </div>
          <div class="toolbar">
            <label class="btn small">
              上传本地图片
              <input ref="bgFile" type="file" accept="image/*" style="display:none" @change="onUpload('bg', $event)">
            </label>
            <button v-if="bgMedia.custom" class="btn small danger" @click="clearCustom('bg')">
              删除已上传（{{ fmtBytes(bgCustomSize) }}）
            </button>
          </div>
        </div>
      </div>

      <div class="media-row" style="margin-top:16px">
        <div class="media-box">
          <div class="media-thumb" :style="idolThumbStyle"></div>
          <div class="media-cap">偶像小卡</div>
        </div>
        <div class="media-main">
          <div class="toolbar" style="margin-bottom:8px">
            <button class="pill" :class="{ on: idolMedia.mode === 'daily' }" @click="useDaily('idol')">跟随每日轮换</button>
            <button class="pill" :class="{ on: idolMedia.mode === 'fixed' }" @click="changeMode('idol', 'fixed')">固定一张</button>
            <button
              class="pill" :class="{ on: idolMedia.mode === 'custom' }"
              :disabled="!idolMedia.custom"
              @click="changeMode('idol', 'custom')"
            >用我上传的</button>
          </div>
          <div v-if="idolMedia.mode === 'fixed'" class="toolbar">
            <span style="line-height:32px;font-size:13px">选择图片：</span>
            <select :value="idolMedia.pick || ''" @change="changePick('idol', $event.target.value)" style="min-width:220px">
              <option value="" disabled>请选择</option>
              <option v-for="p in IDOL_LIST" :key="p" :value="p">{{ baseName(p) }}</option>
            </select>
            <span class="tip" style="margin:0">（共 {{ IDOL_LIST.length }} 张）</span>
          </div>
          <div class="toolbar">
            <label class="btn small">
              上传本地图片
              <input ref="idolFile" type="file" accept="image/*" style="display:none" @change="onUpload('idol', $event)">
            </label>
            <button v-if="idolMedia.custom" class="btn small danger" @click="clearCustom('idol')">
              删除已上传（{{ fmtBytes(idolCustomSize) }}）
            </button>
          </div>
        </div>
      </div>

      <div class="tip">上传的图片会压缩后存进本机浏览器（上限 1.6MB/张），不会上传到任何服务器。</div>
    </div>

    <!-- 自动保存 -->
    <div class="panel">
      <h3 style="font-size:14px;margin-bottom:8px">学习数据自动保存</h3>
      <div class="stat-line">保存规则：每天零点自动保存一次，保留最近 <b>{{ RETENTION_DAYS }}</b> 天，到期自动删除。</div>
      <div class="stat-line">最近一次保存：<b>{{ fmtSavedAt(lastSavedAt) }}</b></div>
      <div class="stat-line">当前保留：<b>{{ snapshotList.length }}</b> 份</div>

      <div v-if="snapshotList.length" class="list" style="margin:12px 0">
        <div v-for="s in snapshotList" :key="s.date" class="row">
          <span class="ko">{{ s.date }}</span>
          <span class="zh">{{ fmtSavedAt(s.savedAt) }} 保存</span>
          <span class="ops">
            <button class="btn small" @click="restoreSnapshot(s.date)">恢复</button>
          </span>
        </div>
      </div>
      <div v-else class="tip">还没有快照，点下面的按钮可以立即存一份。</div>

      <div class="toolbar" style="margin-top:12px">
        <button class="btn" @click="saveNow">立即保存一份</button>
      </div>
      <div class="tip">
        应用是纯本地的，只能在你打开页面时执行：零点时开着就会准时保存；
        如果零点没开，当天首次打开时也会补上。
      </div>
    </div>

    <!-- 危险操作 -->
    <div class="panel">
      <h3 style="font-size:14px;margin-bottom:8px">危险操作</h3>
      <button class="btn danger" @click="askClearAll">清空全部学习数据</button>
      <div class="tip">只清空单词与学习记录（含自动保存的快照），不动设置项。清空前请先导出备份。</div>
    </div>

    <div class="tip" style="text-align:center">
      全部数据仅保存在本机浏览器中，无需登录联网。建议定期导出备份，防止浏览器数据被清理。
    </div>
  </div>
</template>

<style scoped>
.media-row { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.media-box { width: 150px; flex-shrink: 0; }
.media-thumb {
  width: 150px; height: 96px; border-radius: 10px;
  background-color: rgba(255, 255, 255, .5);
  background-size: cover; background-position: center;
  border: 1px solid rgba(255, 255, 255, .6);
}
.media-cap { text-align: center; font-size: 12.5px; color: var(--sub); margin-top: 6px; }
.media-main { flex: 1; min-width: 240px; }
.pill:disabled { opacity: .45; cursor: not-allowed; }
@media (max-width: 639px) {
  .media-box { width: 100%; }
  .media-thumb { width: 100%; height: 130px; }
}
</style>
