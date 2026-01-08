<script setup>
import { ref } from 'vue'
import { getHotBoard } from '@/api/uapi'

const hotData = ref([])
const platform = { weibo: '微博热搜', thepaper: '澎湃新闻', sina: '新浪新闻', douyin: '抖音热搜' }

const getHotBoardData = async () => {
  for (const key in platform) {
    const res = await getHotBoard(key)
    hotData.value.push(res)
  }
}

getHotBoardData()
</script>

<template>
  <div class="hot-board">
    <div class="board-item" v-for="(item, index) in hotData" :key="index">
      <el-table :data="item.list">
        <el-table-column prop="title" :label="platform[item.type]" show-overflow-tooltip>
          <template #default="scope">
            <el-link :href="scope.row.url" target="_blank" type="primary" rel="noreferrer">
              {{ scope.row.title }}
            </el-link>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.hot-board {
  display: flex;
  justify-content: space-evenly;

  .board-item {
    width: 250px;
  }
}
</style>
