import lotteryConfigUsersRawJson from './lottery-config-users-raw.json';
import type { Card } from './lottery-types';

// 原始名单只有 name/id/sex/avatar，这里补全 index 并计算 table 模式下的行列号
const cardUserList: Card[] = lotteryConfigUsersRawJson.map((item, i) => ({
  ...item,
  index: i,
  row: 0,
  col: 0,
}));

// table模式下行列数
let row = 1;
let col = 1;
const colCount = 25;
cardUserList.forEach((item) => {
  // 每行结束 另起一行
  if (col > colCount) {
    col = 1;
    row++;
  }
  item.row = row;
  item.col = col;
  col++;
});

export { colCount };
export const rowCount = row;
export const cardList = cardUserList;
