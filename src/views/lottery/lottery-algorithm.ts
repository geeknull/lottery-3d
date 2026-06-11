import lotteryConfig from './lottery-config';
import { notifyLotteryChange } from './lottery-store';
import type { Card, Prize } from './lottery-types';

const random = function(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) ) + min;
}

// 重算未中奖池：全员 - 已中奖 - 已作废排除
const recomputeRemain = function() {
  lotteryConfig.cardListRemainAll = lotteryConfig.cardList.filter((item) => {
    const isWin = lotteryConfig.cardListWinAll.some(_ => _.id === item.id);
    const isExcluded = lotteryConfig.cardListExcluded.some(_ => _.id === item.id);
    return !isWin && !isExcluded;
  });
}

const getRandomCard = function(currentPrize: Prize): Card[] {
  const cardListRemainAllCopy: Card[] = JSON.parse(JSON.stringify(lotteryConfig.cardListRemainAll));
  const selectCount = currentPrize.countRemain < currentPrize.everyTimeGet ? currentPrize.countRemain : currentPrize.everyTimeGet;

  // 随机抽取数据
  const selectCardList: Card[] = [];

  // 正式抽奖逻辑
  for (let i = 0; i < selectCount; i++) {
    const curSelectIndex = random(0, cardListRemainAllCopy.length - 1);
    const card = cardListRemainAllCopy.splice(curSelectIndex, 1)[0];
    selectCardList.push(card);
  }
  console.log('getRandomCard', JSON.parse(JSON.stringify(lotteryConfig)));

  // 分别统计出获奖和未获奖的名单
  lotteryConfig.cardListWinAll = [...lotteryConfig.cardListWinAll, ...selectCardList];
  recomputeRemain();

  // 将当前奖项中奖人员统计
  currentPrize.cardListWin = [...currentPrize.cardListWin, ...selectCardList];
  currentPrize.countRemain = currentPrize.countRemain - selectCardList.length;
  currentPrize.round += 1;

  lotteryConfig.setLocalStorage();
  notifyLotteryChange();
  return selectCardList;
}

// 作废一条中奖记录（中奖人不在场等情况），名额退回奖项后可正常补抽。
// returnToPool 决定该人是否回到奖池继续参与后续抽奖。
const voidWinner = function(prizeId: string, cardId: string, returnToPool: boolean): boolean {
  const prize = lotteryConfig.prizeList.find(p => p.id === prizeId);
  if (!prize) {
    return false;
  }
  const winIndex = prize.cardListWin.findIndex(c => c.id === cardId);
  if (winIndex === -1) {
    return false;
  }
  const [card] = prize.cardListWin.splice(winIndex, 1);
  prize.countRemain += 1;
  lotteryConfig.cardListWinAll = lotteryConfig.cardListWinAll.filter(c => c.id !== cardId);
  if (!returnToPool) {
    lotteryConfig.cardListExcluded = [...lotteryConfig.cardListExcluded, card];
  }
  recomputeRemain();

  lotteryConfig.setLocalStorage();
  notifyLotteryChange();
  return true;
}

export { getRandomCard, voidWinner }
