import { createApp } from 'vue'
import './styles/tokens.css'
import './styles/base.css'
import App from './App.vue'
import { initState } from './core/appState'

/**
 * 数据现在存在 IndexedDB 里，必须先读完再挂载，
 * 否则会出现「先闪一下空状态再跳出数据」。
 * 万一初始化失败也要照常挂载 —— 至少还能看到界面，而不是白屏。
 */
initState()
  .catch((err) => {
    console.error('[init] 初始化失败，使用空数据启动：', err)
  })
  .finally(() => {
    createApp(App).mount('#app')
  })
