import { buildCards, createIdAllocator, defaultPeople } from './lottery-config-users';
import { loadUserConfig, configHash, normalizeRoster } from './config-store';
import { randomSalt, randomSeed } from './lottery-rng';
import { isSavedRestorable } from './config-restore';
import type { SavedCardReference, SavedProgress } from './config-restore';
import { bus } from './event-bus';
import { resolveStyle, DEFAULT_AVATAR_STYLE } from './avatar-styles';
import type { PrizeConfig } from './config-store';
import type { Card, Prize, DrawLogEntry } from './lottery-types';
import { isRehearsal } from './rehearsal';

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
  seedSalt: string; // 承诺用的随机盐。旧存档和非安全上下文为空串
  drawLog: DrawLogEntry[]; // 操作流水（抽奖/作废/撤销）
  isProgressStale(): boolean; // 其他窗口已写入更新的进度时返回 true，本窗口不能再改结果
  getCurrentPrize(prizeId?: string | null): Prize | undefined;
  getUserById(id: string): Card | undefined;
  setLocalStorage(): void;
  getLocalStorage(): void;
  getRejectedProgress(): string | null; // 最近一次无法恢复的旧进度备份（JSON 文本），没有时为 null
  takeRejectedNotice(): boolean; // 本次启动有旧进度被拒绝时返回 true，只返回一次
  clearLocalStorage(): void;
  // 用已通过 planProgressRestore 的存档替换正式进度。失败时存储和内存都不变；成功后由调用方刷新页面。
  replaceProgress(saved: SavedProgress): { ok: true } | { ok: false; reason: string };
}

// 优先使用用户配置，否则用内置默认
const userConfig = loadUserConfig();
const headerTitle = userConfig?.headerTitle ?? DEFAULT_HEADER_TITLE;
const prizeConfigs = userConfig?.prizes ?? DEFAULT_PRIZES;
const people = userConfig ? normalizeRoster(userConfig.roster) : defaultPeople;
const avatarStyle = userConfig?.avatarStyle ?? DEFAULT_AVATAR_STYLE;
const autoDowngrade = userConfig?.avatarAutoDowngrade ?? false;
const effectiveStyle = resolveStyle(avatarStyle, people.length, autoDowngrade);
const { cardList, colCount, rowCount } = buildCards(people, effectiveStyle);

// 重名奖项 id 加序号去重（与卡片同规则）
const allocatePrizeId = createIdAllocator();
const prizeList: Prize[] = prizeConfigs.map(p => ({
  count: p.count,
  countRemain: p.count,
  everyTimeGet: p.everyTimeGet,
  presentation: p.presentation ?? 'standard',
  name: p.name,
  detail: p.name + '商品',
  img: p.img ?? '',
  id: allocatePrizeId(p.name),
  round: 0,
  cardListWin: [],
}));

// 当前配置指纹：抽奖进度只在配置未变时才恢复。卡片带着工号，指纹按工号区分同名者
const currentHash = configHash(headerTitle, prizeConfigs, cardList);

// 整场抽奖的种子：无存档时新生成（rngState 从 seed 起步）
const initialSeed = randomSeed();
const initialSalt = randomSalt();
// Capture this once: a rehearsal never reads or mutates the formal draw stream.
const rehearsal = isRehearsal();

let isInit = false;
let storageHealthy = true; // localStorage 写入是否正常（失败只提醒一次的去重标志）
const localStorageKey = '___lottery___';
const rejectedKey = '___lottery_rejected___';
let rejectedNoticePending = false;

// 旧进度校验不通过时先留底再开新场次，否则下一次保存会把它永久覆盖。
// 手动恢复覆盖已有进度时也用它留底（replaced-by-restore）。
// 只保留最近一份；返回是否写入成功。启动时备份失败（多为配额不足）不能影响启动，忽略返回值。
type RejectedReason = 'invalid-json' | 'config-mismatch' | 'invalid-progress' | 'replaced-by-restore';
function keepRejectedProgress(raw: string, reason: RejectedReason): boolean {
  try {
    localStorage.setItem(rejectedKey, JSON.stringify({ at: Date.now(), reason, raw }));
    return true;
  } catch (e) {
    console.warn('旧进度备份失败（可能超出本地存储配额）', e);
    return false;
  }
}

// 启动时发现无法恢复的旧进度：留底并提醒主持人。
function rejectStoredProgress(raw: string, reason: Exclude<RejectedReason, 'replaced-by-restore'>) {
  rejectedNoticePending = true;
  keepRejectedProgress(raw, reason);
}
let knownRevision = 0; // 本窗口最后读到或写入的存档版本
let progressStale = false;

// 读取存档版本。没有存档、解析失败或旧存档都按 0 处理。
function readStoredRevision(): number {
  try {
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || !('revision' in parsed)) return 0;
    return Number.isSafeInteger(parsed.revision) ? parsed.revision as number : 0;
  } catch {
    return 0;
  }
}

