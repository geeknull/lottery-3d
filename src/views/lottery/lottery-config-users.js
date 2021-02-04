import lotteryConfigUsersRawJson from './lottery-config-users-raw.json';

const cardUserList = lotteryConfigUsersRawJson;
// table模式下行列数
let row = 1;
let col = 1;
const colCount = 25;
cardUserList.forEach((item, i) => {
  // 每行结束 另起一行
  item.index = i;
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
