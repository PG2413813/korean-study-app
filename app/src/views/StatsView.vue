<script setup>
/** 时间管理 · 每日统计（按需求已移除热力图） */
import { ref, computed } from 'vue'
import { state, summary } from '../core/appState'
import { fmtDuration, today } from '../core/ui'
import { timerRunning, timerSeconds, toggleTimer } from '../core/studyTimer'
import { computeDayStats, computeTrend, historyDays } from '../core/core'
import TrendChart from '../components/TrendChart.vue'

const trendMode = ref('day')
const trendMetric = ref('count')

const dayStats = computed(() => computeDayStats(state.studyLog, today()))
const trendData = computed(() => computeTrend(state.studyLog, today(), trendMode.value))

const chartData = computed(() => trendData.value.map((x) => (
  trendMetric.value === 'time' ? { ...x, minutes: Math.round(x.seconds / 60) } : x
)))

const series = computed(() => (
  trendMetric.value === 'time'
    ? [{ key: 'minutes', label: '时长', color: 'var(--accent)' }]
    : [
        { key: 'added', label: '新学', color: 'var(--accent)' },
        { key: 'reviewed', label: '复习', color: 'var(--accent2)' }
      ]
))

const hasTrendData = computed(() => trendData.value.some((x) => x.added > 0 || x.reviewed > 0 || x.seconds > 0))
const history = computed(() => historyDays(state.studyLog))

const MODES = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' }
]
</script>

<template>
  <div class="page">
    <h1 class="page-title">📊 时间管理 · 每日统计</h1>

    <div class="cards">
      <div class="card">
        <div class="num">{{ dayStats.added }}</div>
        <div class="lbl">今日新学</div>
      </div>
      <div class="card">
        <div class="num">{{ dayStats.reviewed }}</div>
        <div class="lbl">今日复习</div>
      </div>
      <div class="card">
        <div class="num">{{ dayStats.correctRate === null ? '--' : dayStats.correctRate + '%' }}</div>
        <div class="lbl">单词掌握率</div>
      </div>
      <div class="card">
        <div class="num" style="font-size:30px">{{ fmtDuration(dayStats.seconds) }}</div>
        <div class="lbl">有效学习时长</div>
      </div>
    </div>

    <div class="panel center">
      <div class="stat-line">今日有效学习：<b>{{ fmtDuration(timerSeconds) }}</b></div>
      <button class="btn" :class="{ primary: !timerRunning }" style="margin-top:10px" @click="toggleTimer">
        {{ timerRunning ? '⏸ 暂停计时' : '▶ 开始计时' }}
      </button>
      <div class="tip">计时仅在页面前台且有操作时累计，后台挂机、闲置 5 分钟自动暂停</div>
    </div>

    <div class="panel">
      <div class="toolbar" style="justify-content:center">
        <button
          v-for="m in MODES" :key="m.id"
          class="pill" :class="{ on: trendMode === m.id }"
          @click="trendMode = m.id"
        >{{ m.label }}</button>
        <span style="width:10px"></span>
        <button class="pill" :class="{ on: trendMetric === 'count' }" @click="trendMetric = 'count'">次数</button>
        <button class="pill" :class="{ on: trendMetric === 'time' }" @click="trendMetric = 'time'">时长</button>
      </div>

      <template v-if="hasTrendData">
        <div class="chart-title">
          {{ trendMetric === 'time' ? '学习时长（分钟）' : '新学（深） vs 复习（浅）' }}
        </div>
        <TrendChart :data="chartData" :series="series" :unit="trendMetric === 'time' ? ' 分钟' : ''" />
      </template>
      <div v-else class="tip" style="text-align:center;padding:12px 0">还没有学习数据，去录入或复习吧 ✦</div>
    </div>

    <div class="chart-title">成长档案 · 累计</div>
    <div class="cards">
      <div class="card"><div class="num">{{ summary.days }}</div><div class="lbl">学习天数</div></div>
      <div class="card"><div class="num">{{ summary.added }}</div><div class="lbl">累计新学</div></div>
      <div class="card"><div class="num">{{ summary.reviewed }}</div><div class="lbl">累计复习</div></div>
      <div class="card"><div class="num" style="font-size:30px">{{ fmtDuration(summary.seconds) }}</div><div class="lbl">累计时长</div></div>
    </div>

    <div class="chart-title">历史记录</div>
    <div class="list">
      <template v-if="history.length">
        <div v-for="d in history" :key="d.date" class="row">
          <span class="ko" style="min-width:110px">{{ d.date }}</span>
          <span class="zh">
            新学 {{ d.added }} · 复习 {{ d.reviewed }} · 正确 {{ d.correct }}
            · 掌握 {{ d.rate === null ? '--' : d.rate + '%' }} · {{ fmtDuration(d.seconds) }}
          </span>
        </div>
      </template>
      <div v-else class="empty">还没有历史记录，坚持每天学习吧 ✦</div>
    </div>
  </div>
</template>

<style scoped>
.card .num { font-variant-numeric: tabular-nums; }
</style>
