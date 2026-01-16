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
      <div class="config-panel">
        <p class="config-hint">自定义素材 ({{ customImages.length }}/6)</p>
        <input type="file" accept="image/*" @change="handleImageUpload" multiple id="fileInput" />
        <label for="fileInput" class="upload-btn">上传自定义水果</label>
        <div class="preview-group">
          <div v-for="(img, index) in customImages" :key="index" class="preview-item">
            <img :src="img.src" />
          </div>
        </div>
      </div>
      <p class="high-score-display">最高纪录: {{ highScore }}</p>
      <button class="menu-btn" @click="startGame">开始游戏</button>
    </div>

    <div v-if="gameState === 'over'" class="overlay">
      <h2 class="title">TIME UP!</h2>
      <p class="final-score">本次得分: {{ score }}</p>
      <p v-if="isNewRecord" class="new-record">🎉 新 纪 录 🎉</p>
      <button class="menu-btn" @click="startGame">再来一局</button>
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
const customImages = ref([])
let currentDragCombo = 0
let comboLastPos = { x: 0, y: 0 }
let comboTimer = null

let fruits = []
let particles = []
let bladePoints = []
let animationId = null
let gameTimer = null
const gravity = 0.12

watch(score, () => {
  isScoreBeating.value = true
  setTimeout(() => {
    isScoreBeating.value = false
  }, 150)
})

const handleImageUpload = (event) => {
  const files = event.target.files
  for (let file of files) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.src = e.target.result
      img.onload = () => {
        if (customImages.value.length < 6) customImages.value.push(img)
      }
    }
    reader.readAsDataURL(file)
  }
}

// --- 核心实体类 ---

class Entity {
  constructor(canvasWidth, canvasHeight, difficulty) {
    this.radius = 42 // 稍微增大一点，视觉更饱满
    this.x = Math.random() * (canvasWidth - 200) + 100
    this.y = canvasHeight + this.radius
    const speedBoost = 1 + difficulty * 0.25
    const targetHeight = (Math.random() * 0.4 + 0.4) * canvasHeight
    this.vy = -Math.sqrt(2 * gravity * targetHeight) * speedBoost
    this.vx = (this.x < canvasWidth / 2 ? 1 : -1) * (Math.random() * 1.5 + 0.5) * speedBoost
    this.isSliced = false
    this.opacity = 1
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.05
  }

  update() {
    this.x += this.vx
    this.y += this.vy
    this.vy += gravity
    this.rotation += this.rotationSpeed
  }
}

class Fruit extends Entity {
  constructor(cw, ch, diff, imgPool) {
    super(cw, ch, diff)
    // 使用更高亮、更鲜艳的色系
    const colors = [
      '#ff4d4d',
      '#4bff4b',
      '#ffeb3b',
      '#ff9800',
      '#e040fb',
      '#00B0FF', // 宝石蓝
    ]

    const poolSize = 6
    const randomIndex = Math.floor(Math.random() * poolSize)

    if (randomIndex < imgPool.length) {
      this.image = imgPool[randomIndex]
      this.color = '#fff'
    } else {
      this.image = null
      this.color = colors[randomIndex % colors.length]
    }

    this.splitOffset = 0
    this.leftHalf = { vx: 0, vy: 0, rotationSpeed: 0, rotation: 0, x: 0, y: 0 }
    this.rightHalf = { vx: 0, vy: 0, rotationSpeed: 0, rotation: 0, x: 0, y: 0 }
  }

  slice() {
    this.isSliced = true
    const ejectForce = 2.5 + Math.random() * 2
    this.leftHalf = {
      vx: this.vx - ejectForce,
      vy: this.vy - 1,
      rotationSpeed: this.rotationSpeed - 0.12,
      rotation: this.rotation,
      x: this.x,
      y: this.y,
    }
    this.rightHalf = {
      vx: this.vx + ejectForce,
      vy: this.vy - 1,
      rotationSpeed: this.rotationSpeed + 0.12,
      rotation: this.rotation,
      x: this.x,
      y: this.y,
    }
  }

