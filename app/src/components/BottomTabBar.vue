<script setup>
import { TAB_NAV, currentView, navigate, moreOpen } from '../core/ui'
import { stats } from '../core/appState'
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="item in TAB_NAV"
      :key="item.id"
      class="tab-item"
      :class="{ on: currentView === item.id }"
      @click="navigate(item.id)"
    >
      <span class="em">{{ item.em }}</span>
      <span>{{ item.short }}</span>
      <span v-if="item.id === 'errors' && stats.errorCount" class="tab-badge">{{ stats.errorCount }}</span>
    </button>
    <button class="tab-item" :class="{ on: moreOpen }" @click="moreOpen = !moreOpen">
      <span class="em">⋯</span>
      <span>更多</span>
    </button>
  </nav>
</template>
