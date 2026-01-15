import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HotBoardView.vue')
    },
    {
      path: '/game',
      name: 'game',
      component: () => import('../views/SmallGame.vue')
    }
  ],
})

export default router
