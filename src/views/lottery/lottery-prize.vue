<template>
  <div class="prize-wrap">
    <ul class="prize-list">
      <li class="prize-item"
          v-for="(item, index) in prizeList" :key="index"
          :class="{shine: index === currentPrizeIndex, done: index === donePrizeIndex}"
          @click="selectPrize(item, index)">
        <div class="prize-item-left" v-if="false">
          <img src="http://n1.itc.cn/img8/wb/recom/2016/03/02/145687903767748488.JPEG" alt="">
        </div>
        <div class="prize-item-right">
          <div class="prize-item-title">{{ item.name }}</div>
          <div class="prize-item-name" v-if="false">{{ item.detail }}</div>
          <div class="prize-item-count" style="display: none;">{{ item.count }}名</div>
          <div class="prize-item-count-wrap">
            <div class="prize-item-count-text">{{ item.countRemain }}/{{ item.count }}</div>
            <div class="progress">
              <div
                :style="{width: item.countRemain / item.count * 100 + '%'}"
                class="progress-bar progress-bar-danger progress-bar-striped active"
              ></div>
            </div>
          </div>
        </div>
        <span class="line-1"></span>
        <span class="line-2"></span>
        <span class="line-3"></span>
        <span class="line-4"></span>
      </li>
    </ul>
    <LotteryAction/>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import LotteryAction from './lottery-action.vue';
import lotteryConfig from './lottery-config';
import { transform } from './3d-animate';
import STATUS from './3d-status';
import type { Prize } from './lottery-types';

const prizeList = lotteryConfig.prizeList;
const currentPrizeIndex = ref<number | null>(null);
const donePrizeIndex = ref<number | null>(null);

async function selectPrize(prize: Prize, index: number) {
  if (STATUS.isRun()) {
    alert('正在抽奖中或者已经是当前奖项状态，不能切换奖项！');
    return void 0;
  }
  STATUS.setStatusRun();
  currentPrizeIndex.value = index;
  lotteryConfig.currentPrize = prize.id;
  await transform('table', 1000); // TODO重复点击处理
  STATUS.setStatusWait();
}

onMounted(() => {
  const currentPrize = lotteryConfig.getCurrentPrize()
  if (!currentPrize) {
    currentPrizeIndex.value = prizeList.length - 1;
    lotteryConfig.currentPrize = prizeList[prizeList.length - 1]['id'];
  } else {
    const index = lotteryConfig.prizeList.findIndex(_ => _.id === currentPrize.id);
    currentPrizeIndex.value = index;
  }
});
</script>

<style lang="scss" scoped>
@use './lottery-prize.scss';
</style>