// 比较存储和本窗口的版本。不一致说明别的窗口写入或清空过，本窗口就此失效。
function checkProgressStale(): boolean {
  if (rehearsal) return false;
  if (!progressStale && readStoredRevision() !== knownRevision) {
    progressStale = true;
    bus.emit('progress-stale');
  }
  return progressStale;
}

// 存档格式的唯一出处：正常写入和手动恢复后的读回核对都用它。
function serializeProgress(revision: number): string {
  return JSON.stringify({
    version: 2,
    revision,
    hash: currentHash,
    currentPrize: lotteryConfig.currentPrize,
    // 进度只存引用，不把已解析的奖品图或生成的头像重复写入 localStorage。
    prizeList: lotteryConfig.prizeList.map(prize => ({
      id: prize.id,
      countRemain: prize.countRemain,
      round: prize.round,
      cardListWin: prize.cardListWin.map(card => card.id),
    })),
    cardListWinAll: lotteryConfig.cardListWinAll.map(card => card.id),
    cardListRemainAll: lotteryConfig.cardListRemainAll.map(card => card.id),
    cardListExcluded: lotteryConfig.cardListExcluded.map(card => card.id),
    seed: lotteryConfig.seed,
    rngState: lotteryConfig.rngState,
    seedCommit: lotteryConfig.seedCommit,
    seedSalt: lotteryConfig.seedSalt,
    drawLog: lotteryConfig.drawLog,
  });
}

// 正式进度的唯一写入路径。过期时不写（不用本窗口的旧内存覆盖别的窗口写入的新进度），
// 写入抛错时返回 failed，由调用方决定怎么提示。
let lastWriteError: unknown = null;
function writeProgress(): 'written' | 'stale' | 'failed' {
  if (rehearsal) return 'stale';
  if (checkProgressStale()) return 'stale';
  const revision = knownRevision + 1;
  try {
    localStorage.setItem(localStorageKey, serializeProgress(revision));
    knownRevision = revision;
    return 'written';
  } catch (e) {
    lastWriteError = e;
    return 'failed';
  }
}

