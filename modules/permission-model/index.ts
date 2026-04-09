/**
 * 海鲜帝国权限系统 v1.0
 * 基于 Claude Code 逆向工程源码的权限架构
 * 
 * 支持:
 * - 精确权限规则 (精确命令名)
 * - 前缀匹配 (如 "Bash(git ")
 * - 通配符模式 (如 "Bash(rm *)")
 * - 来源追踪 (谁创建的规则)
 */

import { matchPermissionPattern, type PermissionBehavior, type PermissionResult } from '../tool-system/index.ts'

// ============================================================
// 权限来源
// ============================================================

export type PermissionSource = 
  | { type: 'system' }           // 系统内置
  | { type: 'user' }             // 用户配置
  | { type: 'agent'; agentId: string }  // Agent设置
  | { type: 'hook'; name: string }     // Hook规则

// ============================================================
// 权限规则
// ============================================================

export interface PermissionRule {
  pattern: string              // 匹配模式
  behavior: PermissionBehavior
  source: PermissionSource
  description?: string         // 规则说明
  createdAt?: number            // 创建时间戳
}

// ============================================================
// 权限上下文
// ============================================================

export interface PermissionContext {
  mode: PermissionMode
  agentId?: string
  alwaysAllowRules: PermissionRule[]
  alwaysDenyRules: PermissionRule[]
  alwaysAskRules: PermissionRule[]
  toolPermissionContext?: Record<string, unknown>
}

export type PermissionMode = 
  | 'default'        // 默认：询问
  | 'bypass'         // 绕过：所有允许（危险）
  | 'strict'         // 严格：所有拒绝
  | 'auto-approve'   // 自动批准所有
  | 'auto-deny'      // 自动拒绝所有

// ============================================================
// 权限管理器
// ============================================================

export class PermissionManager {
  private rules: PermissionRule[] = []
  private mode: PermissionMode = 'default'
  private agentId?: string
  
  // 缓存已决策的工具调用（避免重复询问）
  private decisionCache: Map<string, {
    decision: 'accept' | 'reject'
    timestamp: number
    input: unknown
  }> = new Map()

  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5分钟缓存

  constructor(mode: PermissionMode = 'default', agentId?: string) {
    this.mode = mode
    this.agentId = agentId
  }

  // 设置模式
  setMode(mode: PermissionMode): void {
    this.mode = mode
  }

  getMode(): PermissionMode {
    return this.mode
  }

  // 添加规则
  addRule(rule: PermissionRule): void {
    this.rules.push(rule)
  }

  // 批量添加规则
  addRules(rules: PermissionRule[]): void {
    this.rules.push(...rules)
  }

  // 清除规则
  clearRules(): void {
    this.rules = []
  }

  // 预设系统规则
  loadDefaultRules(): void {
    // 危险命令默认拒绝
    const dangerousPatterns = [
      'Bash(sudo *)',
      'Bash(rm -rf *)',
      'Bash(mkfs *)',
      'Bash(dd *)',
      'Bash(ssh *)',
      'Bash(nc *)',
      'Bash(netcat *)',
      'Write(/etc/*)',
      'Write(/usr/*)',
      'Write(/bin/*)',
      'Write(/sbin/*)',
    ]

    dangerousPatterns.forEach(pattern => {
      this.addRule({
        pattern,
        behavior: 'deny',
        source: { type: 'system' },
        description: 'System: Block dangerous commands',
      })
    })

    // 常见只读命令默认允许
    const safePatterns = [
      'Bash(ls *)',
      'Bash(pwd)',
      'Bash(date)',
      'Bash(whoami)',
      'Bash(cat *| grep *)',
      'Bash(find *| head *)',
    ]

    safePatterns.forEach(pattern => {
      this.addRule({
        pattern,
        behavior: 'allow',
        source: { type: 'system' },
        description: 'System: Allow safe read-only commands',
      })
    })
  }

  // 核心检查函数
  async checkPermission(
    toolName: string,
    input: unknown,
    customCheck?: (input: unknown) => Promise<PermissionResult>
  ): Promise<PermissionResult> {
    // 模式优先检查
    switch (this.mode) {
      case 'bypass':
      case 'auto-approve':
        return { behavior: 'allow' }

      case 'strict':
      case 'auto-deny':
        return { 
          behavior: 'deny', 
          message: `Permission mode is '${this.mode}'` 
        }
    }

    // 构建检查用的标识字符串
    const inputStr = typeof input === 'object' 
      ? JSON.stringify(input).slice(0, 200) 
      : String(input)
    const checkKey = `${toolName}:${inputStr}`

    // 检查缓存
    const cached = this.decisionCache.get(checkKey)
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return {
        behavior: cached.decision === 'accept' ? 'allow' : 'deny',
        updatedInput: cached.input as Record<string, unknown>,
      }
    }

