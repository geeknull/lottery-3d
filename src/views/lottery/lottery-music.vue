<template>
  <div class="lottery-music">
    <!-- http://music.163.com/song/media/outer/url?id=4022088.mp3 -->
    <audio id="music" src="https://music.163.com/song/media/outer/url?id=4022088.mp3" class="music-item" loop></audio>
    <div id="musicBox" class="music-box" title="播放/暂停背景音乐">Music</div>
  </div>
</template>

<style lang="scss" scoped>
.lottery-music {
  position: fixed;
  top: 0;
  right: 10px;
  z-index: 5;
  user-select: none;
}

.music-item {
  display: block !important;
  opacity: 0;
}

.music-box {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  text-align: center;
  line-height: 50px;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  background-color: rgba(253, 105, 0, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.5);
}
</style>

<script lang="ts">
import { Component, Vue } from "vue-property-decorator";

@Component({
  components: {}
})
export default class LotteryMusic extends Vue {
  musicInit() {
    const music: any = document.querySelector("#music");

    let rotated = 0;
    let stopAnimate = false;
    const musicBox: any = document.querySelector("#musicBox");

    function animate() {
      requestAnimationFrame(function () {
        if (stopAnimate) {
          return;
        }
        rotated = rotated % 360;
        musicBox.style.transform = "rotate(" + rotated + "deg)";
        rotated += 1;
        animate();
      });
    }

    musicBox.addEventListener(
      "click",
      function (e) {
        if (music.paused) {
          music.play().then(
            () => {
              stopAnimate = false;
              animate();
            },
            () => {
              console.log('背景音乐自动播放失败，请给权限或手动播放！');
              // alert('背景音乐自动播放失败，请给权限或手动播放！')
            }
          );
        } else {
          music.pause();
          stopAnimate = true;
        }
      },
      false
    );

    setTimeout(function () {
      musicBox.click();
    }, 1000);
  }
  mounted () {
    this.musicInit();
  }
}
</script>
