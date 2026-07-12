import lotteryConfigUsersRawJson from './lottery-config-users-raw.json';
import { generateAvatarFor } from './avatar-styles';
import type { Card } from './lottery-types';

// 列数按人数自适应：卡片 140x180 + 间距 20，让卡片墙整体接近 16:9
// 宽 = col*160，高 = row*200，col/row ≈ sqrt(n * 16/9 * 200/160)
export function calcColCount(n: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(n * (16 / 9) * (200 / 160))));
}

export interface Person {
  name: string;
  avatar?: string;
}

// 把名单构建成卡片列表：自动生成头像、重名 id 加序号去重、计算 table 行列
export function buildCards(people: Person[], styleId: string): { cardList: Card[]; colCount: number; rowCount: number } {
  const colCount = calcColCount(people.length);
  const nameCount = new Map<string, number>();
  const cardList: Card[] = people.map((person, i) => {
    const seen = nameCount.get(person.name) ?? 0;
    nameCount.set(person.name, seen + 1);
    return {
      name: person.name,
      id: seen === 0 ? person.name : `${person.name}-${seen + 1}`,
      avatar: person.avatar ?? generateAvatarFor(person.name, styleId),
      index: i,
      row: Math.floor(i / colCount) + 1,
      col: (i % colCount) + 1,
    };
  });
  return { cardList, colCount, rowCount: Math.max(1, Math.ceil(people.length / colCount)) };
}

// 内置默认名单（未配置时使用）。只存名字，头像由 generateAvatarFor 现场生成，
// 避免把 ~468KB base64 头像打进主包（原数据自带的像素头像已移除）。
export const defaultPeople: Person[] = lotteryConfigUsersRawJson.map(name => ({ name }));