    // 1. 检查 alwaysDeny 规则
    for (const rule of this.rules.filter(r => r.behavior === 'deny')) {
      const pattern = `${toolName}(${inputStr})`
      if (matchPermissionPattern(rule.pattern, pattern)) {
        return {
          behavior: 'deny',
          message: `Denied by rule: ${rule.description ?? rule.pattern}`,
        }
      }
    }

    // 2. 检查 alwaysAllow 规则
    for (const rule of this.rules.filter(r => r.behavior === 'allow')) {
      const pattern = `${toolName}(${inputStr})`
      if (matchPermissionPattern(rule.pattern, pattern)) {
        return { behavior: 'allow' }
      }
    }

    // 3. 自定义检查（如工具特定的权限逻辑）
    if (customCheck) {
      const result = await customCheck(input)
      // 缓存决策
      this.decisionCache.set(checkKey, {
        decision: result.behavior === 'allow' ? 'accept' : 'reject',
        timestamp: Date.now(),
        input: result.updatedInput ?? input as object,
      })
      return result
    }

    // 4. 默认：询问
    return { behavior: 'ask' }
  }

  // 记录决策（用于缓存）
  recordDecision(
    toolName: string,
    input: unknown,
    decision: 'accept' | 'reject'
  ): void {
    const inputStr = typeof input === 'object'
      ? JSON.stringify(input).slice(0, 200)
      : String(input)
    const checkKey = `${toolName}:${inputStr}`
    
    this.decisionCache.set(checkKey, {
      decision,
      timestamp: Date.now(),
      input: input as object,
    })
  }

  // 清除缓存
  clearCache(): void {
    this.decisionCache.clear()
  }

  // 获取所有规则
  getRules(): PermissionRule[] {
    return [...this.rules]
  }

  // 导出规则（用于序列化/存储）
  exportRules(): object {
    return {
      mode: this.mode,
      rules: this.rules.map(r => ({
        pattern: r.pattern,
        behavior: r.behavior,
        source: r.source,
        description: r.description,
      })),
    }
  }
}

// ============================================================
// 便捷函数
// ============================================================

/**
 * 创建海鲜帝国 Agent 的权限管理器
 */
export function createAgentPermissionManager(
  agentId: string,
  mode: PermissionMode = 'default'
): PermissionManager {
  const manager = new PermissionManager(mode, agentId)
  manager.loadDefaultRules()
  return manager
}

/**
 * 常见权限规则预设
 */
export const PRESET_RULES = {
  // 只读 Agent（如数据分析）
  readonly: [
    { pattern: 'Bash(*)', behavior: 'deny' as PermissionBehavior },
    { pattern: 'Read(*)', behavior: 'allow' as PermissionBehavior },
    { pattern: 'Write(*)', behavior: 'deny' as PermissionBehavior },
    { pattern: 'Edit(*)', behavior: 'deny' as PermissionBehavior },
  ],
  
  // 内容创作 Agent
  contentCreator: [
    { pattern: 'Bash(git *)', behavior: 'allow' },
    { pattern: 'Bash(npm *)', behavior: 'allow' },
    { pattern: 'Bash(node *)', behavior: 'allow' },
    { pattern: 'Read(*)', behavior: 'allow' },
    { pattern: 'Write(*)', behavior: 'allow' },
    { pattern: 'Bash(sudo *)', behavior: 'deny' },
    { pattern: 'Bash(rm -rf *)', behavior: 'deny' },
  ],
  
  // 流量增长 Agent（需要网络访问）
  growth: [
    { pattern: 'Bash(curl *)', behavior: 'allow' },
    { pattern: 'Bash(wget *)', behavior: 'allow' },
    { pattern: 'Bash(npm *)', behavior: 'allow' },
    { pattern: 'Bash(git *)', behavior: 'allow' },
    { pattern: 'Read(*)', behavior: 'allow' },
    { pattern: 'Write(*)', behavior: 'allow' },
    { pattern: 'Bash(sudo *)', behavior: 'deny' },
    { pattern: 'Bash(rm -rf *)', behavior: 'deny' },
  ],
}

// ============================================================
// Hook 集成
// ============================================================

export interface PermissionHook {
  name: string
  /** 匹配模式，如 "Bash(git *)" */
  pattern: string
  /** 如果返回 true，整个规则匹配 */
  condition?: (input: unknown) => boolean | Promise<boolean>
  onMatch: 'allow' | 'deny' | 'ask'
}

/**
 * 创建带 Hook 的权限检查器
 */
export function createHookablePermissionManager(
  baseManager: PermissionManager,
  hooks: PermissionHook[]
): PermissionManager {
  const manager = new PermissionManager(baseManager.getMode())
  
  // 复制基础规则
  manager.addRules(baseManager.getRules())
  
  // 添加 Hook 规则
  hooks.forEach(hook => {
    manager.addRule({
      pattern: hook.pattern,
      behavior: hook.onMatch,
      source: { type: 'hook', name: hook.name },
      description: `Hook: ${hook.name}`,
    })
  })
  
  return manager
}

export default {
  PermissionManager,
  createAgentPermissionManager,
  PRESET_RULES,
  createHookablePermissionManager,
}
