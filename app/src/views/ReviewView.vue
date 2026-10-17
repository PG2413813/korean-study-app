<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { state } from '../core/appState'
import { navigate, toast } from '../core/ui'
import {
  session, feedback, options, flipped, onlyErrors, retryTick, DIRECTIONS, STYLES,
  promptText, answerText, progress, currentWord, isFinished, canInput,
  startReview, setDir, setStyle, submitTyped, chooseOption, selfAssess,
  nextQuestion, restartReview, exitReview, previewQueueSize, restoreFromStorage,
  appealCurrent, startRetry, handleEnter
} from '../core/reviewSession'

const typed = ref('')
const inputBox = ref(null)

const setupDir = ref('zh2ko')
const setupStyle = ref('type')
const available = ref(0)

const isKoPrompt = computed(() => session.value && session.value.dir === 'ko2zh')

onMounted(() => {
  if (!session.value) restoreFromStorage()
  if (session.value && session.value.answered) nextQuestion()
  refreshAvailable()
  document.addEventListener('keydown', onKey)
})
onUnmounted(() => document.removeEventListener('keydown', onKey))

function refreshAvailable() {
  available.value = previewQueueSize()
}
watch(onlyErrors, refreshAvailable)

function begin() {
  const ok = startReview({ dir: setupDir.value, style: setupStyle.value })
  if (!ok) { toast('没有可复习的单词', 'warn'); return }
  typed.value = ''
  nextTick(() => inputBox.value?.focus())
}

watch(() => session.value && session.value.index, () => {
  typed.value = ''
  nextTick(() => inputBox.value?.focus())
})
watch(() => session.value && session.value.style, () => {
  typed.value = ''
  nextTick(() => inputBox.value?.focus())
})

// 重做：清空输入框并重新聚焦
watch(retryTick, () => {
  typed.value = ''
  nextTick(() => inputBox.value?.focus())
})

function onKey(e) {
  const s = session.value
  if (!s) return
  // 焦点在按钮上时交给按钮自己处理，避免回车被响应两次
  if (e.key === 'Enter' && e.target && e.target.tagName === 'BUTTON') return

  if (e.key === 'Enter') {
    e.preventDefault()
    handleEnter(typed.value)
    return
  }
  if (s.style === 'choice' && !s.answered) {
    const n = parseInt(e.key, 10)
    if (n >= 1 && n <= options.value.length) { e.preventDefault(); chooseOption(n - 1) }
  }
}

function speak() {
  const w = currentWord.value
  if (!w) return
  try {
    const u = new SpeechSynthesisUtterance(w.ko)
    u.lang = 'ko-KR'
    u.rate = 0.9
    speechSynthesis.cancel()
    speechSynthesis.speak(u)
  } catch (err) { toast('当前浏览器不支持语音朗读', 'warn') }
}

function quit() {
  exitReview()
  navigate('home')
  toast('已退出本轮复习，进度已保存', 'ok')
}

const modeLabel = computed(() => {
  const d = DIRECTIONS.find((x) => x.id === session.value?.dir)
  return d ? d.label.replace(/\s/g, '') : ''
})
</script>

