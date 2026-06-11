import lotteryConfig from './lottery-config';
import { scene, objects } from './3d-core';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';

const { cardList } = lotteryConfig;

const create3DCard = function(_objects = objects) {
  // 中奖的卡片要染色
  const cardListWinAll = lotteryConfig.cardListWinAll;
  const cardListWinAllIds = cardListWinAll.map(_ => _.id);

  for (let i = 0; i < cardList.length; i++) {
    const currentCardData = cardList[i];
    const element = document.createElement( 'div' );
    element.className = 'element';
    element.dataset.cardId = currentCardData.id; // 卡片唯一ID
    element.style.backgroundColor = 'rgba(var(--card-rgb), ' + ( Math.random() * 0.5 + 0.25 ) + ')'; // 底色随主题 CSS 变量
    if (cardListWinAllIds.includes(currentCardData.id)) {
      element.classList.add('prize');
    }

    const imgEle = document.createElement('img');
    imgEle.src = currentCardData.avatar;
    imgEle.className = 'card-avatar';
    element.appendChild(imgEle);

    const symbol = document.createElement( 'div' );
    symbol.className = 'symbol';
    symbol.textContent = currentCardData.name;
    element.appendChild( symbol );

    const details = document.createElement( 'div' );
    details.className = 'details';
    details.innerHTML = currentCardData.id;
    element.appendChild( details );

    const objectCSS = new CSS3DObject( element );
    objectCSS.position.x = Math.random() * 4000 - 2000;
    objectCSS.position.y = Math.random() * 4000 - 2000;
    objectCSS.position.z = Math.random() * 4000 - 2000;
    scene.add( objectCSS );

    objects.push( objectCSS );
  }
}

// 作废/恢复中奖后同步卡片墙上的中奖染色
const setCardPrizeMark = function(cardId: string, isPrize: boolean) {
  const element = document.querySelector(`.element[data-card-id="${CSS.escape(cardId)}"]`);
  element?.classList.toggle('prize', isPrize);
}

export { create3DCard, setCardPrizeMark }
