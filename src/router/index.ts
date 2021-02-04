import Vue from 'vue'
import VueRouter, { RouteConfig } from 'vue-router'

Vue.use(VueRouter)

const routes: Array<RouteConfig> = [
  {
    path: '/',
    name: 'Home',
    // redirect: '/lottery-3d'
    component: () => import(/* webpackChunkName: "lottery" */ "../views/lottery/lottery.vue")
  },
  {
    path: "/lottery-3d",
    name: "lottery-3d",
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "lottery-3d" */ "../views/lottery/lottery.vue")
  }
]

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes
})

export default router
