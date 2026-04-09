/**
 * 海鲜帝国工具系统 v1.0
 * 基于 Claude Code 逆向工程源码的架构设计
 * 
 * 核心设计理念:
 * - buildTool() 工厂函数统一工具定义
 * - Zod schema 类型安全
 * - 权限检查标准化
 * - 工具结果渲染组件化
 */

import { z } from 'zod';

// ============================================================
// 工具接口定义
// ============================================================

export interface ToolResult<T = unknown> {
  data: T
  /** 追加到对话的新消息 */
  newMessages?: unknown[]
  /** 工具特定的错误信息 */
  error?: string
}

export interface ToolOptions {
  debug?: boolean
  verbose?: boolean
  [key: string]: unknown
}

export interface ToolContext {
  messages: unknown[]
  agentId?: string
  agentType?: string
  workingDirectory?: string
  abortController?: AbortController
  [key: string]: unknown
}

export type CanUseToolFn = (toolName: string) => Promise<boolean>

export type ToolProgressFn<P = unknown> = (progress: { toolUseID: string; data: P }) => void

// 权限行为
export type PermissionBehavior = 'allow' | 'deny' | 'ask'

export interface PermissionResult {
  behavior: PermissionBehavior
  updatedInput?: Record<string, unknown>
  message?: string
}

// 工具定义核心接口
export interface ToolDef<
  Input extends z.ZodType = z.ZodType,
  Output = unknown,
  Progress = unknown,
> {
  /** 工具唯一名称 */
  name: string
  /** 别名 */
  aliases?: string[]
  /** 简短的能力描述（用于工具搜索） */
  searchHint?: string
  /** Zod 输入 schema */
  inputSchema: Input
  /** Zod 输出 schema */
  outputSchema?: z.ZodType<Output>
  /** 工具描述（可动态生成） */
  description?(input: unknown, options: ToolOptions): string | Promise<string>
  /** 工具执行核心 */
  call(
    args: z.infer<Input>,
    context: ToolContext,
    canUseTool: CanUseToolFn,
    parentMessage?: unknown,
    onProgress?: ToolProgressFn<Progress>
  ): Promise<ToolResult<Output>>
  /** 是否可并行（默认 false） */
  isConcurrencySafe?(input: z.infer<Input>): boolean
  /** 是否只读（默认 false） */
  isReadOnly?(input: z.infer<Input>): boolean
  /** 是否破坏性操作（默认 false） */
  isDestructive?(input: z.infer<Input>): boolean
  /** 是否启用 */
  isEnabled?(): boolean
  /** 工具运行中用户发新消息时的行为 */
  interruptBehavior?(): 'cancel' | 'block'
  /** 权限检查 */
  checkPermissions?(input: z.infer<Input>, context: ToolContext): Promise<PermissionResult>
  /** 输入校验 */
  validateInput?(input: z.infer<Input>, context: ToolContext): Promise<{ result: true } | { result: false; message: string; errorCode?: number }>
  /** 用户可见名称 */
  userFacingName?(input: Partial<z.infer<Input>>): string
  /** 结果渲染组件（React） */
  renderToolResultMessage?(content: Output, options: unknown): unknown
  /** 工具调用消息渲染 */
  renderToolUseMessage?(input: Partial<z.infer<Input>>, options: unknown): unknown
  /** 最大结果字符数（默认 10_000） */
  maxResultSizeChars?: number
}

// 工具默认值
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: async (input: Record<string, unknown>) => ({ behavior: 'allow' as PermissionBehavior, updatedInput: input }),
  userFacingName: (input: unknown) => (input as { name?: string })?.name ?? '',
  maxResultSizeChars: 10_000,
}

// 构建完整工具
export function buildTool<D extends ToolDef>(def: D): D & typeof TOOL_DEFAULTS {
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as D & typeof TOOL_DEFAULTS
}

// ============================================================
// 工具注册表
// ============================================================

