<template>
  <div
    class="game-wrapper"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mouseleave="handleMouseUp"
    @mousemove="handleMouseMove"
    @touchstart="handleTouchStart"
    @touchend="handleMouseUp"
    @touchmove="handleTouchMove"
  >
    <div v-if="gameState === 'playing'" class="stats-layer">
      <div class="score-group">
        <div :class="['score', { 'beat-animation': isScoreBeating }]">SCORE: {{ score }}</div>
        <div class="high-score">BEST: {{ highScore }}</div>
      </div>
      <div :class="['timer', { 'timer-warning': timeLeft <= 10 }]">TIME: {{ timeLeft }}s</div>
    </div>

    <transition-group name="combo-fade">
      <div
        v-for="msg in comboMessages"
        :key="msg.id"
        class="combo-popup"
        :style="{ left: msg.x + 'px', top: msg.y + 'px' }"
      >
        {{ msg.text }}
      </div>
    </transition-group>

    <div v-if="gameState === 'start'" class="overlay">
      <h1 class="title">FRUIT NINJA</h1>
      <p class="high-score-display">历史最高分: {{ highScore }}</p>
      <p class="bomb-warning">限时连击！快速切中3个以上才有奖励</p>
      <button class="menu-btn" @click="startGame">START GAME</button>
    </div>

    <div v-if="gameState === 'over'" class="overlay">
      <h2 class="title">TIME UP!</h2>
      <p class="final-score">本次得分: {{ score }}</p>
      <p v-if="isNewRecord" class="new-record">🎉 NEW RECORD! 🎉</p>
      <button class="menu-btn" @click="startGame">REPLAY</button>
    </div>

    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'

const canvasRef = ref(null)
const gameState = ref('start')
const score = ref(0)
const timeLeft = ref(60)
const isScoreBeating = ref(false)
const isNewRecord = ref(false)
const highScore = ref(Number(localStorage.getItem('fruit_ninja_high')) || 0)

const isDragging = ref(false)
const comboMessages = ref([])
let currentDragCombo = 0
let comboLastPos = { x: 0, y: 0 }
let comboTimer = null

let fruits = []
let particles = []
let bladePoints = []
let animationId = null // 关键：用于取消帧动画
let gameTimer = null // 关键：用于取消倒计时
const gravity = 0.12

// 监听分数变化产生跳动效果
watch(score, () => {
  isScoreBeating.value = true
  setTimeout(() => {
    isScoreBeating.value = false
  }, 150)
})

// --- 实体类 ---
class Entity {
  constructor(canvasWidth, canvasHeight, difficulty) {
    this.radius = 35
    this.x = Math.random() * (canvasWidth - 200) + 100
    this.y = canvasHeight + this.radius
    const speedBoost = 1 + difficulty * 0.25
    const targetHeight = (Math.random() * 0.4 + 0.35) * canvasHeight
    this.vy = -Math.sqrt(2 * gravity * targetHeight) * speedBoost
    this.vx = (this.x < canvasWidth / 2 ? 1 : -1) * (Math.random() * 1.5 + 0.5) * speedBoost
    this.isSliced = false
    this.opacity = 1
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.1 * speedBoost
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.vy += gravity
    this.rotation += this.rotationSpeed
  }
}

