import { buildCards, defaultPeople } from './lottery-config-users';
import { loadUserConfig, configHash, normalizeRoster } from './config-store';
import { randomSeed } from './lottery-rng';
import { isSavedRestorable } from './config-restore';
import { bus } from './event-bus';
import type { PrizeConfig } from './config-store';
import type { Card, Prize, DrawLogEntry } from './lottery-types';

export const DEFAULT_HEADER_TITLE = '幸运大抽奖';
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
  seed: number; // 整场抽奖的随机种子（可验证公平）
  rngState: number; // 流式推进的当前 rng 状态
  seedCommit: string; // 种子的承诺哈希（SHA-256），开始前公布
  drawLog: DrawLogEntry[]; // 操作流水（抽奖/作废/撤销）
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
const people = userConfig ? normalizeRoster(userConfig.roster) : defaultPeople;
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

// 整场抽奖的种子：无存档时新生成（rngState 从 seed 起步）
const initialSeed = randomSeed();

let isInit = false;
let storageHealthy = true; // localStorage 写入是否正常（失败只提醒一次的去重标志）
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
  seed: initialSeed,
  rngState: initialSeed,
  seedCommit: '', // 异步算出后填充
  drawLog: [],

  getCurrentPrize(prizeId = lotteryConfig.currentPrize) {
    return lotteryConfig.prizeList.find(_ => {
      return _.id === prizeId;
    });
  },
  getUserById(id) {
    return cardList.find(_ => _.id === id);
  },
  setLocalStorage() {
    // 写入是抽奖热路径（每轮 getRandomCard 都调）。配额超限/隐私模式下 setItem 会抛
    // QuotaExceededError，不能让它冒泡打断 lotteryStop 的揭晓动画/彩带，更不能静默丢结果——
    // 捕获后发事件提示主持人及时导出。从健康转失败只提醒一次，避免每轮刷屏。
    try {
      localStorage.setItem(localStorageKey, JSON.stringify({
        hash: currentHash,
        currentPrize: lotteryConfig.currentPrize,
        prizeList: lotteryConfig.prizeList,
        cardListWinAll: lotteryConfig.cardListWinAll,
        cardListRemainAll: lotteryConfig.cardListRemainAll,
        cardListExcluded: lotteryConfig.cardListExcluded,
        seed: lotteryConfig.seed,
        rngState: lotteryConfig.rngState,
        seedCommit: lotteryConfig.seedCommit,
        drawLog: lotteryConfig.drawLog,
      }));
      storageHealthy = true;
    } catch (e) {
      if (storageHealthy) {
        console.warn('抽奖进度保存失败（可能超出本地存储配额）', e);
        bus.emit('storage-error');
        storageHealthy = false;
      }
    }
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
    // 完整性校验：数组字段类型 + 中奖 id 都在当前名单内。不通过就当新局，
    // 挡住被篡改的非数组（否则下方赋值后 .map/.some 抛错→白屏）、哈希碰撞、id 错配。
    if (!isSavedRestorable(saved, cardList)) {
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
    // 种子/进度字段：老存档没有时沿用本次新生成的种子
    if (typeof saved.seed === 'number') {
      lotteryConfig.seed = saved.seed;
      lotteryConfig.rngState = typeof saved.rngState === 'number' ? saved.rngState : saved.seed;
      lotteryConfig.seedCommit = saved.seedCommit ?? '';
      lotteryConfig.drawLog = saved.drawLog ?? [];
    }
  },
  clearLocalStorage() {
    localStorage.removeItem(localStorageKey)
  },
};

// 启动时恢复抽奖进度（原版此调用缺失导致进度只写不读）
lotteryConfig.getLocalStorage();

console.log('lotteryConfig', lotteryConfig);
export default lotteryConfig;
