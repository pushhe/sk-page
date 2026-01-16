<template>
  <div
    class="game-wrapper"
    :class="{ shake: isShaking }"
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

    <div class="combo-container">
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
    </div>

    <div v-if="gameState === 'start'" class="overlay">
      <h1 class="title">FRUIT NINJA</h1>
      <div class="menu-card">
        <div class="best-badge">BEST SCORE: {{ highScore }}</div>
        <div class="config-section">
          <p class="section-label">CUSTOM SKINS ({{ customImages.length }}/6)</p>
          <div class="upload-controls">
            <input
              type="file"
              accept="image/*"
              @change="handleImageUpload"
              multiple
              id="fileInput"
              style="display: none"
            />
            <label for="fileInput" class="upload-btn">UPLOAD</label>
            <div class="preview-row">
              <div v-for="(img, index) in customImages" :key="index" class="mini-thumb">
                <img :src="img.src" />
              </div>
            </div>
          </div>
        </div>
        <button class="menu-btn" @click="startGame">START GAME</button>
      </div>
    </div>

    <div v-if="gameState === 'over'" class="overlay">
      <h2 class="title">TIME'S UP!</h2>
      <div v-if="isNewRecord" class="new-record-badge">NEW RECORD!</div>
      <p class="final-score">TOTAL SCORE: {{ score }}</p>
      <button class="menu-btn auto-width" @click="startGame">PLAY AGAIN</button>
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
const isShaking = ref(false)
const isNewRecord = ref(false)
const highScore = ref(Number(localStorage.getItem('fruit_ninja_high')) || 0)
const isDragging = ref(false)
const comboMessages = ref([])
const customImages = ref([])

// --- 保持 Watcher 逻辑 ---
watch(score, (newVal, oldVal) => {
  if (newVal > oldVal) {
    isScoreBeating.value = true
    setTimeout(() => {
      isScoreBeating.value = false
    }, 150)
  }
})

// --- Base64 音效数据 ---
const sounds = {
  slice:
    'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU1vT19ycnp6e3uAgYKCgoODg4ODg4ODg4ODg4ODg4ODg4Nzc3Nzc3Nzc3Nzc3NzcnJycnJycnJycnJycnJycnJycnJycXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFx',
  boom: 'data:audio/wav;base64,UklGRjJvT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTFvT19ERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERERE',
  throw:
    'data:audio/wav;base64,UklGRihvT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRZvT18/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8/Pz8',
}

const playSound = (type) => {
  const audio = new Audio(sounds[type])
  audio.volume = type === 'throw' ? 0.05 : 0.4
  audio.play().catch(() => {})
}

// --- 逻辑参数 (恢复原版速度和频率) ---
let currentDragCombo = 0
let comboTimer = null
let lastBladeColor = 'rgba(0, 230, 118, 0.9)'
let fruits = []
let particles = []
let bladePoints = []
let animationId = null
let gameTimer = null
const gravity = 0.12 // 恢复原版重力

const triggerShake = () => {
  isShaking.value = true
  setTimeout(() => (isShaking.value = false), 200)
}