  update() {
    if (!this.isSliced) {
      super.update()
    } else {
      this.leftHalf.x += this.leftHalf.vx
      this.leftHalf.y += this.leftHalf.vy
      this.leftHalf.vy += gravity
      this.leftHalf.rotation += this.leftHalf.rotationSpeed
      this.rightHalf.x += this.rightHalf.vx
      this.rightHalf.y += this.rightHalf.vy
      this.rightHalf.vy += gravity
      this.rightHalf.rotation += this.rightHalf.rotationSpeed
      this.splitOffset += 2
      this.opacity -= 0.025
    }
  }

  draw(ctx) {
    if (this.opacity <= 0) return
    if (!this.isSliced) {
      ctx.save()
      ctx.translate(this.x, this.y)
      ctx.rotate(this.rotation)
      ctx.globalAlpha = this.opacity
      this.drawClippedObject(ctx, 'full')
      ctx.restore()
    } else {
      ctx.save()
      ctx.translate(this.leftHalf.x, this.leftHalf.y)
      ctx.rotate(this.leftHalf.rotation)
      ctx.globalAlpha = this.opacity
      this.drawClippedObject(ctx, 'left')
      this.drawSliceSurface(ctx, 'left')
      ctx.restore()
      ctx.save()
      ctx.translate(this.rightHalf.x, this.rightHalf.y)
      ctx.rotate(this.rightHalf.rotation)
      ctx.globalAlpha = this.opacity
      this.drawClippedObject(ctx, 'right')
      this.drawSliceSurface(ctx, 'right')
      ctx.restore()
    }
  }

