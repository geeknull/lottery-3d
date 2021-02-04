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
    <lotteryAction/>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";
import lotteryAction from './lottery-action.vue';
import lotteryConfigImport from './lottery-config.js';
import { transform } from './3d-animate.js';
const lotteryConfig: any = lotteryConfigImport;
import STATUS from './3d-status.js';

@Component({
  components: { lotteryAction }
})
export default class Prize extends Vue {
  $bus: any;
  showBtn = false;
  prizeList = lotteryConfig.prizeList;
  currentPrizeIndex = null;
  donePrizeIndex = null;
  async selectPrize(prize, index) {
    if (STATUS.isRun()) {
      alert('正在抽奖中或者已经是当前奖项状态，不能切换奖项！');
      return void 0;
    }
    STATUS.setStatusRun();
    this.currentPrizeIndex = index;
    lotteryConfig.currentPrize = prize.id;
    await transform('table', 1000); // TODO重复点击处理
    STATUS.setStatusWait();
  }
  mounted() {
    const currentPrize = lotteryConfig.getCurrentPrize()
    if (!currentPrize) {
      this.currentPrizeIndex = this.prizeList.length - 1;
      lotteryConfig.currentPrize = this.prizeList[this.prizeList.length - 1]['id'];
    } else {
      const index = lotteryConfig.prizeList.findIndex(_ => _.id === currentPrize.id);
      this.currentPrizeIndex = index;
    }
  }
}
</script>

<style lang="scss" scoped>
@import './lottery-prize.scss';
</style>
