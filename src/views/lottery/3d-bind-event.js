import { transform } from './3d-animate.js';
import { camera, render, renderer, getContainerWidth, getContainerHeight } from './3d-core.js';

const initEvent = function() {
  const buttonTable = document.getElementById( 'table' );
  buttonTable.addEventListener( 'click', function () {
    transform( 'table', 2000 );
  }, false );

  const buttonSphere = document.getElementById( 'sphere' );
  buttonSphere.addEventListener( 'click', function () {
    transform( 'sphere', 2000 );
  }, false );

  const buttonHelix = document.getElementById( 'helix' );
  buttonHelix.addEventListener( 'click', function () {
    transform( 'helix', 2000 );
  }, false );

  const buttonGrid = document.getElementById( 'grid' );
  buttonGrid.addEventListener( 'click', function () {
    transform( 'grid', 2000 );
  }, false );
}

export { initEvent }

//
window.addEventListener( 'resize', onWindowResize );

function onWindowResize() {
  camera.aspect = getContainerWidth() / getContainerHeight();
  camera.updateProjectionMatrix();
  renderer.setSize( getContainerWidth(), getContainerHeight() );
  render();
}