// 把已通过 isSavedRestorable 的存档应用到内存。启动恢复和手动恢复共用。
function applySavedProgress(saved: SavedProgress) {
  const cardsById = new Map(cardList.map(card => [card.id, card]));
  const restoreCards = (references: SavedCardReference[]) => references.map(reference =>
    cardsById.get(typeof reference === 'string' ? reference : reference.id)!,
  );
  lotteryConfig.currentPrize = saved.currentPrize ?? null;
  // 只恢复进度字段，展示字段（img/detail 等）以当前配置为准——
  // 整体覆盖会把"中途给奖项配的图"冲掉
  const savedPrizeList = new Map((saved.prizeList ?? []).map(prize => [prize.id, prize]));
  lotteryConfig.prizeList.forEach(prize => {
    const savedPrize = savedPrizeList.get(prize.id);
    if (savedPrize) {
      prize.round = savedPrize.round;
      prize.cardListWin = restoreCards(savedPrize.cardListWin);
      // 旧版「作废后再撤销」可能重复归还名额；以仍有效的中奖名单恢复余额。
      prize.countRemain = prize.count - prize.cardListWin.length;
    }
  });
  // 旧存档里的头像/名字/下标都丢弃，统一恢复为当前名单的卡片实例。
  lotteryConfig.cardListWinAll = restoreCards(saved.cardListWinAll);
  lotteryConfig.cardListRemainAll = restoreCards(saved.cardListRemainAll);
  lotteryConfig.cardListExcluded = restoreCards(saved.cardListExcluded ?? []);
  // 种子/进度字段：老存档没有时沿用本次新生成的种子
  if (typeof saved.seed === 'number') {
    lotteryConfig.seed = saved.seed;
    lotteryConfig.rngState = typeof saved.rngState === 'number' ? saved.rngState : saved.seed;
    lotteryConfig.seedCommit = saved.seedCommit ?? '';
    // 旧存档的承诺没有盐，保持原样；还没生成承诺的旧存档直接用本次的新盐。
    lotteryConfig.seedSalt = saved.seedSalt ?? (lotteryConfig.seedCommit ? '' : initialSalt);
    lotteryConfig.drawLog = saved.drawLog ?? [];
  }
}

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
  seedSalt: initialSalt,
  drawLog: [],

  isProgressStale: checkProgressStale,

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
    const result = writeProgress();
    if (result === 'written') {
      storageHealthy = true;
    } else if (result === 'failed' && storageHealthy) {
      console.warn('抽奖进度保存失败（可能超出本地存储配额）', lastWriteError);
      bus.emit('storage-error');
      storageHealthy = false;
    }
  },
  getRejectedProgress() {
    try {
      return localStorage.getItem(rejectedKey);
    } catch {
      return null;
    }
  },
  takeRejectedNotice() {
    const pending = rejectedNoticePending;
    rejectedNoticePending = false;
    return pending;
  },
  getLocalStorage() {
    if (rehearsal) return;
    if (isInit !== false) {
      return void 0;
    }
    isInit = true;
    const raw = localStorage.getItem(localStorageKey);
    if (!raw) {
      return void 0;
    }
    let saved: unknown;
    try {
      saved = JSON.parse(raw);
    } catch {
      rejectStoredProgress(raw, 'invalid-json');
      return void 0;
    }
    // 配置变过（或老版本存档没有指纹）就不恢复，避免名单/奖项对不上
    if (!saved || typeof saved !== 'object' || !('hash' in saved) || saved.hash !== currentHash) {
      rejectStoredProgress(raw, 'config-mismatch');
      return void 0;
    }
    // 校验版本、进度结构及所有引用，通过后才更新内存，避免半恢复状态。
    if (!isSavedRestorable(saved, cardList, lotteryConfig.prizeList)) {
      rejectStoredProgress(raw, 'invalid-progress');
      return void 0;
    }
    applySavedProgress(saved);
  },
  replaceProgress(saved) {
    const staleReason = '其他窗口已更新进度，请关闭其他正式窗口后刷新页面再试';
    if (rehearsal) return { ok: false, reason: '彩排不读写正式进度' };
    if (checkProgressStale()) return { ok: false, reason: staleReason };
    let previousRaw: string | null;
    try {
      previousRaw = localStorage.getItem(localStorageKey);
    } catch {
      return { ok: false, reason: '无法读取本地存储，进度没有改变' };
    }
    // 当前场次已有结果时先留底；留不下就不覆盖（决策 012 #3），让主持人先导出。
    if (previousRaw && lotteryConfig.drawLog.length > 0 && !keepRejectedProgress(previousRaw, 'replaced-by-restore')) {
      return { ok: false, reason: '当前进度无法留底（本地存储可能已满）。请先在公平性面板下载当前验证文件，再清理存储后重试' };
    }
    const snapshot = {
      currentPrize: lotteryConfig.currentPrize,
      prizes: lotteryConfig.prizeList.map(prize => ({ prize, round: prize.round, countRemain: prize.countRemain, cardListWin: prize.cardListWin })),
      cardListWinAll: lotteryConfig.cardListWinAll,
      cardListRemainAll: lotteryConfig.cardListRemainAll,
      cardListExcluded: lotteryConfig.cardListExcluded,
      seed: lotteryConfig.seed,
      rngState: lotteryConfig.rngState,
      seedCommit: lotteryConfig.seedCommit,
      seedSalt: lotteryConfig.seedSalt,
      drawLog: lotteryConfig.drawLog,
    };
    const rollback = () => {
      lotteryConfig.currentPrize = snapshot.currentPrize;
      snapshot.prizes.forEach(({ prize, round, countRemain, cardListWin }) => {
        prize.round = round;
        prize.countRemain = countRemain;
        prize.cardListWin = cardListWin;
      });
      lotteryConfig.cardListWinAll = snapshot.cardListWinAll;
      lotteryConfig.cardListRemainAll = snapshot.cardListRemainAll;
      lotteryConfig.cardListExcluded = snapshot.cardListExcluded;
      lotteryConfig.seed = snapshot.seed;
      lotteryConfig.rngState = snapshot.rngState;
      lotteryConfig.seedCommit = snapshot.seedCommit;
      lotteryConfig.seedSalt = snapshot.seedSalt;
      lotteryConfig.drawLog = snapshot.drawLog;
    };
    applySavedProgress(saved);
    // 走正常写入路径：过期检查和 revision 递增都在里面。写入失败不发 storage-error，由调用方提示。
    const result = writeProgress();
    // 读回核对：确认存储里就是刚才的内容，否则刷新后旧进度会重新生效，主持人以为恢复成功。
    let confirmed = false;
    if (result === 'written') {
      try {
        confirmed = localStorage.getItem(localStorageKey) === serializeProgress(knownRevision);
      } catch {
        confirmed = false;
      }
    }
    if (!confirmed) {
      rollback();
      return { ok: false, reason: result === 'stale' ? staleReason : '本地存储写入失败（可能已满），进度没有改变' };
    }
    return { ok: true };
  },
  clearLocalStorage() {
    if (rehearsal) return;
    localStorage.removeItem(localStorageKey)
    knownRevision = 0;
  },
};

// 启动时恢复抽奖进度（原版此调用缺失导致进度只写不读）
lotteryConfig.getLocalStorage();
// 恢复被拒绝时存储里仍是旧数据，这里无条件同步，否则新场次会被误判为过期。
knownRevision = readStoredRevision();

// 其他窗口写入或清空正式进度时，本窗口立即失效。storage 事件不会发给写入者自己。
if (!rehearsal) {
  window.addEventListener('storage', event => {
    if (event.key === localStorageKey || event.key === null) checkProgressStale();
  });
}

export default lotteryConfig;