<template>
  <div class="page">
    <!-- ============ 1. 准备页 ============ -->
    <template v-if="!session">
      <h1 class="page-title">单词复习</h1>

      <div class="panel">
        <div class="mode-pick">
          <label
            v-for="d in DIRECTIONS" :key="d.id"
            class="mode-card" :class="{ on: setupDir === d.id }"
            @click="setupDir = d.id"
          >
            <div class="mc-big">{{ d.label }}</div>
            <div class="mc-sub">{{ d.sub }}</div>
          </label>
        </div>

        <div class="mode-pick three">
          <label
            v-for="s in STYLES" :key="s.id"
            class="mode-card" :class="{ on: setupStyle === s.id }"
            @click="setupStyle = s.id"
          >
            <div class="mc-big" style="font-size:22px">{{ s.em }} {{ s.label }}</div>
          </label>
        </div>

        <div class="stat-line">
          每轮题量：<b>{{ state.settings.roundSize }}</b>　
          <label class="switch">
            <input v-model="onlyErrors" type="checkbox">
            只刷错题（当前{{ onlyErrors ? '开' : '关' }}）
          </label>
        </div>
        <div class="stat-line">
          本轮可复习：<b>{{ available }}</b> 词{{ available === 0 ? '（没有待复习单词）' : '' }}
        </div>

        <div class="toolbar" style="margin-top:12px">
          <button class="btn primary" :disabled="available === 0" @click="begin">开始复习</button>
        </div>
      </div>
    </template>

    <!-- ============ 2. 答题页 ============ -->
    <template v-else-if="!isFinished">
      <div class="panel toolbar" style="align-items:center">
        <div class="bar" style="width:180px;height:7px">
          <i :style="{ width: progress.pct + '%' }"></i>
        </div>
        <span class="tip" style="margin:0">{{ progress.now }} / {{ progress.total }}</span>
        <button
          v-for="d in DIRECTIONS" :key="d.id"
          class="pill" :class="{ on: session.dir === d.id }"
          @click="setDir(d.id)"
        >{{ d.label }}</button>
        <button
          v-for="s in STYLES" :key="s.id"
          class="pill" :class="{ on: session.style === s.id }"
          @click="setStyle(s.id)"
        >{{ s.em }} {{ s.label }}</button>
        <span class="grow"></span>
        <span class="tip" style="margin:0">对 {{ session.correct }} · 错 {{ session.wrong }}</span>
        <button class="btn small" @click="quit">退出</button>
      </div>

      <div class="qstage">
        <!-- 打字 -->
        <div v-if="session.style === 'type'" class="qcard">
          <div class="qmode">{{ modeLabel }}　·　第 {{ session.index + 1 }} / {{ session.queueIds.length }} 题</div>
          <div class="q-prompt" :class="{ ko: isKoPrompt }">
            {{ promptText }}
            <button v-if="isKoPrompt" class="spk" title="朗读" @click="speak">🔊</button>
          </div>
          <div class="q-hint">{{ session.dir === 'zh2ko' ? '看中文，写出韩语' : '看韩语，写出中文释义' }}</div>
          <div class="q-input">
            <input
              ref="inputBox" v-model="typed" class="ko"
              :disabled="!canInput"
              placeholder="输入答案后按回车"
            >
            <button class="btn primary" :disabled="!canInput" @click="submitTyped(typed)">提交</button>
          </div>
          <div v-if="feedback" class="fb" :class="feedback.kind">
            {{ feedback.kind === 'ok' ? '✓' : feedback.kind === 'no' ? '✗' : '⚠' }}
            {{ feedback.text }}
            <b v-if="feedback.strong" style="font-family:var(--font-ko)">{{ feedback.strong }}</b>
            <em v-if="feedback.note" style="font-style:normal;opacity:.85">（{{ feedback.note }}）</em>
          </div>
        </div>

        <!-- 选择题 -->
        <div v-else-if="session.style === 'choice'" class="qcard">
          <div class="qmode">{{ modeLabel }}　·　第 {{ session.index + 1 }} / {{ session.queueIds.length }} 题</div>
          <div class="q-prompt" :class="{ ko: isKoPrompt }">
            {{ promptText }}
            <button v-if="isKoPrompt" class="spk" title="朗读" @click="speak">🔊</button>
          </div>
          <div class="q-hint">
            {{ session.dir === 'zh2ko' ? '选出对应的韩语' : '选出对应的中文释义' }}（按数字键 1–4 作答）
          </div>
          <div class="opts">
            <button
              v-for="(o, i) in options" :key="o.id + i"
              class="opt"
              :class="{
                ko: session.dir === 'zh2ko',
                ok: session.answered && (o.correct || o.text === answerText),
                bad: session.answered && session.picked === i && !o.correct
              }"
              :disabled="session.answered && !session.retrying"
              @click="chooseOption(i)"
            >
              <k>{{ i + 1 }}</k>{{ o.text }}
            </button>
          </div>
          <div v-if="feedback" class="fb" :class="feedback.kind">
            {{ feedback.kind === 'ok' ? '✓' : feedback.kind === 'no' ? '✗' : '⚠' }}
            {{ feedback.text }}
            <b v-if="feedback.strong" style="font-family:var(--font-ko)">{{ feedback.strong }}</b>
            <em v-if="feedback.note" style="font-style:normal;opacity:.85">（{{ feedback.note }}）</em>
          </div>
        </div>

        <!-- 闪卡 -->
        <div v-else class="qcard">
          <div class="qmode">{{ modeLabel }}　·　第 {{ session.index + 1 }} / {{ session.queueIds.length }} 题　·　闪卡</div>
          <div class="flash" :class="{ flipped }" @click="flipped = !flipped">
            <div class="flash-face front">
              <div class="flash-word" :class="{ ko: isKoPrompt }">{{ promptText }}</div>
              <div class="q-hint">点击卡片翻面</div>
            </div>
            <div class="flash-face back">
              <div class="flash-word" :class="{ ko: !isKoPrompt }">{{ answerText }}</div>
              <button class="spk" style="margin-top:10px" title="朗读" @click.stop="speak">🔊</button>
              <div class="q-hint" style="margin-top:8px">自评后进入下一题</div>
            </div>
          </div>
          <div class="self">
            <button class="self-a" :disabled="session.answered" @click="selfAssess('again')">不会</button>
            <button class="self-b" :disabled="session.answered" @click="selfAssess('hard')">模糊</button>
            <button class="self-c" :disabled="session.answered" @click="selfAssess('good')">会了</button>
          </div>
          <div v-if="feedback" class="fb" :class="feedback.kind">
            {{ feedback.kind === 'ok' ? '✓' : feedback.kind === 'no' ? '✗' : '⚠' }} {{ feedback.text }}
          </div>
        </div>
      </div>

      <!-- 操作条：答错时回车重做；申诉后回车下一题 -->
      <div class="toolbar" style="justify-content:center;margin-top:12px">
        <span v-if="feedback && feedback.retryHint" class="tip" style="margin:0">
          按回车重新作答（答对才能进入下一题），或
        </span>
        <span v-else-if="feedback && feedback.appealed" class="tip" style="margin:0">
          按回车进入下一题，或
        </span>
        <button
          v-if="feedback && feedback.appealable"
          class="btn small"
          @click="appealCurrent"
        >我答对了</button>
        <button
          v-if="feedback && feedback.retryHint"
          class="btn small"
          @click="startRetry"
        >重做本题</button>
        <button
          v-if="feedback && feedback.manual"
          class="btn small primary"
          @click="nextQuestion"
        >下一题 →</button>
      </div>
    </template>

    <!-- ============ 3. 小结 ============ -->
    <template v-else>
      <h1 class="page-title">本轮小结</h1>
      <div class="panel center">
        <div class="stat-line">总题数：<b>{{ session.queueIds.length }}</b></div>
        <div class="stat-line">答对：<b>{{ session.correct }}</b>　答错：<b>{{ session.wrong }}</b></div>
        <div class="stat-line">新增错题：<b>{{ session.newErrors }}</b></div>
        <div class="toolbar" style="justify-content:center;margin-top:14px">
          <button class="btn primary" @click="restartReview">再刷一轮</button>
          <button class="btn" @click="quit">返回首页</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mode-pick.three { grid-template-columns: repeat(3, 1fr); }
