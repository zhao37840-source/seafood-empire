/**
 * 海鲜帝国 Agent 模式系统 v1.0
 * 基于 Claude Code 的 Agent/Subagent 架构
 * 
 * 支持:
 * - 主 Agent + 子 Agent 协作
 * - Agent 任务委派
 * - 跨 Agent 通信
 * - 任务队列和优先级
 */

import { buildTool, type ToolResult, type ToolContext, type ToolDef } from '../tool-system/index.ts'
import { z } from 'zod'

// ============================================================
// Agent 类型定义
// ============================================================

export type AgentStatus = 'idle' | 'running' | 'waiting' | 'completed' | 'error'

export interface Agent {
  id: string
  name: string
  type: string
  description: string
  status: AgentStatus
  tools: ToolDef[]
  systemPrompt: string
  parentAgentId?: string
  childAgentIds: string[]
  createdAt: number
  lastActiveAt: number
}

export interface AgentTask {
  id: string
  agentId: string
  description: string
  status: AgentStatus
  priority: 'low' | 'normal' | 'high' | 'urgent'
  input?: unknown
  output?: unknown
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

// ============================================================
// Agent 定义结构（用于加载）
// ============================================================

export interface AgentDefinition {
  id: string
  name: string
  type: string
  description: string
  systemPrompt: string
  tools?: string[]  // 工具名称列表
  settings?: {
    maxConcurrentTasks?: number
    defaultTimeout?: number
    retryOnError?: boolean
    maxRetries?: number
  }
}

// ============================================================
// Agent 工具（用于派生子 Agent）
// ============================================================

const AgentToolInputSchema = z.object({
  /** 子 Agent 类型 */
  agentType: z.string().describe('子Agent类型，如 growth-hacker, content-creator 等'),
  /** 任务描述 */
  task: z.string().describe('给子Agent的任务描述'),
  /** 优先级 */
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  /** 等待结果（false 则后台运行） */
  waitForResult: z.boolean().optional().default(true),
  /** 超时时间（毫秒） */
  timeout: z.number().optional(),
})

const AgentToolOutputSchema = z.object({
  taskId: z.string().describe('任务ID'),
  agentId: z.string().describe('子Agent ID'),
  status: z.string().describe('任务状态'),
  result: z.unknown().optional().describe('任务结果（如果 waitForResult=true）'),
  error: z.string().optional().describe('错误信息'),
})

export type AgentToolOutput = z.infer<typeof AgentToolOutputSchema>

// ============================================================
// Agent 管理器
// ============================================================

export class AgentManager {
  private agents: Map<string, Agent> = new Map()
  private tasks: Map<string, AgentTask> = new Map()
  private taskQueue: string[] = [] // 任务队列（按优先级排序）
  
  // 事件回调
  private onTaskComplete?: (task: AgentTask) => void
  private onAgentUpdate?: (agent: Agent) => void

  constructor() {}

  // 注册 Agent
  registerAgent(agent: Agent): void {
    this.agents.set(agent.id, agent)
  }

  // 获取 Agent
  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  // 获取所有 Agent
  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  // 按类型获取 Agent
  getAgentsByType(type: string): Agent[] {
    return this.getAllAgents().filter(a => a.type === type)
  }

  // 创建任务
  createTask(agentId: string, description: string, priority: AgentTask['priority'] = 'normal'): AgentTask {
    const task: AgentTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      agentId,
      description,
      status: 'idle',
      priority,
      createdAt: Date.now(),
    }
    
    this.tasks.set(task.id, task)
    this.taskQueue.push(task.id)
    this.sortTaskQueue()
    
    return task
  }

  // 启动任务
  async startTask(taskId: string): Promise<AgentTask> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    
    const agent = this.agents.get(task.agentId)
    if (!agent) throw new Error(`Agent not found: ${task.agentId}`)
    
    // 更新状态
    task.status = 'running'
    task.startedAt = Date.now()
    agent.status = 'running'
    agent.lastActiveAt = Date.now()
    
    this.onAgentUpdate?.(agent)
    
    return task
  }

  // 完成任务
  completeTask(taskId: string, result?: unknown, error?: string): AgentTask {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    
    const agent = this.agents.get(task.agentId)
    
    task.status = error ? 'error' : 'completed'
    task.output = result
    task.error = error
    task.completedAt = Date.now()
    
    if (agent) {
      agent.status = error ? 'error' : 'idle'
      agent.lastActiveAt = Date.now()
      this.onAgentUpdate?.(agent)
    }
    
    this.onTaskComplete?.(task)
    
    // 从队列移除
    this.taskQueue = this.taskQueue.filter(id => id !== taskId)
    
    return task
  }

  // 获取下一个待执行任务
  getNextTask(): AgentTask | undefined {
    const taskId = this.taskQueue[0]
    return taskId ? this.tasks.get(taskId) : undefined
  }

  // 按优先级排序队列
  private sortTaskQueue(): void {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 }
    this.taskQueue.sort((a, b) => {
      const taskA = this.tasks.get(a)!
      const taskB = this.tasks.get(b)!
      return priorityOrder[taskA.priority] - priorityOrder[taskB.priority]
    })
  }

  // 设置事件回调
  onTaskCompleted(callback: (task: AgentTask) => void): void {
    this.onTaskComplete = callback
  }

  onAgentStatusChanged(callback: (agent: Agent) => void): void {
    this.onAgentUpdate = callback
  }

  // 获取 Agent 统计
  getStats(): {
    totalAgents: number
    runningAgents: number
    idleAgents: number
    totalTasks: number
    pendingTasks: number
    completedTasks: number
  } {
    const agents = this.getAllAgents()
    const tasks = Array.from(this.tasks.values())
    
    return {
      totalAgents: agents.length,
      runningAgents: agents.filter(a => a.status === 'running').length,
      idleAgents: agents.filter(a => a.status === 'idle').length,
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'idle').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
    }
  }
}