  drawClippedObject(ctx, mode) {
    ctx.save()
    ctx.beginPath()
    if (mode === 'full') ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    else if (mode === 'left') ctx.arc(0, 0, this.radius, Math.PI * 0.5, Math.PI * 1.5)
    else ctx.arc(0, 0, this.radius, Math.PI * 1.5, Math.PI * 0.5)
    ctx.clip()

    if (this.image) {
      ctx.drawImage(this.image, -this.radius, -this.radius, this.radius * 2, this.radius * 2)
    } else {
      ctx.fillStyle = this.color
      ctx.fill()
    }

    // --- 升级版亮眼光影 ---
    // 1. 底层环境遮罩 (让边缘深邃)
    const shadow = ctx.createRadialGradient(0, 0, this.radius * 0.6, 0, 0, this.radius)
    shadow.addColorStop(0, 'rgba(0,0,0,0)')
    shadow.addColorStop(1, 'rgba(0,0,0,0.3)')
    ctx.fillStyle = shadow
    ctx.fill()

    // 2. 核心顶部高光点 (玻璃感)
    const highlight = ctx.createRadialGradient(
      -this.radius * 0.35,
      -this.radius * 0.35,
      0,
      -this.radius * 0.35,
      -this.radius * 0.35,
      this.radius * 1.1,
    )
    highlight.addColorStop(0, 'rgba(255, 255, 255, 0.7)')
    highlight.addColorStop(0.2, 'rgba(255, 255, 255, 0.3)')
    highlight.addColorStop(0.6, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = highlight
    ctx.fill()

    ctx.restore()
  }

  drawSliceSurface(ctx, side) {
    ctx.save()
    ctx.beginPath()
    const thickness = 6
    if (side === 'left')
      ctx.ellipse(thickness / 2, 0, thickness / 2, this.radius, 0, 0, Math.PI * 2)
    else ctx.ellipse(-thickness / 2, 0, thickness / 2, this.radius, 0, 0, Math.PI * 2)

    ctx.fillStyle = '#FFFFFF'
    ctx.shadowBlur = 8
    ctx.shadowColor = 'rgba(255,255,255,0.6)'
    ctx.fill()
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
    this.tick += 0.25
    if (this.isSliced) this.opacity -= 0.12
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity
    const pulse = Math.sin(this.tick) * 8 + 12
    const grad = ctx.createRadialGradient(0, 0, this.radius, 0, 0, this.radius + pulse)
    grad.addColorStop(0, 'rgba(255, 48, 48, 0.7)')
    grad.addColorStop(1, 'rgba(255, 0, 0, 0)')
    ctx.beginPath()
    ctx.arc(0, 0, this.radius + pulse, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    // 引信
    ctx.beginPath()
    ctx.moveTo(0, -this.radius)
    ctx.quadraticCurveTo(10, -this.radius - 15, 18, -this.radius - 8)
    ctx.strokeStyle = '#8d6e63'
    ctx.lineWidth = 4
    ctx.stroke()
    if (Math.random() > 0.3) {
      ctx.beginPath()
      ctx.arc(18, -this.radius - 8, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#FFEA00'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    ctx.restore()
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x
    this.y = y
    this.color = color
    this.radius = Math.random() * 5
    this.vx = (Math.random() - 0.5) * 14
    this.vy = (Math.random() - 0.5) * 14
    this.opacity = 1
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.opacity -= 0.035
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

// --- 逻辑控制 ---

const handleMouseDown = (e) => {
  if (gameState.value !== 'playing') return
  isDragging.value = true
  bladePoints = [{ x: e.clientX, y: e.clientY }]
}

const handleMouseUp = () => {
  isDragging.value = false
  if (currentDragCombo >= 3) showComboEffect(currentDragCombo)
  clearTimeout(comboTimer)
  currentDragCombo = 0
  bladePoints = []
}

const handleMouseMove = (e) => {
  if (gameState.value !== 'playing' || !isDragging.value) return
  bladePoints.push({ x: e.clientX, y: e.clientY })
  if (bladePoints.length > 8) bladePoints.shift()
}

const handleTouchStart = (e) => {
  if (gameState.value !== 'playing') return
  isDragging.value = true
  bladePoints = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }]
}

const handleTouchMove = (e) => {
  if (gameState.value !== 'playing' || !isDragging.value) return
  bladePoints.push({ x: e.touches[0].clientX, y: e.touches[0].clientY })
  if (bladePoints.length > 8) bladePoints.shift()
}

const showComboEffect = (count) => {
  const bonus = count * 5
  score.value += bonus
  const id = Date.now()
  comboMessages.value.push({
    id,
    x: comboLastPos.x,
    y: comboLastPos.y - 60,
    text: `${count} COMBO! +${bonus}`,
  })
  setTimeout(() => {
    comboMessages.value = comboMessages.value.filter((m) => m.id !== id)
  }, 800)
}

const startGame = () => {
  score.value = 0
  timeLeft.value = 60
  isNewRecord.value = false
  fruits = []
  particles = []
  bladePoints = []
  gameState.value = 'playing'
  if (gameTimer) clearInterval(gameTimer)
  gameTimer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) endGame()
  }, 1000)
}

const endGame = () => {
  gameState.value = 'over'
  clearInterval(gameTimer)
  if (score.value > highScore.value) {
    highScore.value = score.value
    isNewRecord.value = true
    localStorage.setItem('fruit_ninja_high', score.value)
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  const resize = () => {
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
  }
  window.addEventListener('resize', resize)
  resize()

  const gameLoop = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (gameState.value === 'playing') {
      const progress = (60 - timeLeft.value) / 60
      let fruitProb = 0.02 + progress * 0.035
      let bombProb = 0.006 + progress * 0.016

      const rand = Math.random()
      if (rand < fruitProb)
        fruits.push(new Fruit(canvas.width, canvas.height, progress, customImages.value))
      else if (rand < fruitProb + bombProb)
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
              if (f instanceof Bomb) {
                f.isSliced = true
                score.value = Math.max(0, score.value - 50)
                currentDragCombo = 0
                for (let j = 0; j < 35; j++) particles.push(new Particle(f.x, f.y, '#FF3D00'))
              } else {
                f.slice()
                score.value += 10
                if (currentDragCombo === 0) {
                  comboTimer = setTimeout(() => {
                    if (currentDragCombo >= 3) showComboEffect(currentDragCombo)
                    currentDragCombo = 0
                  }, 300)
                }
                currentDragCombo++
                comboLastPos = { x: f.x, y: f.y }
                for (let j = 0; j < 18; j++) particles.push(new Particle(f.x, f.y, f.color))
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
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 7
        ctx.lineCap = 'round'
        ctx.shadowBlur = 18
        ctx.shadowColor = '#00B0FF'
        ctx.stroke()
        ctx.restore()
      }
    }
    animationId = requestAnimationFrame(gameLoop)
  }
  gameLoop()
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  clearInterval(gameTimer)
  clearTimeout(comboTimer)
})
</script>

