<template>
  <div class="lottery-wrap">
    <LotteryStarfield/>
    <LotteryMusic/>
    <header class="lottery-header">
      <span>{{ headerTitle }}</span>
    </header>
    <div class="lottery-content">
      <Prize/>
      <Lottery3d/>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lottery-wrap {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
}
.lottery-header {
  flex: none;
  height: 50px;
  width: 100%;
  background-color: hsla(0,0%,100%,.1);
  display: flex;
  justify-content: center;
  align-items: center;
  color: lightseagreen;
  font-size: 26px;
  font-weight: bold;
  //position: fixed;
}
.lottery-content {
  flex: 1;
  display: flex;
}
</style>

<script setup lang="ts">
import Lottery3d from './lottery-3d.vue';
import Prize from './lottery-prize.vue';
import LotteryMusic from './lottery-music.vue';
import LotteryStarfield from './lottery-starfield.vue';
import lotteryConfig from './lottery-config';

const headerTitle = lotteryConfig.headerTitle;
</script>
