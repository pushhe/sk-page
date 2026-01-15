<template>
  <div class="game-wrapper" @mousemove="handleMouseMove" @touchmove="handleTouchMove">
    <div v-if="gameState === 'playing'" class="stats-layer">
      <div :class="['score', { 'beat-animation': isScoreBeating }]">SCORE: {{ score }}</div>
      <div class="timer">TIME: {{ timeLeft }}s</div>
    </div>

    <div v-if="gameState === 'start'" class="overlay">
      <h1 class="title">FRUIT NINJA</h1>
      <p class="hint">避开 <span style="color: red; font-weight: bold">红色光晕炸弹</span>！</p>
      <button class="menu-btn" @click="startGame">START GAME</button>
    </div>

    <div v-if="gameState === 'over'" class="overlay">
      <h2 class="title">GAME OVER</h2>
      <p class="final-score">FINAL SCORE: {{ score }}</p>
      <button class="menu-btn" @click="startGame">PLAY AGAIN</button>
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

let fruits = []
let particles = []
let bladePoints = []
let animationId = null
let gameTimer = null
const gravity = 0.15

// --- 1. 粒子系统 ---
class Particle {
  constructor(x, y, color) {
    this.x = x
    this.y = y
    this.color = color
    this.radius = Math.random() * 4 + 1
    this.vx = (Math.random() - 0.5) * 12
    this.vy = (Math.random() - 0.5) * 12
    this.opacity = 1
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.vy += 0.1
    this.opacity -= 0.02
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

// --- 2. 基础物理类 ---
class Entity {
  constructor(canvasWidth, canvasHeight) {
    this.radius = 35
    this.x = Math.random() * (canvasWidth - 200) + 100
    this.y = canvasHeight + this.radius
    const targetHeight = Math.random() * (canvasHeight * 0.45) + canvasHeight * 0.4
    this.vy = -Math.sqrt(2 * gravity * targetHeight)
    this.vx = (this.x < canvasWidth / 2 ? 1 : -1) * (Math.random() * 2 + 1)
    this.isSliced = false
    this.opacity = 1
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.1
  }
  update() {
    this.x += this.vx
    this.y += this.vy
    this.vy += gravity
    this.rotation += this.rotationSpeed
  }
}

// --- 3. 水果类 ---
class Fruit extends Entity {
  constructor(canvasWidth, canvasHeight) {
    super(canvasWidth, canvasHeight)
    const colors = ['#ff4d4d', '#4bff4b', '#ffeb3b', '#ff9800']
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
      // 增加高光，更有立体感
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.beginPath()
      ctx.arc(-10, -10, 8, 0, Math.PI * 2)
      ctx.fill()
    } else {
      const drawHalf = (offset, start, end) => {
        ctx.beginPath()
        ctx.arc(offset, 0, this.radius, start, end)
        ctx.lineTo(offset, 0)
        ctx.fillStyle = this.color
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'
        ctx.stroke()
      }
      drawHalf(-this.splitOffset, Math.PI * 0.5, Math.PI * 1.5)
      drawHalf(this.splitOffset, Math.PI * 1.5, Math.PI * 0.5)
    }
    ctx.restore()
  }
}

// --- 4. 炸弹类 (优化版：红色呼吸光晕) ---
class Bomb extends Entity {
  constructor(canvasWidth, canvasHeight) {
    super(canvasWidth, canvasHeight)
    this.color = '#111'
    this.tick = 0 // 用于控制呼吸动画
  }
  update() {
    super.update()
    this.tick += 0.15 // 增加计时器
    if (this.isSliced) this.opacity -= 0.1
  }
  draw(ctx) {
    if (this.opacity <= 0) return
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity

    // --- A. 红色危险光晕 (关键修改) ---
    // 计算呼吸半径：在 radius 到 radius + 20 之间波动
    const pulse = Math.sin(this.tick) * 5 + 15
    const glowRadius = this.radius + pulse

    // 创建径向渐变: 内红 -> 外透明
    const gradient = ctx.createRadialGradient(0, 0, this.radius, 0, 0, glowRadius)
    gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)') // 紧贴炸弹处较红
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)') // 边缘透明