export class ToolRegistry {
  private tools: Map<string, ToolDef> = new Map()
  private aliases: Map<string, string> = new Map() // alias -> name

  register(tool: ToolDef): void {
    this.tools.set(tool.name, tool)
    tool.aliases?.forEach(alias => {
      this.aliases.set(alias, tool.name)
    })
  }

  get(name: string): ToolDef | undefined {
    const canonical = this.aliases.get(name) ?? name
    return this.tools.get(canonical)
  }

  getAll(): ToolDef[] {
    return Array.from(this.tools.values())
  }

  getEnabled(): ToolDef[] {
    return this.getAll().filter(t => t.isEnabled?.() ?? true)
  }

  find(predicate: (tool: ToolDef) => boolean): ToolDef | undefined {
    return this.getAll().find(predicate)
  }

  filter(predicate: (tool: ToolDef) => boolean): ToolDef[] {
    return this.getAll().filter(predicate)
  }
}

// 全局工具注册表
export const globalToolRegistry = new ToolRegistry()

// ============================================================
// 通用工具注册函数
// ============================================================

export function registerTools(tools: ToolDef[]): void {
  tools.forEach(tool => globalToolRegistry.register(tool))
}

// ============================================================
// 常用 Schema 辅助
// ============================================================

export const stringSchema = z.string()
export const numberSchema = z.number()
export const booleanSchema = z.boolean()
export const objectSchema = z.object
export const arraySchema = z.array
export const optionalSchema = z.optional
export const unionSchema = z.union

// 常用工具输入 schema 模板
export const CommandSchema = z.object({
  command: z.string().describe('要执行的命令'),
  timeout: z.number().optional().describe('超时时间（毫秒）'),
  description: z.string().optional().describe('命令描述'),
})

export const FilePathSchema = z.object({
  path: z.string().describe('文件路径'),
})

export const FileContentSchema = z.object({
  path: z.string().describe('文件路径'),
  content: z.string().describe('文件内容'),
})

// ============================================================
// 工具权限规则
// ============================================================

export type PermissionRule = {
  pattern: string      // 如 "Bash(git *)", "Write(/tmp/*)"
  behavior: PermissionBehavior
}

export type PermissionRulesBySource = Record<string, PermissionRule[]>

/**
 * 权限规则匹配器
 * 支持精确匹配、前缀匹配、通配符匹配
 */
export function matchPermissionPattern(pattern: string, input: string): boolean {
  // 精确匹配
  if (pattern === input) return true
  
  // 前缀匹配 (如 "Bash(git " → "Bash(git commit")
  const prefixMatch = pattern.match(/^(.+)\s*$/)
  if (prefixMatch && input.startsWith(prefixMatch[1])) return true
  
  // 通配符匹配 (如 "Bash(git *)")
  const wildcardMatch = pattern.match(/^(.+)\(\*?\*(.*)\*\)$/)
  if (wildcardMatch) {
    const [, toolPrefix, suffix] = wildcardMatch
    const regex = new RegExp(`^\\Q${toolPrefix}\\E.*\\Q${suffix}\\E$`.replace(/\*/g, '.*'))
    return regex.test(input)
  }
  
  return false
}

// ============================================================
// 进度回调系统
// ============================================================

export function createProgressTracker<T>(
  onProgress?: (data: T) => void,
  toolUseID?: string
): ToolProgressFn<T> {
  return (progress) => {
    if (onProgress) {
      onProgress(progress.data)
    }
  }
}

// ============================================================
// 工具执行引擎
// ============================================================

export interface ToolExecutionOptions {
  permissionRules?: PermissionRule[]
  alwaysAllowPatterns?: string[]
  alwaysDenyPatterns?: string[]
  canUseTool?: CanUseToolFn
}

export async function executeTool<
  Input extends z.ZodType,
  Output,
