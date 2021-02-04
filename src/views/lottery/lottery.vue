<template>
  <div class="lottery-wrap">
    <lotteryStarfield/>
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

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import Lottery3d from './lottery-3d.vue';
import Prize from './lottery-prize.vue';
import LotteryMusic from './lottery-music.vue';
import lotteryStarfield from './lottery-starfield.vue';
import lotteryConfig from './lottery-config.js';

@Component({
  components: {
    Lottery3d, Prize, LotteryMusic, lotteryStarfield
  }
})
export default class Lottery extends Vue {
  headerTitle = lotteryConfig.headerTitle;
}
</script>
