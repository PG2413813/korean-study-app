<script setup>
import { onMounted, onUnmounted } from 'vue'
import { toasts, dismissToast } from '../core/ui'

onMounted(() => {
  // 就绪
})
onUnmounted(() => {})
</script>

<template>
  <div class="toast-host">
    <TransitionGroup name="fade">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.type"
        @click="dismissToast(t.id)"
      >
        <span class="dot-mark"></span>
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>
