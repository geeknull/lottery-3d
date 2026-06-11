import lotteryConfig from './lottery-config';
import { notifyLotteryChange } from './lottery-store';
import { rngFromState } from './lottery-rng';
import type { Card, Prize } from './lottery-types';

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
  const poolIds = cardListRemainAllCopy.map(c => c.id); // 抽取前的奖池快照（复算用）
  const selectCount = currentPrize.countRemain < currentPrize.everyTimeGet ? currentPrize.countRemain : currentPrize.everyTimeGet;

  // 种子化抽取：从持久化的 rng 状态续接，保证整场可复算
  const rngStateBefore = lotteryConfig.rngState;
  const rng = rngFromState(rngStateBefore);

  const selectCardList: Card[] = [];
  for (let i = 0; i < selectCount; i++) {
    const curSelectIndex = rng.nextInt(0, cardListRemainAllCopy.length - 1);
    const card = cardListRemainAllCopy.splice(curSelectIndex, 1)[0];
    selectCardList.push(card);
  }
  lotteryConfig.rngState = rng.getState(); // 推进 rng 状态

  // 分别统计出获奖和未获奖的名单
  lotteryConfig.cardListWinAll = [...lotteryConfig.cardListWinAll, ...selectCardList];
  recomputeRemain();

  // 将当前奖项中奖人员统计
  currentPrize.cardListWin = [...currentPrize.cardListWin, ...selectCardList];
  currentPrize.countRemain = currentPrize.countRemain - selectCardList.length;
  currentPrize.round += 1;

  // 写入操作流水（可验证复算 + 历史时间线）
  lotteryConfig.drawLog = [...lotteryConfig.drawLog, {
    type: 'draw',
    at: Date.now(),
    prizeId: currentPrize.id,
    prizeName: currentPrize.name,
    winnerNames: selectCardList.map(c => c.name),
    winnerIds: selectCardList.map(c => c.id),
    rngStateBefore,
    poolIds,
  }];

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
