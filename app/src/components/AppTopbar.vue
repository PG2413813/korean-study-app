<script setup>
/**
 * 顶栏 —— 恢复旧版的招呼语结构：
 *   左：韩语问候（渐变字）+ 一行小标语
 *   右：日期胶囊
 * 旧版没有把页面标题放在这里，页面标题在内容区里，这里保持一致。
 */
import { computed } from 'vue'
import { greeting, weekdayCN, today } from '../core/ui'
import { stats } from '../core/appState'

const kr = computed(() => greeting())
const subline = computed(() => `今日待复习 ${stats.value.dueReview} 个单词，开始吧~`)
const dateText = computed(() => `${today()} · ${weekdayCN()}`)
</script>

<template>
  <header class="topbar">
    <div>
      <div class="greet"><span class="kr">{{ kr }}</span>，今天也要加油学习 ✦</div>
      <div class="gsub">{{ subline }}</div>
    </div>
    <div class="date">{{ dateText }}</div>
  </header>
</template>
