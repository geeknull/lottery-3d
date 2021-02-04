import { cardList, colCount, rowCount } from './lottery-config-users.js';

const lotteryConfig = {
  prizeList: [
    {
      count: 5, // 总数量
      countRemain: 5, // 剩余的数量
      everyTimeGet: 1,
      name: "特等奖",
      detail: "特等奖商品",
      img: "",
      id: '特等奖',
      round: 0,
      cardListWin: []
    },
    {
      count: 5, // 总数量
      countRemain: 5,
      everyTimeGet: 1,
      name: "一等奖",
      detail: "一等奖商品",
      img: "",
      id: '一等奖',
      cardListWin: [],
      round: 0
    },
    {
      count: 10,
      countRemain: 10,
      everyTimeGet: 5,
      name: "二等奖",
      detail: "二等奖商品",
      id: '二等奖',
      cardListWin: [],
      round: 0
    },
    {
      count: 20,
      countRemain: 20,
      everyTimeGet: 10,
      name: "三等奖",
      detail: "三等奖商品",
      id: '三等奖',
      cardListWin: [],
      round: 0
    }
  ], // 奖品列表
  headerTitle: '【GitHub】2077年终大抽奖',
  currentPrize: null, // 当前抽奖的奖品
  colCount, rowCount, // table模式下行列数
  cardList, // 所有卡片的数据
  cardListWinAll: [], // 已经中奖的卡片
  cardListRemainAll: cardList, // 剩余未中奖的卡片
};
lotteryConfig.getCurrentPrize = (prizeId = lotteryConfig.currentPrize) => {
  return lotteryConfig.prizeList.find(_ => {
    return _.id === prizeId;
  });
};
lotteryConfig.getUserById = (id) => {
  return cardList.find(_ => _.id === id);
}

let isInit = false;
const localStorageKey = '___lottery___';
lotteryConfig.setLocalStorage = () => {
  const _lotteryConfig = lotteryConfig;
  _lotteryConfig.headerTitle = lotteryConfig.headerTitle;
  _lotteryConfig.currentPrize = lotteryConfig.currentPrize;
  _lotteryConfig.prizeList = lotteryConfig.prizeList;
  _lotteryConfig.cardListWinAll = lotteryConfig.cardListWinAll;
  _lotteryConfig.cardListRemainAll = lotteryConfig.cardListRemainAll;
  localStorage.setItem(localStorageKey, JSON.stringify(_lotteryConfig));
}
lotteryConfig.getLocalStorage = () => {
  if (isInit !== false) {
    return void 0;
  }
  isInit = true;
  const _lotteryConfigString = localStorage.getItem(localStorageKey);
  if (!_lotteryConfigString) {
    return void 0;
  }
  let _lotteryConfig = null;
  try {
    // TODO 数据有效性判断
    _lotteryConfig = JSON.parse(_lotteryConfigString)
  } catch (e) {
    console.log(e);
  }
  lotteryConfig.headerTitle = _lotteryConfig.headerTitle && _lotteryConfig.headerTitle;
  lotteryConfig.currentPrize = _lotteryConfig.currentPrize && _lotteryConfig.currentPrize;
  lotteryConfig.prizeList = _lotteryConfig.prizeList && _lotteryConfig.prizeList;
  lotteryConfig.cardListWinAll = _lotteryConfig.cardListWinAll && _lotteryConfig.cardListWinAll;
  lotteryConfig.cardListRemainAll = _lotteryConfig.cardListRemainAll && _lotteryConfig.cardListRemainAll;
}
lotteryConfig.clearLocalStorage = () => {
  localStorage.removeItem(localStorageKey)
}
console.log('lotteryConfig', lotteryConfig);
export default lotteryConfig;
