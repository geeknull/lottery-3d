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
  // 抽取数不仅受奖项剩余名额限制，还不能超过奖池实际剩余人数。
  // 否则（如弃奖不退回反复用导致奖池见底）splice 空数组会得到 undefined 推进中奖名单，
  // 引发 map 崩溃并落盘卡死。replaySequence 早有此守卫，此处补齐。
  const selectCount = Math.min(currentPrize.countRemain, currentPrize.everyTimeGet, cardListRemainAllCopy.length);

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

  // 写入作废流水（历史时间线）
  lotteryConfig.drawLog = [...lotteryConfig.drawLog, {
    type: 'void',
    at: Date.now(),
    prizeId: prize.id,
    prizeName: prize.name,
    winnerNames: [card.name],
    winnerIds: [card.id],
    note: returnToPool ? '退回奖池' : '不再参与',
  }];

  lotteryConfig.setLocalStorage();
  notifyLotteryChange();
  return true;
}

// 撤销最近一次抽奖（整轮重来）：中奖人退回奖池、名额归还、轮数减一。
// 关键：不回退 rng 状态——被撤销的那轮确实消耗了随机流，回退会导致重抽必然抽到同一批人。
// 被撤销轮在 drawLog 里标记 undone 保留（验证时照常复算，链才连续），重抽用新的随机流。
const undoLastDraw = function(): string[] | null {
  const idx = lotteryConfig.drawLog.findLastIndex(e => e.type === 'draw' && !e.undone);
  if (idx === -1) {
    return null;
  }
  const entry = lotteryConfig.drawLog[idx];
  const prize = lotteryConfig.prizeList.find(p => p.id === entry.prizeId);
  if (!prize) {
    return null;
  }
  const ids = new Set(entry.winnerIds);
  prize.cardListWin = prize.cardListWin.filter(c => !ids.has(c.id));
  prize.countRemain += entry.winnerIds.length;
  prize.round = Math.max(0, prize.round - 1);
  lotteryConfig.cardListWinAll = lotteryConfig.cardListWinAll.filter(c => !ids.has(c.id));
  recomputeRemain();

  // 标记被撤销 + 追加一条 undo 历史（不消耗随机流）
  const newLog = lotteryConfig.drawLog.map((e, i) => (i === idx ? { ...e, undone: true } : e));
  newLog.push({
    type: 'undo',
    at: Date.now(),
    prizeId: entry.prizeId,
    prizeName: entry.prizeName,
    winnerNames: entry.winnerNames,
    winnerIds: entry.winnerIds,
  });
  lotteryConfig.drawLog = newLog;

  lotteryConfig.setLocalStorage();
  notifyLotteryChange();
  return entry.winnerIds;
}

export { getRandomCard, voidWinner, undoLastDraw }
