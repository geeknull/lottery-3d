// 用户自定义抽奖配置的读写、导入导出，以及中奖名单 CSV 导出
import type { Prize } from './lottery-types';

export interface PrizeConfig {
  name: string;
  count: number; // 总数量
  everyTimeGet: number; // 每轮抽取数量
  img?: string; // 奖品图（data URL 或 http URL），可选
}

// 名单条目：纯名字用字符串，带头像用对象（两种形态可混用，便于老配置兼容）
export interface RosterEntry {
  name: string;
  avatar?: string; // 头像（http(s) 或 data:image 链接），可选
}

export interface UserLotteryConfig {
  version: 1;
  headerTitle: string;
  prizes: PrizeConfig[];
  roster: (string | RosterEntry)[]; // 抽奖名单（允许重名）
}

const CONFIG_KEY = '___lottery_config___';

// 名单规模性能阈值：CSS3DRenderer 旋转时需每帧重算所有卡片的 3D 变换，
// 实测 ~300 人流畅、1000 人起明显掉帧、2000 人卡顿。超过此值在配置面板给出提示。
export const PERF_WARN_ROSTER = 1000;

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
        typeof prize.everyTimeGet === 'number' && prize.everyTimeGet >= 1 &&
        (prize.img === undefined || typeof prize.img === 'string');
    }) &&
    Array.isArray(cfg.roster) &&
    cfg.roster.length > 0 &&
    cfg.roster.every((entry: unknown) => {
      if (typeof entry === 'string') return entry.length > 0;
      const e = entry as Record<string, unknown>;
      return typeof e === 'object' && e !== null &&
        typeof e.name === 'string' && e.name.length > 0 &&
        (e.avatar === undefined || typeof e.avatar === 'string');
    })
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

// 第二列形如 http(s):// 或 data:image/ 才认作头像，避免误吞 Excel 粘贴的部门列
const AVATAR_PATTERN = /^(https?:\/\/|data:image\/)/;

// 解析粘贴/文件的名单文本：一行一个人，「名字」或「名字,头像链接」；
// 第二列不是链接时按 Excel 多列粘贴处理（只取第一列名字）
export function parseRosterEntries(text: string): RosterEntry[] {
  return text
    .split(/\r?\n/)
    .map((line): RosterEntry => {
      // 只切第一个分隔符：data URL 头像本身含逗号，不能按列全切
      const sep = line.search(/[,\t，]/);
      if (sep === -1) {
        return { name: line.trim() };
      }
      const name = line.slice(0, sep).trim();
      const rest = line.slice(sep + 1).trim();
      return AVATAR_PATTERN.test(rest) ? { name, avatar: rest } : { name };
    })
    .filter(entry => entry.name.length > 0);
}

// 仅取名字列表（计数、构建指纹用）
export function parseRosterText(text: string): string[] {
  return parseRosterEntries(text).map(entry => entry.name);
}

// 把字符串/对象混合的名单统一成对象形态
export function normalizeRoster(roster: (string | RosterEntry)[]): RosterEntry[] {
  return roster.map(entry => (typeof entry === 'string' ? { name: entry } : entry));
}

// 名单条目序列化回文本行（配置面板编辑用）
export function rosterEntriesToText(roster: (string | RosterEntry)[]): string {
  return normalizeRoster(roster)
    .map(entry => (entry.avatar ? `${entry.name},${entry.avatar}` : entry.name))
    .join('\n');
}

// 配置指纹：用于校验 localStorage 里的抽奖进度是否属于当前配置。
// 奖品图、头像是纯展示字段，不参与指纹（换图/换头像不应清空抽奖进度）。
export function configHash(headerTitle: string, prizes: PrizeConfig[], roster: (string | RosterEntry)[]): string {
  const prizeKeys = prizes.map(({ name, count, everyTimeGet }) => ({ name, count, everyTimeGet }));
  const rosterNames = normalizeRoster(roster).map(entry => entry.name);
  const str = JSON.stringify({ headerTitle, prizes: prizeKeys, rosterNames });
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
