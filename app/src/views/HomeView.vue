<script setup>
/** 首页 —— 版式与样式均与旧版一致：三张统计卡 + 快捷录入 + 快捷入口 + 计时 + 今日小卡 */
import { computed, ref, nextTick } from 'vue'
import { state, stats, addWord, mergeEntry, today } from '../core/appState'
import { toast, navigate, confirmDialog, fmtDuration } from '../core/ui'
import { timerRunning, timerSeconds, toggleTimer } from '../core/studyTimer'
import { idolUrl } from '../core/media'

const koInput = ref(null)
const zhInput = ref(null)
const qkKo = ref('')
const qkZh = ref('')

function focusKo() {
  nextTick(() => koInput.value?.focus())
}

function doQuickAdd() {
  const res = addWord(qkKo.value, qkZh.value, [])
  if (res.status === 'added') {
    qkKo.value = ''
    qkZh.value = ''
    toast('已添加', 'ok')
    focusKo()
    return
  }
  if (res.status === 'duplicate') {
    const dup = res.existing
    confirmDialog({
      title: '该单词已存在',
      text: `${dup.ko} = ${dup.zh}。要合并释义吗？`,
      confirmText: '合并',
      onConfirm: () => {
        mergeEntry(dup.id, qkZh.value, [])
        qkKo.value = ''
        qkZh.value = ''
        toast('已合并', 'ok')
        focusKo()
      }
    })
    return
  }
  toast('韩语和中文都不能为空', 'warn')
}
</script>

<template>
  <div class="page">
    <!-- 三张统计卡 -->
    <div class="cards">
      <div class="card clickable" @click="navigate('review')">
        <div class="num">{{ stats.dueReview }}</div>
        <div class="lbl">今日待复习</div>
        <div class="arrow">›</div>
      </div>
      <div class="card clickable" @click="navigate('add')">
        <div class="num">{{ stats.newAdded }}</div>
        <div class="lbl">今日新录入</div>
        <div class="arrow">›</div>
      </div>
      <div class="card clickable" @click="navigate('errors')">
        <div class="num">{{ stats.errorCount }}</div>
        <div class="lbl">错题总数</div>
        <div class="arrow">›</div>
      </div>
    </div>

    <!-- 快捷录入 -->
    <div class="panel toolbar">
      <input
        ref="koInput" v-model="qkKo" class="input ko" style="flex:1"
        placeholder="韩语单词，如 공부하다"
        @keydown.enter.prevent="zhInput?.focus()"
      >
      <input
        ref="zhInput" v-model="qkZh" class="input" style="flex:1"
        placeholder="中文释义，如 学习"
        @keydown.enter.prevent="doQuickAdd"
      >
      <button class="btn primary" @click="doQuickAdd">添加</button>
    </div>

    <!-- 快捷入口 -->
    <div class="toolbar">
      <button class="btn primary" @click="navigate('review')">开始今日复习</button>
      <button class="btn" @click="navigate('errors')">打开错题库</button>
    </div>

    <!-- 计时 -->
    <div class="panel center">
      <div class="stat-line">今日有效学习时长：<b>{{ fmtDuration(timerSeconds) }}</b></div>
      <button class="btn" :class="{ primary: !timerRunning }" style="margin-top:10px" @click="toggleTimer">
        {{ timerRunning ? '⏸ 暂停计时' : '▶ 开始计时' }}
      </button>
      <div class="tip">计时仅在页面前台且有操作时累计，后台挂机、闲置 5 分钟自动暂停</div>
    </div>

    <!-- 今日小卡 + 累计统计 -->
    <div class="home-extra">
      <div class="panel center">
        <div class="stat-line" style="margin-bottom:6px">今日小卡</div>
        <div v-if="idolUrl" class="polaroid">
          <img :src="idolUrl" alt="아이돌" @error="(e) => (e.target.style.display = 'none')">
          <div class="cap">오늘의 아이돌 ♡</div>
        </div>
        <div v-else class="tip" style="margin-top:6px">
          把照片放进 backgrounds/ 目录（文件名以 idol 开头）即可轮换显示
        </div>
      </div>
      <div class="panel">
        <div class="stat-line">累计单词：<b>{{ stats.totalWords }}</b></div>
        <div class="stat-line">连续学习：<b>{{ stats.studyDays }}</b> 天</div>
        <div class="stat-line">
          今日新增：<b>{{ stats.newAdded }}</b>　待复习：<b>{{ stats.dueReview }}</b>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-extra { margin-bottom: 16px; }
.stat-line:last-child { margin-bottom: 0; }

@media (max-width: 639px) {
  .panel.toolbar { flex-direction: column; align-items: stretch; }
  .panel.toolbar .btn { width: 100%; }
}
</style>
