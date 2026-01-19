<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
import Konva from 'konva'
import { puzzleImages } from './images.js'

// --- 1. 基础状态与持久化 ---
const STORAGE_KEY = 'puzzle_current_level'
const currentLevel = ref(
  localStorage.getItem(STORAGE_KEY) ? parseInt(localStorage.getItem(STORAGE_KEY)) : 1,
)
const STAGE_SIZE = reactive({ width: window.innerWidth, height: window.innerHeight })

const isLoaded = ref(false)
const displayImage = ref(null)
const pieces = ref([])
const gameState = ref('waiting') // waiting, playing, finished
const timer = ref(0)
const showPreview = ref(false)
const scrollOffset = ref(0)
let timerInterval = null

// --- 2. 配置常量 ---
const PREVIEW_SIZE = 100
const INVENTORY_RATIO = 0.25
const boardRect = reactive({ width: 0, height: 0 })

// --- 3. 计算属性 ---
const safeGridSize = computed(() => currentLevel.value + 1)

const layout = computed(() => {
  const invWidth = STAGE_SIZE.width * INVENTORY_RATIO
  const playWidth = STAGE_SIZE.width - invWidth
  return {
    invWidth,
    playWidth,
    boardX: (playWidth - boardRect.width) / 2,
    boardY: (STAGE_SIZE.height - boardRect.height) / 2,
  }
})

const pieceMetrics = computed(() => ({
  width: boardRect.width / safeGridSize.value,
  height: boardRect.height / safeGridSize.value,
}))

const previewScale = computed(() => {
  const { width, height } = pieceMetrics.value
  return width > 0 ? PREVIEW_SIZE / Math.max(width, height) : 1
})

// --- 4. 绘图与工具函数 ---
const drawJigsawShape = (ctx, w, h, edges) => {
  const t = Math.min(w, h) * 0.2
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(w / 2 - t, 0)
  if (edges.top !== 0)
    ctx.bezierCurveTo(w / 2 - t, -t * edges.top, w / 2 + t, -t * edges.top, w / 2 + t, 0)
  ctx.lineTo(w, 0)
  ctx.lineTo(w, h / 2 - t)
  if (edges.right !== 0)
    ctx.bezierCurveTo(w + t * edges.right, h / 2 - t, w + t * edges.right, h / 2 + t, w, h / 2 + t)
  ctx.lineTo(w, h)
  ctx.lineTo(w / 2 + t, h)
  if (edges.bottom !== 0)
    ctx.bezierCurveTo(
      w / 2 + t,
      h + t * edges.bottom,
      w / 2 - t,
      h + t * edges.bottom,
      w / 2 - t,
      h,
    )
  ctx.lineTo(0, h)
  ctx.lineTo(0, h / 2 + t)
  if (edges.left !== 0)
    ctx.bezierCurveTo(-t * edges.left, h / 2 + t, -t * edges.left, h / 2 - t, 0, h / 2 - t)
  ctx.closePath()
}

const clearTimer = () => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
}

const startChallenge = () => {
  gameState.value = 'playing'
  timer.value = 0
  clearTimer()
  timerInterval = setInterval(() => {
    timer.value++
  }, 1000)
}

const playVictoryAnim = () => {
  const stage = Konva.stages[0]
  const layer = stage.getLayers()[0]
  if (!layer) return
  layer.to({
    scaleX: 1.02,
    scaleY: 1.02,
    duration: 0.3,
    onFinish: () => layer.to({ scaleX: 1, scaleY: 1, duration: 0.3 }),
  })
}

// --- 5. 初始化与核心交互 ---
const initGame = async () => {
  isLoaded.value = false
  clearTimer()
  const imgUrl = puzzleImages[(currentLevel.value - 1) % puzzleImages.length]
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'Anonymous'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = imgUrl
    })

    const maxW = STAGE_SIZE.width * 0.7 - 60
    const maxH = STAGE_SIZE.height - 120
    const imgRatio = img.naturalWidth / img.naturalHeight
    if (imgRatio > maxW / maxH) {
      boardRect.width = maxW
      boardRect.height = maxW / imgRatio
    } else {
      boardRect.height = maxH
      boardRect.width = maxH * imgRatio
    }

    const grid = safeGridSize.value
    const tempPieces = []
    for (let r = 0; r < grid; r++) {
      for (let c = 0; c < grid; c++) {
        tempPieces.push({
          id: `L${currentLevel.value}-${r}-${c}`,
          row: r,
          col: c,
          isLocked: false,
          edges: {
            top: r === 0 ? 0 : -tempPieces[(r - 1) * grid + c].edges.bottom,
            bottom: r === grid - 1 ? 0 : Math.random() > 0.5 ? 1 : -1,
            left: c === 0 ? 0 : -tempPieces[tempPieces.length - 1].edges.right,
            right: c === grid - 1 ? 0 : Math.random() > 0.5 ? 1 : -1,
          },
        })
      }
    }

    const shuffled = tempPieces.sort(() => Math.random() - 0.5)
    shuffled.forEach((p, i) => {
      p.homeX =
        layout.value.playWidth +
        (i % 2) * (layout.value.invWidth / 2) +
        (layout.value.invWidth / 4 - (pieceMetrics.value.width * previewScale.value) / 2)
      p.homeY = Math.floor(i / 2) * (PREVIEW_SIZE + 25) + 80
      p.currentX = p.homeX
      p.currentY = p.homeY
    })

    displayImage.value = img
    pieces.value = shuffled
    await nextTick()
    isLoaded.value = true
  } catch (err) {
    console.error(err)
  }
}