// --- Entity Classes ---
class Entity {
  constructor(cw, ch, diff) {
    this.radius = 42
    this.x = Math.random() * (cw - 200) + 100
    this.y = ch + this.radius
    const targetHeight = (Math.random() * 0.4 + 0.4) * ch
    this.vy = -Math.sqrt(2 * gravity * targetHeight) * (1 + diff * 0.25) // 恢复原版速度
    this.vx = (this.x < cw / 2 ? 1 : -1) * (Math.random() * 1.5 + 0.5) // 恢复原版速度
    this.isSliced = false
    this.opacity = 1
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.05 // 恢复原版旋转
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
    const colors = ['#ff4d4d', '#4bff4b', '#ffeb3b', '#ff9800', '#e040fb', '#00B0FF']
    const idx = Math.floor(Math.random() * colors.length)
    this.image = idx < imgPool.length ? imgPool[idx] : null
    this.originalColor = colors[idx]
    this.color = this.image ? '#fff' : this.originalColor
    this.leftHalf = {}
    this.rightHalf = {}
  }
  slice() {
    this.isSliced = true
    const force = 3 + Math.random() * 2
    const common = { y: this.y, vy: this.vy - 1, rotation: this.rotation }
    this.leftHalf = {
      ...common,
      x: this.x,
      vx: this.vx - force,
      rotationSpeed: this.rotationSpeed - 0.1,
    }
    this.rightHalf = {
      ...common,
      x: this.x,
      vx: this.vx + force,
      rotationSpeed: this.rotationSpeed + 0.1,
    }
  }
  update() {
    if (!this.isSliced) super.update()
    else {
      ;[this.leftHalf, this.rightHalf].forEach((h) => {
        h.x += h.vx
        h.y += h.vy
        h.vy += gravity
        h.rotation += h.rotationSpeed
      })
      this.opacity -= 0.03
    }
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    const drawPart = (data, mode) => {
      ctx.save()
      ctx.translate(data.x, data.y)
      ctx.rotate(data.rotation)
      ctx.globalAlpha = this.opacity
      ctx.beginPath()
      if (mode === 'full') ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
      else if (mode === 'left') ctx.arc(0, 0, this.radius, Math.PI * 0.5, Math.PI * 1.5)
      else ctx.arc(0, 0, this.radius, Math.PI * 1.5, Math.PI * 0.5)
      ctx.clip()
      if (this.image)
        ctx.drawImage(this.image, -this.radius, -this.radius, this.radius * 2, this.radius * 2)
      else {
        ctx.fillStyle = this.color
        ctx.fill()
        const g = ctx.createRadialGradient(-10, -10, 0, -10, -10, this.radius * 1.2)
        g.addColorStop(0, 'rgba(255,255,255,0.4)')
        g.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = g
        ctx.fill()
      }
      ctx.restore()
    }
    if (!this.isSliced) drawPart(this, 'full')
    else {
      drawPart(this.leftHalf, 'left')
      drawPart(this.rightHalf, 'right')
    }
  }
}

class Bomb extends Entity {
  constructor(cw, ch, diff) {
    super(cw, ch, diff)
    this.tick = 0
  }
  update() {
    super.update()
    this.tick += 0.2
    if (this.isSliced) this.opacity -= 0.12
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity
    const pulse = Math.sin(this.tick) * 10 + 10
    ctx.beginPath()
    ctx.arc(0, 0, this.radius + pulse, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,0,0,0.2)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    // 炸弹引信完整代码
    ctx.beginPath()
    ctx.moveTo(0, -this.radius)
    ctx.quadraticCurveTo(15, -this.radius - 15, 20, -this.radius - 5)
    ctx.strokeStyle = '#8d6e63'
    ctx.lineWidth = 4
    ctx.stroke()
    if (Math.random() > 0.2) {
      ctx.beginPath()
      ctx.arc(20, -this.radius - 5, 4 + Math.random() * 4, 0, Math.PI * 2)
      ctx.fillStyle = Math.random() > 0.5 ? '#ffeb3b' : '#ff9800'
      ctx.fill()
    }
    ctx.restore()
  }
}

