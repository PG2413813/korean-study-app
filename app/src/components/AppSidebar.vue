<script setup>
import { NAV, currentView, navigate } from '../core/ui'
import { stats } from '../core/appState'
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <span class="brand-mark"></span>
      <span class="brand-text"><b>韩语学习记录</b></span>
    </div>

    <nav class="nav">
      <button
        v-for="item in NAV"
        :key="item.id"
        class="nav-item"
        :class="{ on: currentView === item.id }"
        :title="item.label"
        @click="navigate(item.id)"
      >
        <span class="em">{{ item.em }}</span>
        <span class="label">{{ item.label }}</span>
        <span v-if="item.id === 'errors' && stats.errorCount" class="nav-badge">{{ stats.errorCount }}</span>
      </button>
    </nav>

    <div class="sidebar-foot">매일 조금씩<br>꾸준히 해요 ♡ 每天一点点</div>
  </aside>
</template>
