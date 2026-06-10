// 用户自定义抽奖配置的读写、导入导出，以及中奖名单 CSV 导出
import type { Prize } from './lottery-types';

export interface PrizeConfig {
  name: string;
  count: number; // 总数量
  everyTimeGet: number; // 每轮抽取数量
}

export interface UserLotteryConfig {
  version: 1;
  headerTitle: string;
  prizes: PrizeConfig[];
  roster: string[]; // 抽奖名单（姓名列表，允许重名）
}

const CONFIG_KEY = '___lottery_config___';

function isValidConfig(data: unknown): data is UserLotteryConfig {
  if (typeof data !== 'object' || data === null) return false;
  const cfg = data as Record<string, unknown>;
  return (
    cfg.version === 1 &&
    typeof cfg.headerTitle === 'string' &&
    Array.isArray(cfg.prizes) &&
    cfg.prizes.length > 0 &&
    cfg.prizes.every((p: unknown) => {
      const prize = p as Record<string, unknown>;
      return typeof prize === 'object' && prize !== null &&
        typeof prize.name === 'string' && prize.name.length > 0 &&
        typeof prize.count === 'number' && prize.count >= 1 &&
        typeof prize.everyTimeGet === 'number' && prize.everyTimeGet >= 1;
    }) &&
    Array.isArray(cfg.roster) &&
    cfg.roster.length > 0 &&
    cfg.roster.every((name: unknown) => typeof name === 'string' && name.length > 0)
  );
}

// 解析配置 JSON 文本（导入文件和 localStorage 共用）
export function parseConfigJson(text: string): UserLotteryConfig | null {
  try {
    const data = JSON.parse(text);
    return isValidConfig(data) ? data : null;
  } catch {
    return null;
  }
}

export function loadUserConfig(): UserLotteryConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  return parseConfigJson(raw);
}

export function saveUserConfig(cfg: UserLotteryConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

export function clearUserConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}

// 解析粘贴/文件的名单文本：一行一个名字；
// 若一行里有逗号/制表符（如直接从 Excel 复制多列），取第一列
export function parseRosterText(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(line => line.split(/[,\t，]/)[0].trim())
    .filter(name => name.length > 0);
}

// 配置指纹：用于校验 localStorage 里的抽奖进度是否属于当前配置
export function configHash(headerTitle: string, prizes: PrizeConfig[], rosterNames: string[]): string {
  const str = JSON.stringify({ headerTitle, prizes, rosterNames });
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportConfigFile(cfg: UserLotteryConfig): void {
  downloadFile('抽奖配置.json', JSON.stringify(cfg, null, 2), 'application/json');
}

export function exportWinnersCsv(prizeList: Prize[]): void {
  const rows: string[] = ['奖项,姓名'];
  prizeList.forEach(prize => {
    prize.cardListWin.forEach(card => {
      rows.push(`${prize.name},${card.name}`);
    });
  });
  // 带 BOM，Excel 打开中文不乱码
  downloadFile('中奖名单.csv', '﻿' + rows.join('\n'), 'text/csv;charset=utf-8');
}