<style scoped>
.game-wrapper {
  width: 100vw;
  height: 100vh;
  background: radial-gradient(circle at center, #1a1a1a 0%, #050505 100%);
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
  font-size: 42px;
  color: #00e676;
  text-shadow: 0 0 15px rgba(0, 230, 118, 0.5);
  transition: transform 0.1s ease;
}
.beat-animation {
  transform: scale(1.25);
  color: #fff;
}
.timer {
  font-family: 'Arial Black', sans-serif;
  font-size: 38px;
  color: #fff;
}
.timer-warning {
  color: #ff1744;
  animation: blink 0.5s infinite;
  text-shadow: 0 0 20px rgba(255, 23, 68, 0.8);
}

.config-panel {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 20px;
  border-radius: 16px;
  margin-bottom: 25px;
  text-align: center;
  width: 340px;
}
.config-hint {
  margin-bottom: 12px;
  font-size: 14px;
  color: #aaa;
}
.upload-btn {
  display: inline-block;
  padding: 10px 24px;
  background: linear-gradient(135deg, #00b0ff 0%, #0091ea 100%);
  color: white;
  border-radius: 25px;
  cursor: pointer;
  margin-bottom: 15px;
  font-weight: bold;
  font-size: 14px;
  box-shadow: 0 4px 15px rgba(0, 176, 255, 0.3);
  transition: transform 0.2s;
}
.upload-btn:hover {
  transform: scale(1.05);
}
#fileInput {
  display: none;
}
.preview-group {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}
.preview-item img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #00e676;
  object-fit: cover;
  box-shadow: 0 0 10px rgba(0, 230, 118, 0.3);
}

.combo-popup {
  position: absolute;
  pointer-events: none;
  color: #ffea00;
  font-family: 'Arial Black';
  font-size: 36px;
  text-shadow: 0 0 15px rgba(255, 234, 0, 0.8);
  z-index: 30;
  transform: translate(-50%, -50%);
}
.combo-fade-enter-active {
  animation: combo-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.combo-fade-leave-active {
  animation: combo-out 0.5s ease-in forwards;
}

@keyframes combo-in {
  0% {
    transform: translate(-50%, 20px) scale(0);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, -60px) scale(1);
    opacity: 1;
  }
}
@keyframes combo-out {
  100% {
    transform: translate(-50%, -120px) scale(1.4);
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
  color: #ff1744;
  font-family: 'Arial Black';
  margin-bottom: 15px;
  text-shadow: 0 0 30px rgba(255, 23, 68, 0.5);
}
.high-score-display {
  font-size: 26px;
  color: #ffea00;
  margin-bottom: 25px;
  opacity: 0.9;
}
.new-record {
  color: #00e676;
  font-size: 32px;
  margin-bottom: 25px;
  animation: bounce 0.8s infinite;
  font-weight: bold;
  text-shadow: 0 0 20px rgba(0, 230, 118, 0.6);
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}
@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-15px);
  }
}

.menu-btn {
  padding: 20px 60px;
  font-size: 26px;
  background: linear-gradient(135deg, #ff1744 0%, #d50000 100%);
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  font-family: 'Arial Black';
  box-shadow: 0 6px 20px rgba(255, 23, 68, 0.4);
  transition: all 0.2s;
}
.menu-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 8px 25px rgba(255, 23, 68, 0.6);
}
canvas {
  display: block;
}
</style>
