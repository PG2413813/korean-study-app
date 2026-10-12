<script>
/* 模块级变量：离开单词库超过 5 秒再回来时重置搜索与页码（保留旧版行为） */
let lastTouchedAt = 0
const PAGE_SIZE = 50
</script>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { state, allTags, wordsOrdered, toggleWordsOrder, removeWord } from '../core/appState'
import { today, toast, confirmDialog, openModal } from '../core/ui'
import * as C from '../core/core'

const searchQuery = ref('')
const activeTag = ref('全部')
const page = ref(1)

onMounted(() => {
  if (Date.now() - lastTouchedAt > 5000) {
    searchQuery.value = ''
    activeTag.value = '全部'
    page.value = 1
  }
})

const filtered = computed(() => {
  const q = C.normalizeText(searchQuery.value)
  const list = state.words.filter((w) => {
    if (activeTag.value !== '全部' && w.tags.indexOf(activeTag.value) < 0) return false
    if (q && w.ko.indexOf(q) < 0 && w.zh.indexOf(q) < 0) return false
    return true
  })
  return wordsOrdered(list)
})

const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE_SIZE)))

const pageItems = computed(() => {
  if (page.value > totalPages.value) page.value = totalPages.value
  if (page.value < 1) page.value = 1
  const start = (page.value - 1) * PAGE_SIZE
  return filtered.value.slice(start, start + PAGE_SIZE)
})

const pageNumbers = computed(() => {
  const set = new Set([1, totalPages.value])
  for (let d = -2; d <= 2; d++) {
    const n = page.value + d
    if (n >= 1 && n <= totalPages.value) set.add(n)
  }
  return [...set].sort((a, b) => a - b)
})

function touch() { lastTouchedAt = Date.now() }
function onSearch() { touch(); page.value = 1 }
function pickTag(t) { touch(); activeTag.value = t; page.value = 1 }

function statusOf(w) {
  if (w.isError) return { text: `错题 ${w.correctStreak}/${state.settings.removeAfter}`, cls: 'err' }
  if (w.createdAt === today()) return { text: '新词', cls: '' }
  if (w.lastReviewedAt === today()) return { text: '今日已复习', cls: 'ok' }
  return { text: '待复习', cls: 'warn' }
}

function askDelete(w) {
  confirmDialog({
    title: '确认删除',
    text: `确定删除「${w.ko} = ${w.zh}」吗？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
    onConfirm: () => { removeWord(w.id); toast('已删除', 'ok') }
  })
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">单词库（{{ state.words.length }}）</h1>

    <div class="toolbar">
      <input
        v-model="searchQuery" class="search-input"
        placeholder="搜索韩语或中文" style="flex:1;min-width:180px"
        @input="onSearch"
      >
    </div>

    <div class="toolbar">
      <button class="tag" :class="{ on: activeTag === '全部' }" @click="pickTag('全部')">全部</button>
      <button
        v-for="t in allTags" :key="t"
        class="tag" :class="{ on: activeTag === t }"
        @click="pickTag(t)"
      >{{ t }}</button>
      <button class="pill" style="margin-left:auto" @click="toggleWordsOrder">
        {{ state.settings.wordsOrder === 'desc' ? '倒序 ⇧' : '顺序 ⇩' }}
      </button>
    </div>

    <div class="list">
      <template v-if="pageItems.length">
        <div v-for="w in pageItems" :key="w.id" class="row">
          <span class="ko">{{ w.ko }}</span>
          <span class="zh">{{ w.zh }}</span>
          <span class="meta">
            <span v-for="t in w.tags" :key="t" class="tag">{{ t }}</span>
            {{ w.createdAt }}
            <span class="st" :class="statusOf(w).cls">{{ statusOf(w).text }}</span>
          </span>
          <span class="ops">
            <button class="btn small" @click="openModal('editWord', { wordId: w.id })">编辑</button>
            <button class="btn small danger" @click="askDelete(w)">删除</button>
          </span>
        </div>
      </template>
      <div v-else class="empty">
        {{ searchQuery || activeTag !== '全部' ? '没有匹配的单词' : '单词库还是空的，去「每日学习录入」添加吧' }}
      </div>
    </div>

    <div v-if="totalPages > 1" class="pager">
      <button class="pg" :disabled="page <= 1" @click="page--; touch()">‹ 上一页</button>
      <template v-for="(n, i) in pageNumbers" :key="n">
        <span v-if="i > 0 && n - pageNumbers[i - 1] > 1" class="pg-gap">…</span>
        <button class="pg pg-num" :class="{ on: n === page }" @click="page = n; touch()">{{ n }}</button>
      </template>
      <button class="pg" :disabled="page >= totalPages" @click="page++; touch()">下一页 ›</button>
      <span class="pg-info">共 {{ filtered.length }} 词 / {{ totalPages }} 页</span>
    </div>
  </div>
</template>

<style scoped>
.search-input { width: 100%; }
.st { margin-left: 4px; }
.st.ok { color: var(--ok); }
.st.warn { color: var(--warn); }
.st.err { color: var(--err); }
.pg-gap { color: var(--sub); padding: 0 4px; }
.pg-info { font-size: 13px; color: var(--sub); }

@media (max-width: 639px) {
  .row .meta { flex-basis: 100%; order: 3; }
}
</style>