class Fruit extends Entity {
  constructor(cw, ch, diff) {
    super(cw, ch, diff)
    const colors = ['#ff4d4d', '#4bff4b', '#ffeb3b', '#ff9800', '#e040fb']
    this.color = colors[Math.floor(Math.random() * colors.length)]
    this.splitOffset = 0
  }
  update() {
    super.update()
    if (this.isSliced) {
      this.splitOffset += 5
      this.opacity -= 0.03
    }
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity
    if (!this.isSliced) {
      ctx.beginPath()
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
      ctx.fillStyle = this.color
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(-10, -10, 8, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const drawHalf = (offset, s, e) => {
        ctx.beginPath()
        ctx.arc(offset, 0, this.radius, s, e)
        ctx.lineTo(offset, 0)
        ctx.fillStyle = this.color
        ctx.fill()
      }
      drawHalf(-this.splitOffset, Math.PI * 0.5, Math.PI * 1.5)
      drawHalf(this.splitOffset, Math.PI * 1.5, Math.PI * 0.5)
    }
    ctx.restore()
  }
}

class Bomb extends Entity {
  constructor(cw, ch, diff) {
    super(cw, ch, diff)
    this.tick = 0
  }
  update() {
    super.update()
    this.tick += 0.15
    if (this.isSliced) this.opacity -= 0.1
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity
    const pulse = Math.sin(this.tick) * 5 + 12
    const grad = ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + pulse)
    grad.addColorStop(0, 'rgba(255, 0, 0, 0.8)')
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)')
    ctx.beginPath()
    ctx.arc(0, 0, this.radius + pulse, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, -this.radius)
    ctx.quadraticCurveTo(10, -this.radius - 10, 15, -this.radius - 5)
    ctx.strokeStyle = '#8d6e63'
    ctx.lineWidth = 4
    ctx.stroke()
    if (Math.random() > 0.2) {
      ctx.beginPath()
      ctx.arc(15, -this.radius - 5, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffeb3b'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = '#222'
    ctx.fill()
    ctx.restore()
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x
    this.y = y
    this.color = color
    this.radius = Math.random() * 4
    this.vx = (Math.random() - 0.5) * 10
    this.vy = (Math.random() - 0.5) * 10
    this.opacity = 1
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.opacity -= 0.025
  }
  draw(ctx) {
    ctx.save()
    ctx.globalAlpha = this.opacity
    ctx.fillStyle = this.color
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

// --- 交互与游戏控制 ---

const handleMouseDown = (e) => {
  if (gameState.value !== 'playing') return
  isDragging.value = true
  bladePoints = [{ x: e.clientX, y: e.clientY }]
}

const handleMouseUp = () => {
  isDragging.value = false
  if (currentDragCombo >= 3) showComboEffect(currentDragCombo)
  if (comboTimer) {
    clearTimeout(comboTimer)
    comboTimer = null
  }
  currentDragCombo = 0
  bladePoints = []
}

const showComboEffect = (count) => {
  const bonus = count * 5
  score.value += bonus
  const id = Date.now()
  comboMessages.value.push({
    id,
    x: comboLastPos.x,
    y: comboLastPos.y - 50,
    text: `${count} FRUIT COMBO! +${bonus}`,
  })
  setTimeout(() => {
    comboMessages.value = comboMessages.value.filter((m) => m.id !== id)
  }, 1000)
}

const handleMouseMove = (e) => {
  if (gameState.value !== 'playing' || !isDragging.value) return
  bladePoints.push({ x: e.clientX, y: e.clientY })
  if (bladePoints.length > 8) bladePoints.shift()
}

const handleTouchStart = (e) => {
  if (gameState.value !== 'playing') return
  isDragging.value = true
  const touch = e.touches[0]
  bladePoints = [{ x: touch.clientX, y: touch.clientY }]
}

const handleTouchMove = (e) => {
  if (gameState.value !== 'playing' || !isDragging.value) return
  const touch = e.touches[0]
  bladePoints.push({ x: touch.clientX, y: touch.clientY })
  if (bladePoints.length > 8) bladePoints.shift()
}

const startGame = () => {
  score.value = 0
  timeLeft.value = 60
  isNewRecord.value = false
  fruits = []
  particles = []
  bladePoints = []
  isDragging.value = false
  gameState.value = 'playing'

  if (gameTimer) clearInterval(gameTimer)
  gameTimer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) endGame()
  }, 1000)
}

