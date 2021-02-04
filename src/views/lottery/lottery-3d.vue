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

<script>
// https://threejs.org/examples/css3d_periodictable.html
import { Component, Vue } from "vue-property-decorator";
import './origin-main.css';
import './origin-periodictable.css';
import './lottery-custom.css';
import { init, animate, transform } from "./3d.js";

@Component({
  components: {}
})
export default class Lottery3D extends Vue {
  async mounted () {
    init();
    animate();
    await transform( 'table', 1000 ); // sphere
    this.$bus.$emit('lottery-3d-init');
  }
}
</script>
