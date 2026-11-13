// 用户自定义抽奖配置的读写、导入导出，以及中奖名单 CSV 导出
import type { Prize, PrizePresentation } from './lottery-types';
import { isRehearsal } from './rehearsal';

export interface PrizeConfig {
  name: string;
  count: number; // 总数量
  everyTimeGet: number; // 每轮抽取数量
  img?: string; // 奖品图（data URL 或 http URL），可选
  presentation?: PrizePresentation; // 揭晓节奏，缺省 standard
}

export function isPrizePresentation(value: unknown): value is PrizePresentation {
  return value === 'standard' || value === 'ceremonial';
}

// 名单条目：纯名字用字符串，带头像或身份信息用对象（两种形态可混用，便于老配置兼容）
export interface RosterEntry {
  name: string;
  avatar?: string; // 头像（http(s) 或 data:image 链接），可选
  employeeId?: string; // 工号，可选。区分同名的人，参与配置指纹和种子承诺
  department?: string; // 部门，可选。只用于展示和导出，不参与指纹
}

export interface UserLotteryConfig {
  version: 1;
  headerTitle: string;
  prizes: PrizeConfig[];
  roster: (string | RosterEntry)[]; // 抽奖名单（允许重名）
  avatarStyle?: string;          // 生成头像风格 id，缺省 fun-emoji
  avatarAutoDowngrade?: boolean; // 大名单自动降级为轻量头像
}

const CONFIG_KEY = '___lottery_config___';

// Large rosters need an on-device rehearsal; this threshold is a prompt, not a frame-rate claim.
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
        (prize.img === undefined || typeof prize.img === 'string') &&
        (prize.presentation === undefined || isPrizePresentation(prize.presentation));
    }) &&
    (cfg.avatarStyle === undefined || typeof cfg.avatarStyle === 'string') &&
    (cfg.avatarAutoDowngrade === undefined || typeof cfg.avatarAutoDowngrade === 'boolean') &&
    Array.isArray(cfg.roster) &&
    cfg.roster.length > 0 &&
    cfg.roster.every((entry: unknown) => {
      if (typeof entry === 'string') return entry.length > 0;
      const e = entry as Record<string, unknown>;
      return typeof e === 'object' && e !== null &&
        typeof e.name === 'string' && e.name.length > 0 &&
        (e.avatar === undefined || typeof e.avatar === 'string') &&
        (e.employeeId === undefined || typeof e.employeeId === 'string') &&
        (e.department === undefined || typeof e.department === 'string');
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

// 返回 false 表示写入失败（多为 localStorage 配额超限或隐私模式禁用），
// 由调用方提示用户，避免配置被静默丢弃。
export function saveUserConfig(cfg: UserLotteryConfig): boolean {
  if (isRehearsal()) return false;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    return true;
  } catch {
    return false;
  }
}

export function clearUserConfig(): void {
  if (isRehearsal()) return;
  localStorage.removeItem(CONFIG_KEY);
}

// 第二列形如 http(s):// 或 data:image/ 才认作头像，避免误吞 Excel 粘贴的部门列
const AVATAR_PATTERN = /^(https?:\/\/|data:image\/)/;

// 解码导入的文本文件。Excel 按系统编码保存 CSV，不能假定是 UTF-8：
// 先看 BOM，再严格按 UTF-8 解码，失败时按 GB18030（GBK 的超集）解码。
export function decodeTextFile(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

// 名单列分隔符：半角逗号、制表符（Excel 复制）、全角逗号
const SEPARATOR = /[,\t，]/;

// 旧格式：一行一个人，「名字」或「名字,头像链接」；第二列不是链接时按 Excel 多列粘贴处理（只取第一列名字）。
// 没有身份表头的名单一律走这里，结果必须和加身份列之前完全相同。
function parseLegacyRoster(text: string): RosterEntry[] {
  return text
    .split(/\r?\n/)
    .map((line): RosterEntry => {
      // 只切第一个分隔符：data URL 头像本身含逗号，不能按列全切
      const sep = line.search(SEPARATOR);
      if (sep === -1) {
        return { name: line.trim() };
      }
      const name = line.slice(0, sep).trim();
      const rest = line.slice(sep + 1).trim();
      return AVATAR_PATTERN.test(rest) ? { name, avatar: rest } : { name };
    })
    .filter(entry => entry.name.length > 0);
}

type RosterColumn = 'name' | 'employeeId' | 'department' | 'avatar';
// 表头关键字，英文不分大小写（统一转小写后比较）
const NAME_HEADERS = new Set(['姓名', '名字', 'name']);
const COLUMN_HEADERS: Record<string, Exclude<RosterColumn, 'name'>> = {
  工号: 'employeeId', 编号: 'employeeId', employee_id: 'employeeId',
  部门: 'department', department: 'department',
  头像: 'avatar', avatar: 'avatar',
};

// 按分隔符切开一行，同时记下每格在原文里的起点（头像列要取到行尾）
function splitCells(line: string): { text: string; start: number }[] {
  const cells: { text: string; start: number }[] = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || SEPARATOR.test(line[i])) {
      cells.push({ text: line.slice(start, i), start });
      start = i + 1;
    }
  }
  return cells;
}

// 首个非空行第一格是姓名类关键字、后面至少一格是已知列名时，返回各列含义；否则返回 null。
function detectHeader(lines: string[]): { index: number; columns: (RosterColumn | null)[] } | null {
  const index = lines.findIndex(line => line.trim().length > 0);
  if (index === -1) return null;
  const cells = splitCells(lines[index]).map(cell => cell.text.trim().toLowerCase());
  if (!NAME_HEADERS.has(cells[0])) return null;
  const columns: (RosterColumn | null)[] = cells.map((cell, i) => (i === 0 ? 'name' : COLUMN_HEADERS[cell] ?? null));
  return columns.slice(1).some(Boolean) ? { index, columns } : null;
}

