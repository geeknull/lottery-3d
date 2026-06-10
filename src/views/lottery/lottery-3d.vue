<template>
  <div class="lottery-3d-wrap">
    <div id="container"></div>
  </div>
</template>

<style lang="scss" scoped>
.lottery-3d-wrap {
  height: 100%;
  width: 100%;
}
#container {
  height: 100%;
  width: 100%;
}
</style>

<script setup>
// https://threejs.org/examples/css3d_periodictable.html
import { onMounted } from 'vue';
import './origin-main.css';
import './origin-periodictable.css';
import './lottery-custom.css';
import { init, animate, transform } from "./3d.js";
import { bus } from './event-bus';

onMounted(async () => {
  init();
  animate();
  await transform( 'table', 1000 ); // sphere
  bus.emit('lottery-3d-init');
});
</script>