class Particle {
  constructor(x, y, color) {
    this.x = x
    this.y = y
    this.color = color
    this.radius = Math.random() * 4 + 1
    this.vx = (Math.random() - 0.5) * 16
    this.vy = (Math.random() - 0.5) * 16
    this.opacity = 1
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.opacity -= 0.04
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

// --- Lifecycle ---
const startGame = () => {
  score.value = 0
  timeLeft.value = 60
  fruits = []
  particles = []
  currentDragCombo = 0
  isNewRecord.value = false
  gameState.value = 'playing'
  if (gameTimer) clearInterval(gameTimer)
  gameTimer = setInterval(() => {
    timeLeft.value--
    if (timeLeft.value <= 0) endGame()
  }, 1000)
}

const endGame = () => {
  clearInterval(gameTimer)
  gameState.value = 'over'
  if (score.value > highScore.value) {
    isNewRecord.value = true
    highScore.value = score.value
    localStorage.setItem('fruit_ninja_high', score.value)
  }
}

const handleImageUpload = (e) => {
  const files = e.target.files
  for (let f of files) {
    const r = new FileReader()
    r.onload = (ev) => {
      const img = new Image()
      img.src = ev.target.result
      img.onload = () => {
        if (customImages.value.length < 6) customImages.value.push(img)
      }
    }
    r.readAsDataURL(f)
  }
}

const handleMouseDown = (e) => {
  isDragging.value = true
  bladePoints = [{ x: e.clientX, y: e.clientY }]
}
const handleMouseMove = (e) => {
  if (isDragging.value) {
    bladePoints.push({ x: e.clientX, y: e.clientY })
    if (bladePoints.length > 12) bladePoints.shift()
  }
}
const handleMouseUp = () => {
  isDragging.value = false
  bladePoints = []
}
const handleTouchStart = (e) => {
  isDragging.value = true
  bladePoints = [{ x: e.touches[0].clientX, y: e.touches[0].clientY }]
}
const handleTouchMove = (e) => {
  if (isDragging.value) {
    bladePoints.push({ x: e.touches[0].clientX, y: e.touches[0].clientY })
    if (bladePoints.length > 12) bladePoints.shift()
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
      // 恢复原版出现频率
      if (Math.random() < 0.035 + progress * 0.035) {
        fruits.push(new Fruit(canvas.width, canvas.height, progress, customImages.value))
        playSound('throw')
      }
      if (Math.random() < 0.006 + progress * 0.015)
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
          let hasSlicedThisFrame = false
          bladePoints.forEach((p) => {
            if (!hasSlicedThisFrame && Math.hypot(f.x - p.x, f.y - p.y) < f.radius) {
              if (f instanceof Bomb) {
                f.isSliced = true
                triggerShake()
                playSound('boom')
                score.value = Math.max(0, score.value - 50)
                currentDragCombo = 0
                hasSlicedThisFrame = true
              } else {
                f.slice()
                playSound('slice')
                score.value += 10
                lastBladeColor = f.originalColor
                for (let j = 0; j < 15; j++) particles.push(new Particle(f.x, f.y, f.originalColor))
                currentDragCombo++
                hasSlicedThisFrame = true
                if (comboTimer) clearTimeout(comboTimer)
                // 重点：仅修改此处判定窗口为 200ms
                comboTimer = setTimeout(() => {
                  if (currentDragCombo >= 3) {
                    const bonus = currentDragCombo * 5
                    score.value += bonus
                    const id = Date.now()
                    comboMessages.value.push({
                      id,
                      x: f.x,
                      y: f.y,
                      text: `${currentDragCombo} HIT COMBO! +${bonus}`,
                    })
                    setTimeout(() => {
                      comboMessages.value = comboMessages.value.filter((m) => m.id !== id)
                    }, 600)
                  }
                  currentDragCombo = 0
                }, 200)
              }
            }
          })
        }
        if (f.opacity <= 0 || f.y > canvas.height + 200) fruits.splice(i, 1)
      }

      if (isDragging.value && bladePoints.length > 1) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(bladePoints[0].x, bladePoints[0].y)
        for (let i = 1; i < bladePoints.length; i++) {
          ctx.lineTo(bladePoints[i].x, bladePoints[i].y)
        }
        ctx.strokeStyle = lastBladeColor
        ctx.lineWidth = 10
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.shadowBlur = 20
        ctx.shadowColor = lastBladeColor
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(bladePoints[0].x, bladePoints[0].y)
        for (let i = 1; i < bladePoints.length; i++) {
          ctx.lineTo(bladePoints[i].x, bladePoints[i].y)
        }
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 3
        ctx.shadowBlur = 0
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
})
</script>