const endGame = () => {
  gameState.value = 'over'
  isDragging.value = false
  if (comboTimer) clearTimeout(comboTimer)
  if (gameTimer) {
    clearInterval(gameTimer)
    gameTimer = null
  }

  if (score.value > highScore.value) {
    highScore.value = score.value
    isNewRecord.value = true
    localStorage.setItem('fruit_ninja_high', score.value)
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  window.addEventListener('resize', resize)
  resize()

  const gameLoop = () => {
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (gameState.value === 'playing') {
      const progress = (60 - timeLeft.value) / 60
      let fruitSpawnProb = 0.015 + progress * 0.03
      let bombSpawnProb = 0.003 + progress * 0.015

      const rand = Math.random()
      if (rand < fruitSpawnProb) fruits.push(new Fruit(canvas.width, canvas.height, progress))
      else if (rand < fruitSpawnProb + bombSpawnProb)
        fruits.push(new Bomb(canvas.width, canvas.height, progress))

      particles.forEach((p, i) => {
        p.update()
        p.draw(ctx)
        if (p.opacity <= 0) particles.splice(i, 1)
      })

      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i]
        f.update()
        f.draw(ctx)
        if (!f.isSliced && isDragging.value) {
          bladePoints.forEach((p) => {
            if (Math.hypot(f.x - p.x, f.y - p.y) < f.radius) {
              f.isSliced = true
              if (f instanceof Bomb) {
                score.value = Math.max(0, score.value - 100)
                if (comboTimer) clearTimeout(comboTimer)
                currentDragCombo = 0
                for (let j = 0; j < 25; j++) particles.push(new Particle(f.x, f.y, '#ff4400'))
              } else {
                score.value += 10
                if (currentDragCombo === 0) {
                  comboTimer = setTimeout(() => {
                    if (currentDragCombo >= 3) showComboEffect(currentDragCombo)
                    currentDragCombo = 0
                  }, 300)
                }
                currentDragCombo++
                comboLastPos = { x: f.x, y: f.y }
                for (let j = 0; j < 12; j++) particles.push(new Particle(f.x, f.y, f.color))
              }
            }
          })
        }
        if (f.opacity <= 0 || f.y > canvas.height + 150) fruits.splice(i, 1)
      }

      if (isDragging.value && bladePoints.length > 1) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(bladePoints[0].x, bladePoints[0].y)
        bladePoints.forEach((p) => ctx.lineTo(p.x, p.y))
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.shadowBlur = 15
        ctx.shadowColor = 'white'
        ctx.stroke()
        ctx.restore()
      }
    }
    // 关键：保存动画句柄
    animationId = requestAnimationFrame(gameLoop)
  }
  gameLoop()
})

// --- 关键清理逻辑 ---
onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  if (gameTimer) clearInterval(gameTimer)
  if (comboTimer) clearTimeout(comboTimer)
  window.removeEventListener('resize', () => {})
})
</script>

<style scoped>
.game-wrapper {
  width: 100vw;
  height: 100vh;
  background: #0a0a0a;
  position: relative;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.stats-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100px;
  padding: 0 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  pointer-events: none;
  z-index: 15;
  box-sizing: border-box;
}
.score {
  font-family: 'Arial Black', sans-serif;
  font-size: 36px;
  color: #4bff4b;
  transition: transform 0.1s ease;
}
.beat-animation {
  transform: scale(1.3);
  color: #fff;
}
.timer {
  font-family: 'Arial Black', sans-serif;
  font-size: 36px;
  color: #fff;
}
.timer-warning {
  color: #ff4d4d;
  animation: blink 0.5s infinite;
}

.combo-popup {
  position: absolute;
  pointer-events: none;
  color: #ffeb3b;
  font-family: 'Arial Black', sans-serif;
  font-size: 32px;
  text-shadow: 0 0 10px rgba(255, 235, 59, 0.8);
  z-index: 30;
  transform: translate(-50%, -50%);
}
.combo-fade-enter-active {
  animation: combo-in 0.5s ease-out;
}
.combo-fade-leave-active {
  animation: combo-out 0.5s ease-in forwards;
}

@keyframes combo-in {
  0% {
    transform: translate(-50%, 0) scale(0);
    opacity: 0;
  }
  70% {
    transform: translate(-50%, -60px) scale(1.2);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50px) scale(1);
    opacity: 1;
  }
}
@keyframes combo-out {
  100% {
    transform: translate(-50%, -100px) scale(1.5);
    opacity: 0;
  }
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  color: white;
}
.title {
  font-size: 72px;
  color: #ff4d4d;
  font-family: 'Arial Black';
  margin-bottom: 10px;
}
.high-score-display {
  font-size: 24px;
  color: #ffeb3b;
  margin-bottom: 10px;
}
.bomb-warning {
  font-size: 20px;
  color: #ff5252;
  margin-bottom: 30px;
  font-weight: bold;
}
.new-record {
  color: #4bff4b;
  font-size: 28px;
  margin-bottom: 20px;
  animation: bounce 1s infinite;
  font-weight: bold;
}

@keyframes blink {
  50% {
    opacity: 0.5;
  }
}
@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.menu-btn {
  padding: 20px 60px;
  font-size: 28px;
  background: #ff4d4d;
  color: white;
  border: none;
  border-radius: 60px;
  cursor: pointer;
  font-family: 'Arial Black';
}
canvas {
  display: block;
}
</style>
