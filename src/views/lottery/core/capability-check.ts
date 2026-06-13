// 浏览器能力检测：核心抽奖在任何能跑 JS 的浏览器都可用，这里只检测“增强功能”
// 在当前环境是否受限（已各自降级，不会崩），启动时温和提示用户，不阻断抽奖。

export interface CapabilityEnv {
  secureContext: boolean // HTTPS / localhost：crypto.subtle、clipboard 需要
  broadcastChannel: boolean // 双屏遥控
  indexedDB: boolean // 奖品图片本地存储
}

export interface CapabilityIssue {
  feature: string
  detail: string
}

// 读取当前运行环境能力（隔离全局读取，便于 checkCapabilities 纯函数测试）
export function detectEnv(): CapabilityEnv {
  return {
    secureContext: globalThis.isSecureContext === true,
    broadcastChannel: typeof BroadcastChannel !== 'undefined',
    indexedDB: typeof globalThis.indexedDB !== 'undefined',
  }
}

// 纯函数：环境 → 受限功能清单（空 = 全部正常）
export function checkCapabilities(env: CapabilityEnv): CapabilityIssue[] {
  const issues: CapabilityIssue[] = []
  if (!env.secureContext) {
    issues.push({
      feature: '加密公平承诺 / 复制',
      detail: '当前非安全环境（需用 HTTPS 或 localhost 打开，而非 file:// 或内网 HTTP）：可验证公平的承诺已降级为非加密算法，剪贴板复制可能不可用',
    })
  }
  if (!env.broadcastChannel) {
    issues.push({
      feature: '双屏遥控',
      detail: '当前浏览器不支持，建议升级到 Chrome / Edge / Firefox，或 Safari 15.4+',
    })
  }
  if (!env.indexedDB) {
    issues.push({
      feature: '奖品图片',
      detail: '当前浏览器或隐私模式不支持本地图片存储，奖品图将无法保存',
    })
  }
  return issues
}