const handleDragStart = (e, piece) => {
  if (!piece.isLocked) {
    e.target.y(e.target.y() + scrollOffset.value)
    e.target.moveToTop()
  }
}

const handleDragEnd = (e, piece) => {
  const node = e.target
  const { width, height } = pieceMetrics.value

  // 目标位置（棋盘上的绝对坐标）
  const targetX = layout.value.boardX + piece.col * width
  const targetY = layout.value.boardY + piece.row * height

  // 计算当前碎片中心点相对于目标中心点的偏移
  const distX = Math.abs(node.x() - targetX)
  const distY = Math.abs(node.y() - targetY)

  // --- 优化判定条件 ---
  // 1. 如果碎片中心进入了目标格子 75% 的范围内（即 distX < width * 0.75）
  // 2. 或者在第一关这种大碎片情况下，增加一个基础宽容像素值（例如 50px）
  const toleranceX = Math.max(width * 0.7, 50)
  const toleranceY = Math.max(height * 0.7, 50)

  if (distX < toleranceX && distY < toleranceY) {
    // 判定成功
    piece.isLocked = true
    piece.currentX = targetX
    piece.currentY = targetY

    node.to({
      x: targetX,
      y: targetY,
      scaleX: 1,
      scaleY: 1,
      duration: 0.2,
      easing: Konva.Easings.EaseOut,
    })
    node.draggable(false)

    if (pieces.value.every((p) => p.isLocked)) {
      clearTimer()
      playVictoryAnim()
      setTimeout(() => {
        gameState.value = 'finished'
      }, 1500)
    }
  } else {
    // 判定失败，弹回待选区
    node.to({
      x: piece.homeX,
      y: piece.homeY + scrollOffset.value,
      scaleX: previewScale.value,
      scaleY: previewScale.value,
      duration: 0.4,
      easing: Konva.Easings.BackEaseOut,
    })
  }
}

const handleWheel = (e) => {
  const pointer = e.target.getStage().getPointerPosition()
  if (!pointer || pointer.x < layout.value.playWidth) return
  const totalRows = Math.ceil(pieces.value.length / 2)
  const contentHeight = totalRows * (PREVIEW_SIZE + 25) + 100
  const maxScroll = Math.max(0, contentHeight - STAGE_SIZE.height)
  scrollOffset.value = Math.max(-maxScroll, Math.min(0, scrollOffset.value - e.evt.deltaY))
}

const nextLevel = () => {
  currentLevel.value++
  localStorage.setItem(STORAGE_KEY, currentLevel.value)
  gameState.value = 'waiting'
  showPreview.value = false
  scrollOffset.value = 0
  initGame()
}

onMounted(() => {
  window.addEventListener('resize', () => {
    STAGE_SIZE.width = window.innerWidth
    STAGE_SIZE.height = window.innerHeight
  })
  initGame()
})
onUnmounted(clearTimer)
</script>