// 表头模式：列按表头对应，不认识的列忽略。头像列放最后时取到行尾（data URL 含逗号）。
function parseHeaderRoster(lines: string[], header: { index: number; columns: (RosterColumn | null)[] }): RosterEntry[] {
  const { columns } = header;
  const lastColumn = columns.length - 1;
  const entries: RosterEntry[] = [];
  for (const line of lines.slice(header.index + 1)) {
    const cells = splitCells(line);
    const entry: RosterEntry = { name: '' };
    columns.forEach((column, i) => {
      const cell = cells[i];
      if (!column || !cell) return;
      const value = (column === 'avatar' && i === lastColumn ? line.slice(cell.start) : cell.text).trim();
      if (!value) return;
      if (column === 'name') entry.name = value;
      else if (column === 'avatar') { if (AVATAR_PATTERN.test(value)) entry.avatar = value; }
      else entry[column] = value;
    });
    if (entry.name) entries.push(entry);
  }
  return entries;
}

// 解析粘贴/文件的名单文本。首行是身份表头（如「姓名,工号,部门」）时按列解析，否则按旧格式解析。
export function parseRosterEntries(text: string): RosterEntry[] {
  const lines = text.split(/\r?\n/);
  const header = detectHeader(lines);
  return header ? parseHeaderRoster(lines, header) : parseLegacyRoster(text);
}

export interface RosterTextHints {
  headerMode: boolean; // 按身份表头解析
  ignoredColumns: boolean; // 没有表头、但有行带了头像以外的附加列（会被忽略）
  duplicateEmployeeIds: { id: string; count: number }[]; // 重复的工号，按首次出现顺序
}

// 配置面板用的提示：多列无表头、重复工号。只读文本，不改变解析结果。
export function rosterTextHints(text: string): RosterTextHints {
  const lines = text.split(/\r?\n/);
  const header = detectHeader(lines);
  const ignoredColumns = !header && lines.some(line => {
    const sep = line.search(SEPARATOR);
    if (sep === -1 || !line.slice(0, sep).trim()) return false;
    const rest = line.slice(sep + 1).trim();
    return rest.length > 0 && !AVATAR_PATTERN.test(rest);
  });
  const counts = new Map<string, number>();
  if (header) {
    for (const entry of parseHeaderRoster(lines, header)) {
      if (entry.employeeId) counts.set(entry.employeeId, (counts.get(entry.employeeId) ?? 0) + 1);
    }
  }
  const duplicateEmployeeIds = [...counts].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
  return { headerMode: Boolean(header), ignoredColumns, duplicateEmployeeIds };
}

// 仅取名字列表（计数、构建指纹用）
export function parseRosterText(text: string): string[] {
  return parseRosterEntries(text).map(entry => entry.name);
}

// 把字符串/对象混合的名单统一成对象形态
export function normalizeRoster(roster: (string | RosterEntry)[]): RosterEntry[] {
  return roster.map(entry => (typeof entry === 'string' ? { name: entry } : entry));
}

// 名单里是否有人带工号或部门
export function hasRosterIdentity(roster: (string | RosterEntry)[]): boolean {
  return normalizeRoster(roster).some(entry => Boolean(entry.employeeId || entry.department));
}

// 名单条目序列化回文本行（配置面板编辑用）。没有身份信息时保持旧格式；
// 有时输出「姓名,工号,部门[,头像]」表头，头像放最后（data URL 含逗号）。
export function rosterEntriesToText(roster: (string | RosterEntry)[]): string {
  const entries = normalizeRoster(roster);
  if (!hasRosterIdentity(entries)) {
    return entries
      .map(entry => (entry.avatar ? `${entry.name},${entry.avatar}` : entry.name))
      .join('\n');
  }
  const withAvatar = entries.some(entry => entry.avatar);
  const header = withAvatar ? '姓名,工号,部门,头像' : '姓名,工号,部门';
  const rows = entries.map(entry => {
    const cells = [entry.name, entry.employeeId ?? '', entry.department ?? ''];
    if (withAvatar) cells.push(entry.avatar ?? '');
    return cells.join(',');
  });
  return [header, ...rows].join('\n');
}

// 配置指纹：用于校验 localStorage 里的抽奖进度是否属于当前配置。
// 奖品图、头像、揭晓节奏是纯展示字段，不参与指纹（修改它们不应清空抽奖进度）。
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

// 导出无法恢复的旧进度备份，交给技术人员排查或手工找回结果。
export function exportRejectedProgress(backup: string): void {
  downloadFile('未恢复的抽奖进度.json', backup, 'application/json');
}

// CSV 单元格转义：
// 1) = + - @ 开头会被 Excel/WPS 当公式执行（CSV 注入 CWE-1236），前置单引号中和；
// 2) 含逗号/引号/换行时按 RFC 4180 用双引号包裹、内部引号翻倍，避免撑破列。
export function escapeCsvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

// 中奖名单 CSV 文本（纯函数，便于测试）；带 BOM，Excel 打开中文不乱码
export function buildWinnersCsv(prizeList: Prize[]): string {
  const rows: string[] = ['奖项,姓名'];
  prizeList.forEach(prize => {
    prize.cardListWin.forEach(card => {
      rows.push(`${escapeCsvCell(prize.name)},${escapeCsvCell(card.name)}`);
    });
  });
  return '﻿' + rows.join('\n');
}

export function exportWinnersCsv(prizeList: Prize[]): void {
  downloadFile('中奖名单.csv', buildWinnersCsv(prizeList), 'text/csv;charset=utf-8');
}
