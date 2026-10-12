<script setup>
/** 每日学习录入 —— 版式与样式与旧版一致 */
import { ref, computed, nextTick } from 'vue'
import { state, addWord, mergeEntry, removeWord, wordsOrdered, toggleWordsOrder } from '../core/appState'
import { today, toast, confirmDialog, openModal } from '../core/ui'
import { splitMeanings, normalizeText } from '../core/core'

const ko = ref('')
const zh = ref('')
const tags = ref('')
const koInput = ref(null)
const zhInput = ref(null)

const todayWords = computed(() => wordsOrdered(state.words.filter((w) => w.createdAt === today())))

function reset() {
  ko.value = ''
  zh.value = ''
  tags.value = ''
}

function submit() {
  const res = addWord(ko.value, zh.value, splitMeanings(tags.value))
  if (res.status === 'added') {
    reset()
    toast('已添加', 'ok')
    nextTick(() => koInput.value?.focus())
    return
  }
  if (res.status === 'duplicate') {
    const dup = res.existing
    confirmDialog({
      title: '该单词已存在',
      text: `${dup.ko} = ${dup.zh}。合并会把新释义和标签补进去，不改动录入日期与复习进度。`,
      confirmText: '合并释义到已有',
      onConfirm: () => {
        mergeEntry(dup.id, zh.value, splitMeanings(tags.value))
        reset()
        toast('已合并', 'ok')
        nextTick(() => koInput.value?.focus())
      }
    })
    return
  }
  toast('韩语和中文都不能为空', 'warn')
}

function onZhEnter() {
  if (!normalizeText(ko.value)) koInput.value?.focus()
  else submit()
}

function askDelete(w) {
  confirmDialog({
    title: '确认删除',
    text: `确定删除「${w.ko} = ${w.zh}」吗？`,
    confirmText: '删除',
    danger: true,
    onConfirm: () => { removeWord(w.id); toast('已删除', 'ok') }
  })
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">每日学习录入</h1>

    <div class="panel toolbar">
      <input
        ref="koInput" v-model="ko" class="input ko" style="flex:1;min-width:150px"
        placeholder="韩语单词"
        @keydown.enter.prevent="zhInput?.focus()"
      >
      <input
        ref="zhInput" v-model="zh" class="input" style="flex:1;min-width:150px"
        placeholder="中文释义"
        @keydown.enter.prevent="onZhEnter"
      >
      <input
        v-model="tags" class="input" style="flex:1;min-width:150px"
        placeholder="标签（可选，动词、名词）"
        @keydown.enter.prevent="submit"
      >
      <button class="btn primary" @click="submit">添加并继续</button>
    </div>

    <h1 class="page-title" style="margin-top:18px">
      今日已录（{{ todayWords.length }}）
      <button class="pill" style="margin-left:12px" @click="toggleWordsOrder">
        {{ state.settings.wordsOrder === 'desc' ? '倒序 ⇧' : '顺序 ⇩' }}
      </button>
    </h1>

    <div class="list">
      <template v-if="todayWords.length">
        <div v-for="w in todayWords" :key="w.id" class="row">
          <span class="ko">{{ w.ko }}</span>
          <span class="zh">{{ w.zh }}</span>
          <span class="meta">
            <span v-for="t in w.tags" :key="t" class="tag">{{ t }}</span>
          </span>
          <span class="ops">
            <button class="btn small" @click="openModal('editWord', { wordId: w.id })">编辑</button>
            <button class="btn small danger" @click="askDelete(w)">删除</button>
          </span>
        </div>
      </template>
      <div v-else class="empty">今天还没有录入新单词</div>
    </div>

    <div class="tip">自动记录日期；今天录入的单词，明天自动进入复习池。</div>
  </div>
</template>

<style scoped>
@media (max-width: 639px) {
  .panel.toolbar { flex-direction: column; align-items: stretch; }
  .panel.toolbar .btn { width: 100%; }
}
</style>
