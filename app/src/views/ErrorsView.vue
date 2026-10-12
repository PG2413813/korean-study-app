<script setup>
import { computed } from 'vue'
import { state, errorWords, clearError, removeWord } from '../core/appState'
import { toast, confirmDialog, openModal, navigate } from '../core/ui'
import { onlyErrors } from '../core/reviewSession'

const removeAfter = computed(() => state.settings.removeAfter || 3)
function pctOf(w) { return Math.min(100, Math.round(((w.correctStreak | 0) / removeAfter.value) * 100)) }

function askRemove(w) {
  confirmDialog({
    title: '移出错题库',
    text: `「${w.ko} = ${w.zh}」将回归普通词库，连续答对进度清零。`,
    confirmText: '移出',
    onConfirm: () => { clearError(w.id); toast('已移出错题库', 'ok') }
  })
}

function askDelete(w) {
  confirmDialog({
    title: '确认删除',
    text: `确定彻底删除「${w.ko} = ${w.zh}」吗？此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
    onConfirm: () => { removeWord(w.id); toast('已删除', 'ok') }
  })
}
</script>

<template>
  <div class="page">
    <h1 class="page-title">
      错题库管理（{{ errorWords.length }}）
      <button class="pill" style="margin-left:12px" @click="navigate('review')">去复习</button>
    </h1>

    <div class="panel toolbar">
      <label class="switch">
        <input v-model="onlyErrors" type="checkbox">
        只刷错题（开启后复习只出错误题）
      </label>
    </div>

    <div class="list">
      <template v-if="errorWords.length">
        <div v-for="w in errorWords" :key="w.id" class="row">
          <span class="ko">{{ w.ko }}</span>
          <span class="zh">{{ w.zh }}</span>
          <span class="meta">
            <span class="bar"><i :style="{ width: pctOf(w) + '%' }"></i></span>
            {{ w.correctStreak | 0 }}/{{ removeAfter }}
            <span class="tag">{{ w.errorSince || '—' }}</span>
          </span>
          <span class="ops">
            <button class="btn small" @click="openModal('editWord', { wordId: w.id })">编辑</button>
            <button class="btn small" @click="askRemove(w)">移除</button>
            <button class="btn small danger" @click="askDelete(w)">删除</button>
          </span>
        </div>
      </template>
      <div v-else class="empty">错题库是空的，继续加油</div>
    </div>

    <div class="tip">
      错题在复习中随机出现；连续答对满 {{ removeAfter }} 次自动移出错题库，回归普通词库。
    </div>
  </div>
</template>

<style scoped>
.meta { gap: 8px; }
@media (max-width: 639px) {
  .meta .tag { display: none; }
}
</style>
