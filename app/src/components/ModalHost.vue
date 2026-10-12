<script setup>
/**
 * 全局弹窗宿主。
 * 相比旧版新增：ESC 键关闭、点击遮罩关闭（旧版只能点按钮）。
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { modal, closeModal, toast, confirmDialog } from '../core/ui'
import { findWord, updateWord } from '../core/appState'
import { normalizeText, splitMeanings } from '../core/core'

const editKo = ref('')
const editZh = ref('')
const editTags = ref('')
const inputValue = ref('')
const koInput = ref(null)
const genericInput = ref(null)

watch(
  () => modal.type,
  async (t) => {
    if (t === 'editWord') {
      const w = findWord(modal.props.wordId)
      if (w) {
        editKo.value = w.ko
        editZh.value = w.zh
        editTags.value = w.tags.join('、')
      }
      await nextTick()
      koInput.value?.focus()
    }
    if (t === 'input') {
      inputValue.value = modal.props.value || ''
      await nextTick()
      genericInput.value?.focus()
    }
  }
)

function onKey(e) {
  if (!modal.type) return
  if (e.key === 'Escape') closeModal()
  if (e.key === 'Enter' && modal.type === 'editWord') saveEdit()
  if (e.key === 'Enter' && modal.type === 'confirm') runConfirm()
  if (e.key === 'Enter' && modal.type === 'input') runInput()
}

function runInput() {
  const fn = modal.props.onConfirm
  const value = inputValue.value
  closeModal()
  if (typeof fn === 'function') fn(value)
}

onMounted(() => document.addEventListener('keydown', onKey))
onUnmounted(() => document.removeEventListener('keydown', onKey))

function runConfirm() {
  const fn = modal.props.onConfirm
  closeModal()
  if (typeof fn === 'function') fn()
}

function saveEdit() {
  const ko = normalizeText(editKo.value)
  const zh = normalizeText(editZh.value)
  if (!ko || !zh) {
    toast('韩语和中文都不能为空', 'warn')
    return
  }
  updateWord(modal.props.wordId, {
    ko,
    zh,
    tags: splitMeanings(editTags.value)
  })
  closeModal()
  toast('已保存修改', 'ok')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="modal.type" class="modal-mask" @click.self="closeModal">
        <div class="modal" role="dialog" aria-modal="true">
          <!-- 二次确认 -->
          <template v-if="modal.type === 'confirm'">
            <h3>{{ modal.props.title }}</h3>
            <p class="tip" style="font-size:13px">{{ modal.props.text }}</p>
            <div class="modal-ops">
              <button class="btn" @click="closeModal">取消</button>
              <button class="btn" :class="modal.props.danger ? 'danger' : 'primary'" @click="runConfirm">
                {{ modal.props.confirmText || '确定' }}
              </button>
            </div>
          </template>

          <!-- 编辑单词 -->
          <template v-else-if="modal.type === 'editWord'">
            <h3>编辑单词</h3>
            <div class="field" style="margin-bottom:12px">
              <label>韩语</label>
              <input ref="koInput" v-model="editKo" class="input ko" placeholder="韩语单词">
            </div>
            <div class="field" style="margin-bottom:12px">
              <label>中文释义（多个用「、」分隔）</label>
              <input v-model="editZh" class="input" placeholder="中文释义">
            </div>
            <div class="field">
              <label>标签（用「、」或「，」分隔）</label>
              <input v-model="editTags" class="input" placeholder="动词、名词">
            </div>
            <div class="modal-ops">
              <button class="btn" @click="closeModal">取消</button>
              <button class="btn primary" @click="saveEdit">保存</button>
            </div>
          </template>

          <!-- 通用单行输入（批量打标签等） -->
          <template v-else-if="modal.type === 'input'">
            <h3>{{ modal.props.title }}</h3>
            <div class="field">
              <label v-if="modal.props.label">{{ modal.props.label }}</label>
              <input ref="genericInput" v-model="inputValue" class="input" placeholder="用「、」分隔">
            </div>
            <div class="modal-ops">
              <button class="btn" @click="closeModal">取消</button>
              <button class="btn primary" @click="runInput">{{ modal.props.confirmText || '确定' }}</button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