<template>
  <div class="game-container" :class="{ 'is-finished': gameState === 'finished' }">
    <div class="top-bar">Level {{ currentLevel }} | ⏱ {{ timer }}s</div>

    <div v-if="gameState !== 'playing'" class="overlay">
      <div v-if="showPreview" class="preview-modal" @click="showPreview = false">
        <img :src="displayImage.src" class="full-img" />
        <p class="tip">点击任意位置返回</p>
      </div>

      <div v-else class="card" :class="{ 'victory-card': gameState === 'finished' }">
        <div v-if="gameState === 'finished'" class="medal">🏆</div>
        <h2>{{ gameState === 'waiting' ? `Level ${currentLevel}` : '解锁成功！' }}</h2>
        <p v-if="gameState === 'finished'" class="stats">本次用时: {{ timer }}秒</p>

        <div class="button-group">
          <button v-if="gameState === 'finished'" class="btn outline" @click="showPreview = true">
            查看原图
          </button>
          <button
            class="btn primary"
            @click="gameState === 'waiting' ? startChallenge() : nextLevel()"
          >
            {{ gameState === 'waiting' ? '开始挑战' : '下一关挑战' }}
          </button>
        </div>
      </div>
    </div>

    <v-stage v-if="isLoaded" :config="STAGE_SIZE" @wheel="handleWheel">
      <v-layer>
        <v-rect
          :config="{
            x: 0,
            y: 0,
            width: layout.playWidth,
            height: STAGE_SIZE.height,
            fill: '#f8f9fa',
          }"
        />
        <v-rect
          :config="{
            x: layout.playWidth,
            y: 0,
            width: layout.invWidth,
            height: STAGE_SIZE.height,
            fill: '#eceef1',
          }"
        />

        <v-group :config="{ x: layout.boardX, y: layout.boardY }">
          <v-rect
            v-for="p in pieces"
            :key="'slot-' + p.id"
            :config="{
              x: p.col * pieceMetrics.width,
              y: p.row * pieceMetrics.height,
              width: pieceMetrics.width,
              height: pieceMetrics.height,
              stroke: '#d1d5db',
              strokeWidth: 1,
              dash: [5, 5],
            }"
          />
        </v-group>

        <v-group
          v-for="p in pieces"
          :key="p.id"
          :config="{
            x: p.isLocked ? p.currentX : p.homeX,
            y: p.isLocked ? p.currentY : p.homeY + scrollOffset,
            scaleX: p.isLocked ? 1 : previewScale,
            scaleY: p.isLocked ? 1 : previewScale,
            draggable: !p.isLocked && gameState === 'playing',
            clipFunc: (ctx) =>
              drawJigsawShape(ctx, pieceMetrics.width, pieceMetrics.height, p.edges),
          }"
          @dragstart="handleDragStart($event, p)"
          @dragend="handleDragEnd($event, p)"
        >
          <v-image
            :config="{
              image: displayImage,
              x: -(p.col * pieceMetrics.width),
              y: -(p.row * pieceMetrics.height),
              width: boardRect.width,
              height: boardRect.height,
            }"
          />
          <v-shape
            :config="{
              sceneFunc: (ctx, shape) => {
                drawJigsawShape(ctx, pieceMetrics.width, pieceMetrics.height, p.edges)
                ctx.fillStrokeShape(shape)
              },
              stroke: p.isLocked ? '#2ecc71' : '#94a3b8',
              strokeWidth: p.isLocked ? 3 : 2,
              shadowBlur: p.isLocked ? 10 : 0,
              shadowColor: '#2ecc71',
            }"
          />
        </v-group>
      </v-layer>
    </v-stage>
  </div>
</template>

<style scoped>
.game-container {
  width: 100vw;
  height: 100vh;
  background: #eee;
  position: relative;
  overflow: hidden;
  transition: background 0.8s;
}
.game-container.is-finished {
  background: #fef9e7;
}

.top-bar {
  position: absolute;
  top: 15px;
  left: 20px;
  z-index: 10;
  background: #1e293b;
  color: white;
  padding: 8px 22px;
  border-radius: 50px;
  font-weight: bold;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  backdrop-filter: blur(8px);
}
.card {
  background: white;
  padding: 45px;
  border-radius: 30px;
  text-align: center;
  min-width: 320px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}
.victory-card {
  border: 3px solid #f1c40f;
  animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.medal {
  font-size: 4rem;
  margin-bottom: 10px;
}
.stats {
  color: #2ecc71;
  font-weight: bold;
  font-size: 1.2rem;
  margin: 15px 0;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 25px;
}
.btn {
  border: none;
  padding: 15px 35px;
  border-radius: 16px;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.btn.primary {
  background: #2ecc71;
  color: white;
  box-shadow: 0 4px 14px 0 rgba(46, 204, 113, 0.39);
}
.btn.outline {
  background: #f8fafc;
  color: #64748b;
  border: 2px solid #e2e8f0;
}
.btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
}

.preview-modal {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.full-img {
  max-width: 85%;
  max-height: 80%;
  border-radius: 12px;
  border: 5px solid white;
  box-shadow: 0 0 40px rgba(0, 0, 0, 0.5);
}
.tip {
  color: white;
  margin-top: 15px;
  font-weight: 500;
  letter-spacing: 1px;
}

@keyframes popIn {
  0% {
    transform: scale(0.8);
    opacity: 0;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