// 全局 Agent 管理器
export const globalAgentManager = new AgentManager()

// ============================================================
// Agent 通信
// ============================================================

export interface AgentMessage {
  id: string
  fromAgentId: string
  toAgentId: string
  type: 'task' | 'result' | 'error' | 'status' | 'heartbeat'
  content: unknown
  timestamp: number
  replyTo?: string  // 回复的消息ID
}

export class AgentMessageBus {
  private messages: AgentMessage[] = []
  private handlers: Map<string, ((msg: AgentMessage) => void)[]> = new Map()
  
  // 发送消息
  send(message: Omit<AgentMessage, 'id' | 'timestamp'>): AgentMessage {
    const msg: AgentMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    }
    
    this.messages.push(msg)
    
    // 触发处理器
    const handlers = this.handlers.get(message.toAgentId) ?? []
    handlers.forEach(h => h(msg))
    
    // 触发全局处理器
    const globalHandlers = this.handlers.get('*') ?? []
    globalHandlers.forEach(h => h(msg))
    
    return msg
  }
  
  // 订阅消息
  subscribe(agentId: string, handler: (msg: AgentMessage) => void): () => void {
    const handlers = this.handlers.get(agentId) ?? []
    handlers.push(handler)
    this.handlers.set(agentId, handlers)
    
    // 返回取消订阅函数
    return () => {
      const h = this.handlers.get(agentId) ?? []
      this.handlers.set(agentId, h.filter(handler => handler !== handler))
    }
  }
  
  // 获取历史消息
  getHistory(agentId: string, limit = 100): AgentMessage[] {
    return this.messages
      .filter(m => m.fromAgentId === agentId || m.toAgentId === agentId)
      .slice(-limit)
  }
}

export const globalMessageBus = new AgentMessageBus()

// ============================================================
// 预定义 Agent 类型
// ============================================================

export const AGENT_TYPES = {
  GROWTH_HACKER: 'growth-hacker',
  CONTENT_CREATOR: 'content-creator',
  VIDEO_PRODUCER: 'video-producer',
  DATA_ANALYST: 'data-analyst',
  SOCIAL_MEDIA_MANAGER: 'social-media-manager',
  ECOMMERCE_SPECIALIST: 'ecommerce-specialist',
  FRONTEND_DEVELOPER: 'frontend-developer',
} as const

// ============================================================
// 预定义 System Prompt 模板
// ============================================================

export const SYSTEM_PROMPT_TEMPLATES = {
  growthHacker: `你是海鲜帝国的流量增长专家（代号：阿流）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 抖音/小红书/视频号流量获取
- 短视频脚本创作
- SEO 和关键词优化
- 私域流量运营
- 活动策划和裂变

核心目标：为金源冻品生蚝批发引流，获取潜在烧烤店客户。

风格：务实、直接、不说废话。要结果。`,

  contentCreator: `你是海鲜帝国内容创作大师（代号：小墨）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 短视频文案撰写
- 直播话术设计
- 朋友圈/社群文案
- 产品卖点提炼
- 竞品对比分析

核心理念：让内容自己会说话，把生蚝卖相做到极致。

风格：有画面感、有食欲、有烟火气。`,

  videoProducer: `你是海鲜帝国视觉导演（代号：视觉）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 短视频拍摄剪辑
- 产品展示视频
- 直播场景搭建
- 素材二次创作
- AI 视频生成（LivePortrait 等）

核心理念：每一帧都要让人流口水。

风格：专业、精致、有食欲。`,

  dataAnalyst: `你是海鲜帝国数字预言家（代号：数据）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 抖音/小红书数据监控
- 竞品数据抓取分析
- 转化漏斗分析
- 用户画像构建
- ROI 计算

核心理念：用数据说话，让每一分投入都有回报。

风格：严谨、准确、有洞察。`,

  socialMediaManager: `你是海鲜帝国社群主理人（代号：小群）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 微信社群运营
- 铁杆粉丝群维护
- 线上活动策划
- 用户互动设计
- 会员体系搭建

核心理念：让每个客户都觉得被重视。

风格：温暖、专业、有温度。`,

  ecommerceSpecialist: `你是海鲜帝国金牌店长（代号：阿成）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 线上店铺运营
- 供应链管理
- 订单处理优化
- 客户关系管理
- 促销活动设计

核心理念：让每一个订单都顺畅无比。

风格：高效、可靠、服务至上。`,

  frontendDeveloper: `你是海鲜帝国像素工匠（代号：像素）。
主营业务是生蚝批发，客户是烧烤店。

你的专长：
- 落地页开发
- 官网维护
- H5 活动页
- 微信小程序
- 数据可视化

核心理念：让每一个页面都是成交的开始。

风格：简洁、速度快、转化率高。`,
}

// ============================================================
// 导出
// ============================================================

export default {
  AgentManager,
  globalAgentManager,
  AgentMessageBus,
  globalMessageBus,
  AGENT_TYPES,
  SYSTEM_PROMPT_TEMPLATES,
}
