<template>
  <div class="hot-board-wrapper">
    <el-container class="layout-container">
      <el-aside width="200px" class="aside-nav">
        <div class="logo">
          <el-icon>
            <TrendCharts />
          </el-icon>
          热搜聚合看板
        </div>
        <el-tabs v-model="activeCategory" tab-position="left" class="custom-tabs">
          <el-tab-pane
            v-for="(platforms, category) in config"
            :key="category"
            :label="category"
            :name="category"
          />
        </el-tabs>
      </el-aside>

      <el-main class="main-content">
        <el-scrollbar>
          <div class="card-grid">
            <el-card
              v-for="(label, key) in currentPlatforms"
              :key="key"
              shadow="hover"
              class="platform-card"
            >
              <template #header>
                <div class="card-header">
                  <div class="header-left">
                    <span class="platform-title">{{ label }}</span>
                    <span class="update-time" v-if="updateTimeMap[key]"
                      >{{ updateTimeMap[key] }} 更新</span
                    >
                  </div>
                  <el-button link type="primary" @click="handleOpenDrawer(key, label)">
                    详情
                    <el-icon>
                      <ArrowRight />
                    </el-icon>
                  </el-button>
                </div>
              </template>

              <el-skeleton :loading="loadingMap[key]" animated :rows="3">
                <template #default>
                  <ul class="preview-list" v-if="dataPool[key]?.length">
                    <li
                      v-for="(item, index) in dataPool[key].slice(0, 6)"
                      :key="index"
                      class="list-item"
                    >
                      <span class="rank-tag" :class="'rank-' + (index + 1)">{{ index + 1 }}</span>

                      <el-link :href="item.url" target="_blank" class="hot-title" underline="hover">
                        {{ item.title }}
                      </el-link>
                    </li>
                  </ul>
                  <el-empty v-else :image-size="40" description="暂无数据" />
                </template>
              </el-skeleton>
            </el-card>
          </div>
        </el-scrollbar>
      </el-main>
    </el-container>

    <el-drawer
      v-model="drawerVisible"
      :title="selectedName + ' · 完整榜单'"
      direction="rtl"
      size="550px"
    >
      <el-table :data="dataPool[selectedKey]" stripe style="width: 100%">
        <el-table-column type="index" label="排名" width="60" align="center">
          <template #default="scope">
            <span :class="scope.$index < 3 ? 'top-rank' : ''">{{ scope.$index + 1 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="话题内容">
          <template #default="scope">
            <el-link :href="scope.row.url" target="_blank" type="primary" class="drawer-link">
              {{ scope.row.title }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="hot_value" label="热度" width="100" align="right" />
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ArrowRight, TrendCharts } from '@element-plus/icons-vue'
import { getHotBoard } from '@/api/uapi.js'

// 1. 平台数据配置
const config = {
  '视频/社区': {
    bilibili: '哔哩哔哩弹幕网',
    acfun: 'A站弹幕视频网站',
    weibo: '新浪微博热搜',
    zhihu: '知乎热榜',
    'zhihu-daily': '知乎日报热榜',
    douyin: '抖音热榜',
    kuaishou: '快手热榜',
    'douban-movie': '豆瓣电影榜单',
    'douban-group': '豆瓣小组话题',
    tieba: '百度贴吧热帖',
    hupu: '虎扑热帖',
    miyoushe: '米游社话题榜',
    ngabbs: 'NGA游戏论坛热帖',
    v2ex: 'V2EX技术社区热帖',
    '52pojie': '吾爱破解热帖',
    hostloc: '全球主机交流论坛',
    coolapk: '酷安热榜',
  },
  '新闻/资讯': {
    baidu: '百度热搜',
    thepaper: '澎湃新闻热榜',
    toutiao: '今日头条热榜',
    'qq-news': '腾讯新闻热榜',
    sina: '新浪热搜',
    'sina-news': '新浪新闻热榜',
    'netease-news': '网易新闻热榜',
    huxiu: '虎嗅网热榜',
    ifanr: '爱范儿热榜',
  },
  '技术/IT': {
    sspai: '少数派热榜',
    ithome: 'IT之家热榜',
    'ithome-xijiayi': 'IT之家·喜加一栏目',
    juejin: '掘金社区热榜',
    jianshu: '简书热榜',
    guokr: '果壳热榜',
    '36kr': '36氪热榜',
    '51cto': '51CTO热榜',
    csdn: 'CSDN博客热榜',
    nodeseek: 'NodeSeek技术社区',
    hellogithub: 'HelloGitHub项目推荐',
  },
  游戏: {
    lol: '英雄联盟热帖',
    genshin: '原神热榜',
    honkai: '崩坏3热榜',
    starrail: '星穹铁道热榜',
  },
  其他: {
    weread: '微信读书热门书籍',
    weatheralarm: '天气预警信息',
    history: '历史上的今天',
  },
}

// 2. 状态存储
const activeCategory = ref('视频/社区')
const dataPool = reactive({}) // 存放 list 数组
const updateTimeMap = reactive({}) // 存放 update_time
const loadingMap = reactive({}) // 加载状态
const drawerVisible = ref(false)
const selectedKey = ref('')
const selectedName = ref('')

const currentPlatforms = computed(() => config[activeCategory.value])

/**
 * 3. 串行请求队列 (核心限流逻辑)
 */
const loadCategoryDataQueue = async (category) => {
  const platforms = Object.keys(config[category])

  for (const key of platforms) {
    if (dataPool[key]?.length > 0 || loadingMap[key]) continue

    loadingMap[key] = true
    try {
      const res = await getHotBoard(key)
      // 适配响应格式: res.list 和 res.update_time
      dataPool[key] = res.list || []
      updateTimeMap[key] = res.update_time?.substring(11, 16) || ''

      // 每次请求后强制等待 600ms，防止触发限流
      await new Promise((resolve) => setTimeout(resolve, 600))
    } catch (error) {
      console.error(`加载 ${key} 失败:`, error)
    } finally {
      loadingMap[key] = false
    }
  }
}

watch(
  activeCategory,
  (newCat) => {
    loadCategoryDataQueue(newCat)
  },
  { immediate: true },
)

/**
 * 4. 交互逻辑
 */
const handleOpenDrawer = (key, name) => {
  selectedKey.value = key
  selectedName.value = name
  drawerVisible.value = true
}
</script>

<style scoped>
.hot-board-wrapper {
  height: 100vh;
  background-color: #f8fafc;
}

.layout-container {
  height: 100%;
}

.aside-nav {
  background: #fff;
  border-right: 1px solid #e2e8f0;
}

.logo {
  padding: 24px;
  font-weight: bold;
  color: #3b82f6;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
}

/* 网格系统 */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
  padding: 20px;
}

.platform-card {
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  flex-direction: column;
}

.platform-title {
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}

.update-time {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

/* 预览列表布局 */
.preview-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.list-item {
  display: flex;
  align-items: flex-start; /* 顶部对齐：防止标题多行时数字居中 */
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.list-item:last-child {
  border-bottom: none;
}

.rank-tag {
  min-width: 20px;
  max-width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  font-size: 11px;
  border-radius: 4px;
  margin-right: 12px;
  margin-top: 2px; /* 与文字第一行居中对齐 */
  background: #f1f5f9;
  color: #64748b;
  flex-shrink: 0;
}

/* 前三名样式 */
.rank-1 {
  background: #fee2e2;
  color: #ef4444;
}

.rank-2 {
  background: #ffedd5;
  color: #f59e0b;
}

.rank-3 {
  background: #ecfdf5;
  color: #10b981;
}

/* 核心：两行换行并左对齐 */
.hot-title {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
  color: #334155;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2; /* 最多显示2行 */
  overflow: hidden;
  word-break: break-all;
  white-space: normal;
}

.hot-title:hover {
  color: #3b82f6;
}

/* 详情抽屉内链接 */
.drawer-link {
  text-align: left;
  line-height: 1.4;
}

.top-rank {
  color: #ef4444;
  font-weight: bold;
}

/* 自定义 Tabs 样式 */
:deep(.el-tabs__item.is-left) {
  text-align: left;
  height: 50px;
  padding: 0 30px;
}
</style>