>(
  tool: ToolDef<Input, Output>,
  rawInput: unknown,
  context: ToolContext,
  options: ToolExecutionOptions = {}
): Promise<ToolResult<Output>> {
  const { permissionRules = [], canUseTool } = options

  // 1. 输入校验
  if (tool.validateInput) {
    const validation = await tool.validateInput(rawInput as z.infer<Input>, context)
    if (!validation.result) {
      return {
        data: null as unknown as Output,
        error: validation.message,
      }
    }
  }

  // 2. 权限检查
  if (tool.checkPermissions) {
    const result = await tool.checkPermissions(rawInput as z.infer<Input>, context)
    if (result.behavior === 'deny') {
      return {
        data: null as unknown as Output,
        error: result.message ?? 'Permission denied',
      }
    }
  }

  // 3. canUseTool 检查
  if (canUseTool) {
    const allowed = await canUseTool(tool.name)
    if (!allowed) {
      return {
        data: null as unknown as Output,
        error: `Tool ${tool.name} is not available`,
      }
    }
  }

  // 4. 执行工具
  try {
    const result = await tool.call(
      rawInput as z.infer<Input>,
      context,
      canUseTool ?? (async () => true),
    )
    return result
  } catch (error) {
    return {
      data: null as unknown as Output,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ============================================================
// 预定义常用工具模板
// ============================================================

/**
 * 创建 Bash 类型工具的工厂函数
 */
export function createBashLikeTool(config: {
  name: string
  aliases?: string[]
  description?: string
  allowedCommands?: string[]
  deniedCommands?: string[]
  maxTimeout?: number
}) {
  return buildTool({
    name: config.name,
    aliases: config.aliases,
    inputSchema: CommandSchema,
    description: () => config.description ?? `执行 shell 命令`,
    
    async call(args, context) {
      const { command, timeout = config.maxTimeout ?? 30_000 } = args
      
      // 命令验证
      if (config.allowedCommands?.length) {
        const cmdBase = command.split(' ')[0]
        if (!config.allowedCommands.includes(cmdBase)) {
          return { data: null, error: `Command ${cmdBase} is not allowed` }
        }
      }
      
      if (config.deniedCommands?.length) {
        const cmdBase = command.split(' ')[0]
        if (config.deniedCommands.includes(cmdBase)) {
          return { data: null, error: `Command ${cmdBase} is denied` }
        }
      }

      // 实际执行（通过 fetch 到 OpenClaw gateway）
      // 这里只是定义接口，实际执行由 OpenClaw exec tool 负责
      return {
        data: {
          stdout: '',
          stderr: '',
          returnCode: 0,
          command,
          executedBy: config.name,
        } as unknown as Output,
      }
    },

    isReadOnly: (input) => {
      const cmd = (input as { command?: string })?.command ?? ''
      const readOnlyCommands = ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'stat', 'wc']
      const cmdBase = cmd.split(' ')[0]
      return readOnlyCommands.includes(cmdBase)
    },

    isConcurrencySafe: () => false,
    maxResultSizeChars: 30_000,
  })
}

/**
 * 创建文件操作类型工具
 */
export function createFileTool(config: {
  name: string
  operation: 'read' | 'write' | 'edit'
  allowedExtensions?: string[]
}) {
  return buildTool({
    name: config.name,
    inputSchema: config.operation === 'write'
      ? FileContentSchema
      : FilePathSchema,
    
    async call(args, context) {
      // 文件操作通过 OpenClaw read/write/edit tool 执行
      return { data: args }
    },

    isReadOnly: () => config.operation === 'read',
    isDestructive: () => config.operation === 'write' || config.operation === 'edit',
  })
}

// ============================================================
// 导出
// ============================================================

export default {
  buildTool,
  registerTools,
  ToolRegistry,
  globalToolRegistry,
  executeTool,
  matchPermissionPattern,
  createProgressTracker,
  createBashLikeTool,
  createFileTool,
  // schemas
  CommandSchema,
  FilePathSchema,
  FileContentSchema,
}
