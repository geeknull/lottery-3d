<template>
  <div class="empty"></div>
</template>

<style lang="scss" scoped>
</style>

<script lang="js">
// https://github.com/moshang-xc/lottery
import { Component, Vue } from "vue-property-decorator";

@Component({
  components: {}
})
export default class LotteryMusic extends Vue {
  init() {
    this.initElement();
    this.initStarfield();
  }
  initStarfield() {
    const canvas = document.getElementById("canvas");
    const c = canvas.getContext("2d");

    const numStars = 1000;
    const radius = 1;
    const focalLength = canvas.width;

    let centerX, centerY;

    let stars = [], star;
    let i;

    const animate = true;

    initializeStars();

    function executeFrame(){
      if(animate)
        requestAnimationFrame(executeFrame);
      moveStars();
      drawStars();
    }

    function initializeStars(){
      centerX = canvas.width / 2;
      centerY = canvas.height / 2;

      stars = [];
      for(i = 0; i < numStars; i++){
        star = {
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          z: Math.random() * canvas.width
        };
        stars.push(star);
      }
    }

    function moveStars(){
      for(i = 0; i < numStars; i++){
        star = stars[i];
        star.z--;

        if(star.z <= 0){
          star.z = canvas.width;
        }
      }
    }

    function drawStars(){
      let pixelX, pixelY, pixelRadius;

      // Resize to the screen
      if(canvas.width != window.innerWidth || canvas.width != window.innerWidth){
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initializeStars();
      }

      // c.fillStyle = "black";
      c.fillStyle = "rgba(0,10,20,1)";
      c.fillRect(0,0, canvas.width, canvas.height);
      // c.fillStyle = "white";
      c.fillStyle = "rgba(209, 255, 255, " + radius + ")";
      for(i = 0; i < numStars; i++){
        star = stars[i];

        pixelX = (star.x - centerX) * (focalLength / star.z);
        pixelX += centerX;
        pixelY = (star.y - centerY) * (focalLength / star.z);
        pixelY += centerY;
        pixelRadius = radius * (focalLength / star.z);

        c.beginPath();
        c.arc(pixelX, pixelY, pixelRadius, 0, 2 * Math.PI);
        c.fill();
        // c.fillStyle = "rgba(209, 255, 255, " + star.o + ")";
      }
    }

    // Draw the first frame to start animation
    executeFrame();
  }
  initElement() {
    const canvasBox = document.createElement('div');
    canvasBox.style.position = 'fixed';
    canvasBox.style.top = 0;
    canvasBox.style.left = 0;
    canvasBox.style.zIndex = -1;
    const canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    canvasBox.appendChild(canvas);
    document.body.appendChild(canvasBox);
  }
  mounted () {
    this.init();
  }
}
</script>
