import lotteryConfig from './lottery-config';
import type { Card, Prize } from './lottery-types';

const random = function(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1) ) + min;
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
  lotteryConfig.cardListRemainAll = lotteryConfig.cardList.filter((item) => {
    const winItem = lotteryConfig.cardListWinAll.find(_ => _.id === item.id);
    return !winItem;
  });

  // 将当前奖项中奖人员统计
  currentPrize.cardListWin = [...currentPrize.cardListWin, ...selectCardList];
  currentPrize.countRemain = currentPrize.countRemain - selectCardList.length;
  currentPrize.round += 1;

  lotteryConfig.setLocalStorage();
  return selectCardList;
}

export { getRandomCard }
