// 为没有头像的用户生成"首字 + 按名字哈希配色"的 SVG 头像（data URI）
// 配色取与卡片墙青色系协调的色板

const COLORS = [
  '#007f7f', '#1e7f5c', '#2c6e91', '#5c5c8a', '#7f5c7f',
  '#8a6d3b', '#5c8a5c', '#3b7f8a', '#7f3b5c', '#4f6d7a',
  '#6b5b95', '#3b8a6d',
];

function hashCode(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function generateAvatar(name: string): string {
  const char = name.trim().charAt(0) || '?';
  const color = COLORS[hashCode(name) % COLORS.length];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" fill="${color}"/>` +
    `<text x="50" y="54" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="PingFang SC, Microsoft YaHei, sans-serif" font-size="52" fill="rgba(255,255,255,0.92)">${char}</text>` +
    `</svg>`;
  // btoa 不支持非 ASCII，用 utf8 + encodeURIComponent 形式
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
