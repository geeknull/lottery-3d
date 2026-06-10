import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    // redirect: '/lottery-3d'
    component: () => import('../views/lottery/lottery.vue')
  },
  {
    path: '/lottery-3d',
    name: 'lottery-3d',
    component: () => import('../views/lottery/lottery.vue')
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
