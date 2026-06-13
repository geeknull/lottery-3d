import lotteryConfig from '../core/lottery-config';
import { scene, objects } from './3d-core';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import type { Card } from '../core/lottery-types';

const { cardList } = lotteryConfig;

// 构建单张卡片的 DOM（纯 DOM，不碰 three.js，便于单测）。
// 名字与 id 都来自用户名单，必须用 textContent，绝不能用 innerHTML——
// 否则形如 `<img src=x onerror=...>` 的名字（经导入他人配置 JSON 传入）会触发存储型 XSS。
export function createCardElement(card: Card, isPrize: boolean): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'element';
  element.dataset.cardId = card.id; // 卡片唯一ID
  element.style.backgroundColor = 'rgba(var(--card-rgb), ' + (Math.random() * 0.5 + 0.25) + ')'; // 底色随主题 CSS 变量
  if (isPrize) {
    element.classList.add('prize');
  }

  const imgEle = document.createElement('img');
  imgEle.src = card.avatar;
  imgEle.className = 'card-avatar';
  element.appendChild(imgEle);

  const symbol = document.createElement('div');
  symbol.className = 'symbol';
  symbol.textContent = card.name;
  element.appendChild(symbol);

  const details = document.createElement('div');
  details.className = 'details';
  details.textContent = card.id; // 纯文本展示，防 XSS（原为 innerHTML）
  element.appendChild(details);

  return element;
}

const create3DCard = function(_objects = objects) {
  // 中奖的卡片要染色
  const cardListWinAll = lotteryConfig.cardListWinAll;
  const cardListWinAllIds = cardListWinAll.map(_ => _.id);

  for (let i = 0; i < cardList.length; i++) {
    const currentCardData = cardList[i];
    const element = createCardElement(currentCardData, cardListWinAllIds.includes(currentCardData.id));

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