<style scoped>
.game-wrapper {
  width: 100vw;
  height: 100vh;
  background: #080808;
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
}
.shake {
  animation: shake-kf 0.2s infinite;
}
@keyframes shake-kf {
  0%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(6px, 6px);
  }
  75% {
    transform: translate(-6px, -6px);
  }
}

.stats-layer {
  position: absolute;
  top: 20px;
  width: 100%;
  display: flex;
  justify-content: space-between;
  padding: 0 50px;
  color: white;
  z-index: 50;
  pointer-events: none;
  box-sizing: border-box;
}
.score {
  font-size: 44px;
  font-family: 'Arial Black';
  color: #00e676;
  text-shadow: 0 0 10px rgba(0, 230, 118, 0.5);
  transition: transform 0.15s;
}
.beat-animation {
  transform: scale(1.2);
}
.timer {
  font-size: 40px;
  font-family: 'Arial Black';
}
.timer-warning {
  color: #ff4d4d;
  animation: flash 0.5s infinite alternate;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 80;
  color: white;
  text-align: center;
}
.title {
  font-size: 80px;
  color: #ff4d4d;
  font-family: 'Arial Black';
  margin-bottom: 20px;
  text-shadow: 4px 4px #000;
}

.menu-card {
  background: rgba(255, 255, 255, 0.05);
  padding: 40px;
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  width: 450px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 30px;
  box-sizing: border-box;
}
.best-badge {
  font-size: 26px;
  color: #ffd600;
  font-family: 'Arial Black';
}

.config-section {
  width: 100%;
  text-align: left;
}
.section-label {
  font-size: 12px;
  font-weight: bold;
  color: #aaa;
  margin-bottom: 10px;
}
.upload-controls {
  display: flex;
  align-items: center;
  gap: 15px;
  background: rgba(0, 0, 0, 0.3);
  padding: 15px;
  border-radius: 15px;
  width: 100%;
  box-sizing: border-box;
}
.upload-btn {
  flex-shrink: 0;
  padding: 10px 15px;
  background: #00b0ff;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
}

.preview-row {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}
.mini-thumb {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid #00e676;
  overflow: hidden;
}
.mini-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.menu-btn {
  width: 100%;
  padding: 20px;
  font-size: 24px;
  background: #ff4d4d;
  border-radius: 15px;
  color: white;
  cursor: pointer;
  font-family: 'Arial Black';
  border: none;
  transition: 0.2s;
  box-sizing: border-box;
}
.menu-btn.auto-width {
  width: auto;
  padding-left: 50px;
  padding-right: 50px;
}
.menu-btn:hover {
  background: #ff6666;
  transform: translateY(-3px);
  box-shadow: 0 10px 20px rgba(255, 77, 77, 0.4);
}

.final-score {
  font-size: 32px;
  margin: 20px 0;
  font-family: 'Arial Black';
  color: #00e676;
}
.new-record-badge {
  background: #ffd600;
  color: #000;
  padding: 10px 30px;
  border-radius: 10px;
  font-weight: bold;
  margin-bottom: 10px;
  animation: bounce 0.5s infinite alternate;
}

@keyframes bounce {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(1.1);
  }
}
@keyframes flash {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0.6;
    transform: scale(1.1);
  }
}

.combo-popup {
  position: absolute;
  color: #ffeb3b;
  font-family: 'Arial Black';
  font-size: 36px;
  text-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  transform: translate(-50%, -50%);
  z-index: 60;
}
canvas {
  display: block;
}
.combo-fade-enter-active {
  animation: combo-in 0.6s ease-out;
}
.combo-fade-leave-active {
  animation: combo-out 0.4s ease-in forwards;
}
@keyframes combo-in {
  0% {
    opacity: 0;
    transform: translate(-50%, 0) scale(0.5);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -60px) scale(1.1);
  }
}
@keyframes combo-out {
  100% {
    opacity: 0;
    transform: translate(-50%, -120px) scale(1.3);
  }
}
</style>