    ctx.beginPath()
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2)
    ctx.fillStyle = gradient
    ctx.fill()

    // --- B. 炸弹本体 ---
    ctx.beginPath()
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2)
    ctx.fillStyle = '#222' // 黑球
    ctx.fill()

    // 炸弹高光
    ctx.beginPath()
    ctx.arc(-8, -8, 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.fill()

    // --- C. 引信与火花 ---
    // 引信线
    ctx.beginPath()
    ctx.moveTo(0, -this.radius)
    ctx.quadraticCurveTo(10, -this.radius - 10, 15, -this.radius - 5)
    ctx.strokeStyle = '#8d6e63'
    ctx.lineWidth = 4
    ctx.stroke()

    // 引信火花 (闪烁)
    if (Math.random() > 0.3) {
      ctx.beginPath()
      ctx.arc(15, -this.radius - 5, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffeb3b' // 黄色火芯
      ctx.fill()
      ctx.beginPath()
      ctx.arc(15, -this.radius - 5, 8, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 100, 0, ${Math.random() * 0.5})` // 橙色闪光
      ctx.fill()
    }

    ctx.restore()
  }
}

// --- 5. 游戏控制逻辑 ---
watch(score, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    isScoreBeating.value = true
    setTimeout(() => (isScoreBeating.value = false), 150)
  }
})

const startGame = () => {
  score.value = 0
  timeLeft.value = 60
  fruits = []
  particles = []
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
}

const handleMouseMove = (e) => {
  if (gameState.value !== 'playing') return
  bladePoints.push({ x: e.clientX, y: e.clientY })
  if (bladePoints.length > 8) bladePoints.shift()
}

const handleTouchMove = (e) => {
  if (gameState.value !== 'playing') return
  const touch = e.touches[0]
  bladePoints.push({ x: touch.clientX, y: touch.clientY })
  if (bladePoints.length > 8) bladePoints.shift()
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
      const rand = Math.random()
      // 3% 概率生成水果, 0.8% 概率生成炸弹
      if (rand < 0.03) fruits.push(new Fruit(canvas.width, canvas.height))
      else if (rand < 0.038) fruits.push(new Bomb(canvas.width, canvas.height))

      // 粒子更新
      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update()
        particles[i].draw(ctx)
        if (particles[i].opacity <= 0) particles.splice(i, 1)
      }

      // 实体更新
      for (let i = fruits.length - 1; i >= 0; i--) {
        const f = fruits[i]
        f.update()
        f.draw(ctx)

        // 碰撞检测
        if (!f.isSliced) {
          bladePoints.forEach((p) => {
            if (Math.hypot(f.x - p.x, f.y - p.y) < f.radius) {
              f.isSliced = true
              if (f instanceof Bomb) {
                // 切中炸弹：扣分 + 红色爆炸粒子
                score.value = Math.max(0, score.value - 100)
                for (let j = 0; j < 30; j++) particles.push(new Particle(f.x, f.y, '#ff0000'))
                for (let j = 0; j < 10; j++) particles.push(new Particle(f.x, f.y, '#333'))
              } else {
                // 切中水果：加分 + 果汁粒子
                score.value += 10
                for (let j = 0; j < 12; j++) particles.push(new Particle(f.x, f.y, f.color))
              }
            }
          })
        }
        if (f.opacity <= 0 || f.y > canvas.height + 150) fruits.splice(i, 1)
      }

      // 绘制刀光
      if (bladePoints.length > 1) {
        ctx.beginPath()
        ctx.moveTo(bladePoints[0].x, bladePoints[0].y)
        bladePoints.forEach((p) => ctx.lineTo(p.x, p.y))
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 6
        ctx.lineCap = 'round'
        ctx.shadowBlur = 10 // 增加一点发光效果
        ctx.shadowColor = 'white'
        ctx.stroke()
        ctx.shadowBlur = 0 // 重置阴影以免影响其他元素
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
  background: #181818;
  position: relative;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}
.stats-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100px;
  padding: 0 50px;
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
  text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.8);
  transition: transform 0.1s;
}
.beat-animation {
  transform: scale(1.4);
  color: #fff;
  text-shadow: 0 0 20px #f00; /* 扣分或加分都高亮 */
}
.timer {
  font-family: 'Arial Black', sans-serif;
  font-size: 36px;
  color: #ffeb3b;
}
.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  color: white;
  text-align: center;
}
.title {
  font-size: 72px;
  color: #ff4d4d;
  margin-bottom: 10px;
  font-family: 'Arial Black';
  letter-spacing: 4px;
}
.hint {
  font-size: 20px;
  color: #ccc;
  margin-bottom: 40px;
}
.menu-btn {
  padding: 18px 60px;
  font-size: 26px;
  background: #ff4d4d;
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: 0.3s;
  font-family: 'Arial Black';
}
.menu-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 0 30px rgba(255, 77, 77, 0.6);
}
.final-score {
  font-size: 40px;
  margin-bottom: 30px;
}
canvas {
  display: block;
}
</style>
