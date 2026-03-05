<template>
  <div class="pixel-beads-app">
    <aside class="sidebar">
      <div class="logo">拼豆工坊 Pro</div>

      <div class="config-section">
        <label class="upload-label">
          📁 上传参考图
          <input type="file" @change="onImageChange" accept="image/*" hidden />
        </label>

        <div v-if="imgSource" class="controls-card">
          <div class="param-header">
            <span>画面密度 (清晰度)</span>
            <span class="clarity-tag">{{ clarityText }}</span>
          </div>
          <input
            type="range"
            v-model.number="gridSize"
            min="10"
            max="150"
            class="density-slider"
            @input="debouncedProcess"
          />
          <div class="param-info">横向 {{ gridSize }} 颗豆子</div>
        </div>

        <div class="param-row" v-if="imgSource">
          <span>画布缩放预览: {{ zoomLevel }}%</span>
          <input type="range" v-model.number="zoomLevel" min="30" max="200" step="10" />
        </div>
      </div>

      <div class="stats-container">
        <div class="stats-header">物料清单 (共 {{ totalBeads }} 颗)</div>
        <div class="stats-scroll">
          <div v-for="item in sortedStats" :key="item.id" class="bead-card">
            <div class="swatch" :style="{ backgroundColor: item.hex }"></div>
            <div class="details">
              <span class="name">{{ item.name }}</span>
              <span class="id">#{{ item.id }}</span>
            </div>
            <div class="count">{{ item.count }}</div>
          </div>
        </div>
      </div>
    </aside>

    <main class="preview-area">
      <div v-if="!imgSource" class="empty-state">
        <div class="icon">🖼️</div>
        <p>上传图片开始创作</p>
      </div>
      <div v-else class="canvas-viewport">
        <div class="canvas-container" :style="containerStyle">
          <canvas ref="pixelCanvas" class="pixel-canvas"></canvas>
          <canvas ref="gridCanvas" class="grid-canvas" @mousemove="updateHover"></canvas>

          <div v-if="hoverInfo" class="hover-tag" :style="hoverTagStyle">
            {{ hoverInfo.name }} [{{ hoverInfo.id }}]
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { BEAD_PALETTE } from './beadColors.js'

const imgSource = ref(null)
const gridSize = ref(50) // 这就是控制密度的核心变量
const zoomLevel = ref(100)
const pixelCanvas = ref(null)
const gridCanvas = ref(null)
const hoverInfo = ref(null)
const beadStats = ref({})

const clarityText = computed(() => {
  if (gridSize.value < 40) return '简约'
  if (gridSize.value < 80) return '标准'
  if (gridSize.value < 120) return '精细'
  return '极致'
})

const totalBeads = computed(() => Object.values(beadStats.value).reduce((s, a) => s + a.count, 0))

const CELL_BASE = 15
const containerStyle = computed(() => {
  if (!imgSource.value) return {}
  const w = gridSize.value
  const h = Math.round((imgSource.value.height / imgSource.value.width) * w)
  const scale = zoomLevel.value / 100
  return {
    width: `${w * CELL_BASE * scale}px`,
    height: `${h * CELL_BASE * scale}px`,
  }
})

const sortedStats = computed(() => Object.values(beadStats.value).sort((a, b) => b.count - a.count))

const onImageChange = (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      imgSource.value = img
      processImage()
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

const processImage = async () => {
  if (!imgSource.value) return
  await nextTick()

  // 根据 gridSize 计算高度，gridSize 越高，单位面积像素越多，即密度越高
  const w = gridSize.value
  const h = Math.round((imgSource.value.height / imgSource.value.width) * w)

  const pCtx = pixelCanvas.value.getContext('2d', { willReadFrequently: true })
  pixelCanvas.value.width = w
  pixelCanvas.value.height = h

  // 关键：处理密度时关闭平滑，获得清晰的像素块
  pCtx.imageSmoothingEnabled = false
  pCtx.drawImage(imgSource.value, 0, 0, w, h)

  const imgData = pCtx.getImageData(0, 0, w, h)
  const data = imgData.data
  const stats = {}

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const matched = findBestColor(data[i], data[i + 1], data[i + 2])
    data[i] = matched.r
    data[i + 1] = matched.g
    data[i + 2] = matched.b
    if (!stats[matched.id]) stats[matched.id] = { ...matched, count: 0 }
    stats[matched.id].count++
  }
  pCtx.putImageData(imgData, 0, 0)
  beadStats.value = stats

  drawGrid(w, h)
}

