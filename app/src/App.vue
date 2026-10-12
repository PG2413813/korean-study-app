<script setup>
import { computed, onMounted, watchEffect } from 'vue'
import { theme } from './core/appState'
import { currentView, moreOpen, navigate, NAV } from './core/ui'
import { backgroundUrl } from './core/media'
import { ensureDailySnapshot, startAutoSnapshot } from './core/snapshots'

import AppSidebar from './components/AppSidebar.vue'
import AppTopbar from './components/AppTopbar.vue'
import BottomTabBar from './components/BottomTabBar.vue'
import ToastHost from './components/ToastHost.vue'
import ModalHost from './components/ModalHost.vue'

import HomeView from './views/HomeView.vue'
import WordsView from './views/WordsView.vue'
import AddView from './views/AddView.vue'
import ReviewView from './views/ReviewView.vue'
import ErrorsView from './views/ErrorsView.vue'
import StatsView from './views/StatsView.vue'
import SettingsView from './views/SettingsView.vue'

const VIEWS = {
  home: HomeView, words: WordsView, add: AddView, review: ReviewView,
  errors: ErrorsView, stats: StatsView, settings: SettingsView
}
const viewComponent = computed(() => VIEWS[currentView.value] || HomeView)

const footerNav = NAV.filter((n) => !n.tab)

/* 主题变量必须挂在 <html> 上，而不是组件内部的某个 div。
   原因：弹窗、移动端「更多」面板都是 Teleport 到 <body> 的，
   如果主题变量只定义在 .app 上，这些节点取不到 --grad / --surface，
   就会出现「主按钮背景变透明 → 白字压白底 → 保存按钮看不见」的问题。 */
watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
})

// 背景图：用户在「数据与设置」里手动指定或上传时用它，否则按天轮换
const bgStyle = computed(() => {
  const url = backgroundUrl.value
  return url ? { backgroundImage: `url("${url}")` } : {}
})

onMounted(() => {
  moreOpen.value = false
  ensureDailySnapshot()
  startAutoSnapshot()
})

function goFromSheet(id) {
  navigate(id)
  moreOpen.value = false
}
</script>

<template>
  <!-- 背景层与 .app 平级，和旧版 DOM 结构一致：
       旧版是 <div class="bg"> + <div class="app">，.app 用 z-index:1 压在背景之上。
       这层关系会影响到 backdrop-filter（玻璃）实际取到的背景内容，
       所以不能图省事把 .bg 塞进 .app 里面。 -->
  <div class="bg" :style="bgStyle"></div>

  <div class="app">
    <div class="shell">
      <AppSidebar />

      <div class="main">
        <AppTopbar />

        <main class="content">
          <Transition name="fade" mode="out-in">
            <component :is="viewComponent" :key="currentView" />
          </Transition>
        </main>
      </div>
    </div>

    <BottomTabBar />

    <Teleport to="body">
      <Transition name="fade">
        <div v-if="moreOpen" class="modal-mask sheet-mask" @click.self="moreOpen = false">
          <div class="sheet">
            <div class="sheet-grip"></div>
            <button v-for="n in footerNav" :key="n.id" class="sheet-item" @click="goFromSheet(n.id)">
              {{ n.label }}
            </button>
            <button class="sheet-item cancel" @click="moreOpen = false">取消</button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ToastHost />
    <ModalHost />
  </div>
</template>

<style>
.sheet-mask { align-items: flex-end; padding: 0; }

.sheet {
  width: 100%;
  background: var(--surface);
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  padding: var(--sp-3) var(--sp-3) calc(var(--sp-5) + env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; gap: 2px;
  animation: popIn var(--dur-2) var(--ease);
}
.sheet-grip {
  width: 36px; height: 4px; border-radius: var(--r-full);
  background: var(--line); margin: 0 auto var(--sp-3);
}
.sheet-item {
  padding: 14px; border-radius: var(--r-sm);
  font-size: var(--fs-md); text-align: center; color: var(--ink);
  width: 100%;
}
.sheet-item:hover { background: var(--surface-2); }
.sheet-item.cancel {
  color: var(--sub); margin-top: var(--sp-2);
  border-top: 1px solid var(--line-2); border-radius: 0;
}
</style>
