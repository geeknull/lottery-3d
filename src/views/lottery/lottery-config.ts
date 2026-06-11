import { buildCards, defaultPeople } from './lottery-config-users';
import { loadUserConfig, configHash } from './config-store';
import type { PrizeConfig } from './config-store';
import type { Card, Prize } from './lottery-types';

export const DEFAULT_HEADER_TITLE = '【GitHub】2077年终大抽奖';
export const DEFAULT_PRIZES: PrizeConfig[] = [
  { name: '特等奖', count: 5, everyTimeGet: 1 },
  { name: '一等奖', count: 5, everyTimeGet: 1 },
  { name: '二等奖', count: 10, everyTimeGet: 5 },
  { name: '三等奖', count: 20, everyTimeGet: 10 },
];

export interface LotteryConfig {
  prizeList: Prize[]; // 奖品列表
  headerTitle: string;
  currentPrize: string | null; // 当前抽奖的奖品 id
  colCount: number;
  rowCount: number; // table模式下行列数
  cardList: Card[]; // 所有卡片的数据
  cardListWinAll: Card[]; // 已经中奖的卡片
  cardListRemainAll: Card[]; // 剩余未中奖的卡片
  cardListExcluded: Card[]; // 作废且不退回奖池的卡片（不再参与抽奖）
  getCurrentPrize(prizeId?: string | null): Prize | undefined;
  getUserById(id: string): Card | undefined;
  setLocalStorage(): void;
  getLocalStorage(): void;
  clearLocalStorage(): void;
}

// 优先使用用户配置，否则用内置默认
const userConfig = loadUserConfig();
const headerTitle = userConfig?.headerTitle ?? DEFAULT_HEADER_TITLE;
const prizeConfigs = userConfig?.prizes ?? DEFAULT_PRIZES;
const people = userConfig ? userConfig.roster.map(name => ({ name })) : defaultPeople;
const { cardList, colCount, rowCount } = buildCards(people);

// 重名奖项 id 加序号去重（与卡片同规则）
const prizeNameCount = new Map<string, number>();
const prizeList: Prize[] = prizeConfigs.map(p => {
  const seen = prizeNameCount.get(p.name) ?? 0;
  prizeNameCount.set(p.name, seen + 1);
  return {
    count: p.count,
    countRemain: p.count,
    everyTimeGet: p.everyTimeGet,
    name: p.name,
    detail: p.name + '商品',
    img: p.img ?? '',
    id: seen === 0 ? p.name : `${p.name}-${seen + 1}`,
    round: 0,
    cardListWin: [],
  };
});

// 当前配置指纹：抽奖进度只在配置未变时才恢复
const currentHash = configHash(headerTitle, prizeConfigs, cardList.map(c => c.name));

let isInit = false;
const localStorageKey = '___lottery___';

const lotteryConfig: LotteryConfig = {
  prizeList,
  headerTitle,
  currentPrize: null, // 当前抽奖的奖品
  colCount, rowCount, // table模式下行列数
  cardList, // 所有卡片的数据
  cardListWinAll: [], // 已经中奖的卡片
  cardListRemainAll: cardList, // 剩余未中奖的卡片
  cardListExcluded: [], // 作废且不退回奖池的卡片

  getCurrentPrize(prizeId = lotteryConfig.currentPrize) {
    return lotteryConfig.prizeList.find(_ => {
      return _.id === prizeId;
    });
  },
  getUserById(id) {
    return cardList.find(_ => _.id === id);
  },
  setLocalStorage() {
    localStorage.setItem(localStorageKey, JSON.stringify({
      hash: currentHash,
      currentPrize: lotteryConfig.currentPrize,
      prizeList: lotteryConfig.prizeList,
      cardListWinAll: lotteryConfig.cardListWinAll,
      cardListRemainAll: lotteryConfig.cardListRemainAll,
      cardListExcluded: lotteryConfig.cardListExcluded,
    }));
  },
  getLocalStorage() {
    if (isInit !== false) {
      return void 0;
    }
    isInit = true;
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) {
      return void 0;
    }
    let saved;
    try {
      saved = JSON.parse(raw);
    } catch (e) {
      console.log(e);
      return void 0;
    }
    // 配置变过（或老版本存档没有指纹）就不恢复，避免名单/奖项对不上
    if (!saved || saved.hash !== currentHash) {
      return void 0;
    }
    lotteryConfig.currentPrize = saved.currentPrize;
    // 只恢复进度字段，展示字段（img/detail 等）以当前配置为准——
    // 整体覆盖会把"中途给奖项配的图"冲掉
    const savedPrizeList: Prize[] = saved.prizeList ?? [];
    lotteryConfig.prizeList.forEach(prize => {
      const savedPrize = savedPrizeList.find(_ => _.id === prize.id);
      if (savedPrize) {
        prize.countRemain = savedPrize.countRemain;
        prize.round = savedPrize.round;
        prize.cardListWin = savedPrize.cardListWin;
      }
    });
    lotteryConfig.cardListWinAll = saved.cardListWinAll;
    lotteryConfig.cardListRemainAll = saved.cardListRemainAll;
    lotteryConfig.cardListExcluded = saved.cardListExcluded ?? []; // 老存档没有该字段
  },
  clearLocalStorage() {
    localStorage.removeItem(localStorageKey)
  },
};

// 启动时恢复抽奖进度（原版此调用缺失导致进度只写不读）
lotteryConfig.getLocalStorage();

console.log('lotteryConfig', lotteryConfig);
export default lotteryConfig;