.mode-card { user-select: none; }

.spk {
  width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, .7); font-size: 15px; line-height: 1;
  border: 1px solid rgba(255, 255, 255, .6);
}
[data-theme="dark"] .spk { background: rgba(60, 80, 88, .6); border-color: rgba(255, 255, 255, .15); }

.q-prompt { justify-content: center; }
.qmode { width: 100%; text-align: center; }

.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 620px; }
.opt {
  display: flex; align-items: center; gap: 10px; min-height: 54px;
  padding: 10px 14px; border-radius: 14px; font-size: 16px; text-align: left;
  background: rgba(255, 255, 255, .55); border: 1px solid rgba(255, 255, 255, .6);
  color: var(--ink);
}
[data-theme="dark"] .opt { background: rgba(40, 52, 58, .45); border-color: rgba(255, 255, 255, .12); }
.opt.ko { font-family: var(--font-ko); }
.opt k { font-size: 12px; opacity: .6; font-family: var(--font-sans); }
.opt.ok { background: var(--ok-soft); border-color: transparent; color: var(--ok); font-weight: var(--fw-bold); }
.opt.bad { background: var(--err-soft); border-color: transparent; color: var(--err); }

.flash { perspective: 1200px; width: 100%; min-height: 260px; cursor: pointer; }
.flash-face {
  background: rgba(255, 255, 255, .35); border: 1px solid rgba(255, 255, 255, .55);
  border-radius: 20px; padding: 28px 20px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  min-height: 260px;
}
[data-theme="dark"] .flash-face { background: rgba(40, 52, 58, .35); border-color: rgba(255, 255, 255, .12); }
.flash.flipped .front { display: none; }
.flash:not(.flipped) .back { display: none; }
.flash-word { font-size: 52px; font-weight: var(--fw-black); }

.self { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; width: 100%; max-width: 620px; margin-top: 16px; }
.self button {
  padding: 14px; border-radius: 14px; font-size: 15px; font-weight: var(--fw-bold);
  background: rgba(255, 255, 255, .6); border: 1px solid rgba(255, 255, 255, .6); color: var(--ink);
}
[data-theme="dark"] .self button { background: rgba(40, 52, 58, .45); border-color: rgba(255, 255, 255, .12); }
.self-a { color: var(--err) !important; }
.self-b { color: var(--warn) !important; }
.self-c { background: var(--grad) !important; color: #fff !important; border-color: transparent !important; }

.fb { width: 100%; margin-top: 16px; }
.fb b { font-weight: var(--fw-bold); }

@media (max-width: 639px) {
  .mode-pick.three { grid-template-columns: 1fr 1fr; }
  .opts { grid-template-columns: 1fr; }
  .flash-word { font-size: 38px; }
}
</style>