const drawGrid = (w, h) => {
  const gCtx = gridCanvas.value.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  gridCanvas.value.width = w * CELL_BASE * dpr
  gridCanvas.value.height = h * CELL_BASE * dpr
  gCtx.scale(dpr, dpr)

  gCtx.clearRect(0, 0, w * CELL_BASE, h * CELL_BASE)
  for (let x = 0; x <= w; x++) {
    gCtx.beginPath()
    gCtx.lineWidth = x % 10 === 0 ? 1.2 : 0.3
    gCtx.strokeStyle = x % 10 === 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'
    gCtx.moveTo(x * CELL_BASE, 0)
    gCtx.lineTo(x * CELL_BASE, h * CELL_BASE)
    gCtx.stroke()
  }
  for (let y = 0; y <= h; y++) {
    gCtx.beginPath()
    gCtx.lineWidth = y % 10 === 0 ? 1.2 : 0.3
    gCtx.strokeStyle = y % 10 === 0 ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.15)'
    gCtx.moveTo(0, y * CELL_BASE)
    gCtx.lineTo(w * CELL_BASE, y * CELL_BASE)
    gCtx.stroke()
  }
}

const findBestColor = (r, g, b) => {
  let min = Infinity
  let best = BEAD_PALETTE[0]
  BEAD_PALETTE.forEach((c) => {
    const d = Math.sqrt(
      Math.pow(r - c.r, 2) * 0.3 + Math.pow(g - c.g, 2) * 0.59 + Math.pow(b - c.b, 2) * 0.11,
    )
    if (d < min) {
      min = d
      best = c
    }
  })
  return best
}

const updateHover = (e) => {
  const rect = gridCanvas.value.getBoundingClientRect()
  const scale = zoomLevel.value / 100
  const x = Math.floor((e.clientX - rect.left) / (CELL_BASE * scale))
  const y = Math.floor((e.clientY - rect.top) / (CELL_BASE * scale))

  if (x >= pixelCanvas.value.width || y >= pixelCanvas.value.height) return
  const p = pixelCanvas.value.getContext('2d').getImageData(x, y, 1, 1).data
  if (p[3] === 0) {
    hoverInfo.value = null
    return
  }

  const color = BEAD_PALETTE.find((c) => c.r === p[0] && c.g === p[1] && c.b === p[2])
  if (color) hoverInfo.value = { ...color, x: e.clientX + 15, y: e.clientY + 15 }
}

const hoverTagStyle = computed(() => ({
  position: 'fixed',
  left: `${hoverInfo.value?.x}px`,
  top: `${hoverInfo.value?.y}px`,
  background: 'rgba(0,0,0,0.8)',
  color: '#fff',
  padding: '5px 10px',
  borderRadius: '4px',
  pointerEvents: 'none',
  zIndex: 1000,
  fontSize: '12px',
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
}))

let timer
const debouncedProcess = () => {
  clearTimeout(timer)
  timer = setTimeout(processImage, 100)
}
</script>

<style scoped>
/* 样式部分做了美化，更具工具感 */
.pixel-beads-app {
  display: flex;
  height: 100vh;
  background: #1e1e1e;
  color: #d4d4d4;
  overflow: hidden;
  font-family: sans-serif;
}

.sidebar {
  width: 320px;
  background: #252526;
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-right: 1px solid #333;
}
.logo {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 24px;
  color: #4fc1ff;
  letter-spacing: 1px;
}

.controls-card {
  background: #333337;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 20px;
}
.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
}
.clarity-tag {
  background: #4fc1ff;
  color: #000;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 11px;
}
.density-slider {
  width: 100%;
  cursor: pointer;
  accent-color: #4fc1ff;
}
.param-info {
  font-size: 11px;
  color: #888;
  margin-top: 5px;
}

.upload-label {
  display: block;
  background: #007acc;
  color: white;
  text-align: center;
  padding: 10px;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 20px;
  font-size: 14px;
}

.stats-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #2d2d2d;
  border-radius: 8px;
  padding: 10px;
}
.stats-header {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 10px;
  text-transform: uppercase;
}
.stats-scroll {
  flex: 1;
  overflow-y: auto;
}
.bead-card {
  display: flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 4px;
  margin-bottom: 4px;
  background: #37373d;
  transition: 0.2s;
}
.bead-card:hover {
  background: #45454d;
}
.swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  margin-right: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.details {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.name {
  font-size: 12px;
  color: #eee;
}
.id {
  font-size: 10px;
  color: #888;
}
.count {
  font-weight: bold;
  color: #4fc1ff;
  font-family: monospace;
  font-size: 14px;
}

.preview-area {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #000;
  position: relative;
}
.empty-state {
  text-align: center;
  color: #555;
}
.empty-state .icon {
  font-size: 64px;
  margin-bottom: 10px;
}

.canvas-viewport {
  width: 100%;
  height: 100%;
  overflow: auto;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 60px;
}
.canvas-container {
  position: relative;
  box-shadow: 0 0 50px rgba(0, 0, 0, 0.5);
}

.pixel-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
}
.grid-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 10;
  cursor: crosshair;
}
</style>
