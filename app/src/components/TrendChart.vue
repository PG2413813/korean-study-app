<script setup>
/**
 * 柱状趋势图（改造版）。
 * 旧版是手写 SVG，没有 Y 轴刻度、没有网格、没有悬停提示，月份标签还会挤在一起。
 * 这里补上坐标轴 + 网格线 + 悬停 tooltip，并对密集标签做抽稀。
 */
import { computed, ref } from 'vue'

const props = defineProps({
  data: { type: Array, required: true },
  series: { type: Array, required: true },   // [{ key, label, color }]
  unit: { type: String, default: '' },
  height: { type: Number, default: 210 }
})

const W = 720
const PAD_L = 44
const PAD_R = 14
const PAD_T = 16
const PAD_B = 30

const hover = ref(-1)

const maxValue = computed(() => {
  let m = 0
  props.data.forEach((d) => props.series.forEach((s) => { if (d[s.key] > m) m = d[s.key] }))
  return niceMax(m)
})

function niceMax(v) {
  if (v <= 0) return 4
  const exp = Math.floor(Math.log10(v))
  const base = Math.pow(10, exp)
  const n = v / base
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * base
}

const innerW = W - PAD_L - PAD_R
const innerH = computed(() => props.height - PAD_T - PAD_B)

const slot = computed(() => innerW / Math.max(1, props.data.length))
const groupW = computed(() => Math.min(46, slot.value * 0.62))
const barW = computed(() => Math.max(3, groupW.value / props.series.length - 2))

const ticks = computed(() => {
  const m = maxValue.value
  return [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: Math.round(m * f), y: PAD_T + innerH.value * (1 - f) }))
})

function barX(i, j) {
  const cx = PAD_L + slot.value * i + slot.value / 2
  return cx - groupW.value / 2 + j * (groupW.value / props.series.length)
}

function barH(v) {
  return (v / maxValue.value) * innerH.value
}

const labelStep = computed(() => (props.data.length > 14 ? Math.ceil(props.data.length / 10) : 1))

const hoveredRow = computed(() => (hover.value >= 0 ? props.data[hover.value] : null))
const tipLeft = computed(() => {
  if (hover.value < 0) return '0%'
  const cx = PAD_L + slot.value * hover.value + slot.value / 2
  return (cx / W) * 100 + '%'
})
</script>

<template>
  <div class="chart-wrap" @mouseleave="hover = -1">
    <svg :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" class="chart-svg">
      <!-- 网格与 Y 轴 -->
      <g>
        <line
          v-for="t in ticks" :key="'g' + t.v"
          :x1="PAD_L" :x2="W - PAD_R" :y1="t.y" :y2="t.y"
          stroke="var(--line-2)" stroke-width="1"
        />
        <text
          v-for="t in ticks" :key="'t' + t.v"
          :x="PAD_L - 8" :y="t.y" text-anchor="end" dominant-baseline="central"
          class="axis-text"
        >{{ t.v }}</text>
      </g>

      <!-- 柱子 -->
      <g v-for="(d, i) in data" :key="'d' + i">
        <rect
          :x="PAD_L + slot * i" :y="PAD_T" :width="slot" :height="innerH"
          fill="transparent" @mouseenter="hover = i"
        />
        <rect
          v-for="(s, j) in series" :key="s.key"
          :x="barX(i, j)" :y="PAD_T + innerH - barH(d[s.key] || 0)"
          :width="barW" :height="Math.max(0, barH(d[s.key] || 0))"
          :fill="s.color" rx="2"
          :opacity="hover === -1 || hover === i ? 1 : 0.45"
          style="transition: opacity .15s"
        />
        <text
          v-if="i % labelStep === 0"
          :x="PAD_L + slot * i + slot / 2" :y="height - PAD_B + 16"
          text-anchor="middle" class="axis-text"
        >{{ d.label }}</text>
      </g>
    </svg>

    <div v-if="hoveredRow" class="chart-tip" :style="{ left: tipLeft }">
      <b>{{ hoveredRow.label }}</b>
      <span v-for="s in series" :key="s.key">
        <i :style="{ background: s.color }"></i>{{ s.label }} {{ hoveredRow[s.key] }}{{ unit }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.chart-wrap { position: relative; }
.chart-svg { width: 100%; height: auto; display: block; overflow: visible; }
.axis-text { font-size: 11px; fill: var(--faint); }

.chart-tip {
  position: absolute; top: 0; transform: translateX(-50%);
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-sm); box-shadow: var(--sh-2);
  padding: var(--sp-2) var(--sp-3); font-size: var(--fs-sm);
  display: flex; flex-direction: column; gap: 3px;
  pointer-events: none; white-space: nowrap; z-index: 5;
}
.chart-tip b { font-weight: var(--fw-bold); }
.chart-tip span { display: inline-flex; align-items: center; gap: 5px; color: var(--sub); }
.chart-tip i { width: 8px; height: 8px; border-radius: 2px; display: block; }
</style>
