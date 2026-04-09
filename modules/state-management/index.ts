/**
 * 海鲜帝国状态管理系统 v1.0
 * 基于 Claude Code 的 Zustand-style 状态管理模式
 * 
 * 设计参考:
 * - src/state/AppState.tsx
 * - src/state/store.ts
 * - 模块级单例模式
 */

// ============================================================
// 核心 Store 类型
// ============================================================

export type SetStateFn<T> = (partial: Partial<T> | ((prev: T) => Partial<T>)) => void
export type GetStateFn<T> = () => T
export type SubscribeFn<T> = (listener: (state: T, prev: T) => void) => () => void

export interface Store<T> {
  getState: GetStateFn<T>
  setState: SetStateFn<T>
  subscribe: SubscribeFn<T>
}

// ============================================================
// 简单 Store 实现（Zustand 风格）
// ============================================================

export function createStore<T extends object>(
  initializer: (set: SetStateFn<T>, get: GetStateFn<T>) => T
): Store<T> {
  type Listener = (state: T, prev: T) => void
  
  let state: T
  const listeners = new Set<Listener>()
  
  const getState: GetStateFn<T> = () => state
  
  const setState: SetStateFn<T> = (partial) => {
    const nextPartial = typeof partial === 'function' 
      ? (partial as (prev: T) => Partial<T>)(state)
      : partial
    
    const nextState = { ...state, ...nextPartial }
    
    if (nextState !== state) {
      const prev = state
      state = nextState as T
      listeners.forEach(listener => listener(state as T, prev))
    }
  }
  
  const subscribe: SubscribeFn<T> = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  
  // 初始化
  state = initializer(setState, getState)
  
  return { getState, setState, subscribe }
}

// ============================================================
// 工具调用记录
// ============================================================

export interface ToolCallRecord {
  id: string
  toolName: string
  input: unknown
  output?: unknown
  error?: string
  status: 'pending' | 'success' | 'error'
  startTime: number
  endTime?: number
  durationMs?: number
}

// ============================================================
// Agent 状态
// ============================================================

export interface AgentState {
  id: string
  name: string
  type: string
  status: 'idle' | 'running' | 'waiting' | 'error'
  currentTask?: string
  createdAt: number
  lastActiveAt: number
  toolCalls: ToolCallRecord[]
}

// ============================================================
// 消息类型
// ============================================================

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  toolCalls?: ToolCallRecord[]
  attachments?: string[]
  metadata?: Record<string, unknown>
}

// ============================================================
// 对话状态
// ============================================================

export interface ConversationState {
  id: string
  messages: Message[]
  context: {
    workingDirectory?: string
    files?: string[]
    environment?: Record<string, string>
  }
  toolPermissionResults: Map<string, 'allow' | 'deny' | 'ask'>
}

// ============================================================
// 主应用状态
// ============================================================

export interface AppState {
  // Agent 相关
  activeAgentId?: string
  agents: Map<string, AgentState>
  
  // 对话相关
  currentConversation?: ConversationState
  
  // UI 相关
  theme: 'light' | 'dark'
  isLoading: boolean
  notifications: Notification[]
  
  // MCP 相关（Model Context Protocol）
  mcpServers: Map<string, {
    name: string
    status: 'connected' | 'disconnected' | 'error'
    tools: string[]
  }>
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: number
  read?: boolean
}

// ============================================================
// 全局 Store 实例
// ============================================================

export const globalAppStore = createStore<AppState>((set, get) => ({
  // 默认状态
  agents: new Map(),
  theme: 'dark',
  isLoading: false,
  notifications: [],
  mcpServers: new Map(),
  
  // Actions 会通过 set() 调用添加
}))

// ============================================================
// Store Helper 函数
// ============================================================

/**
 * 添加消息到当前对话
 */
export function addMessage(store: Store<AppState>, message: Message): void {
  const state = store.getState()
  const conversation = state.currentConversation
  
  if (conversation) {
    store.setState({
      currentConversation: {
        ...conversation,
        messages: [...conversation.messages, message],
      },
    })
  }
}

/**
 * 记录工具调用
 */
export function recordToolCall(
  store: Store<AppState>,
  agentId: string,
  toolCall: ToolCallRecord
): void {
  const state = store.getState()
  const agent = state.agents.get(agentId)
  
  if (agent) {
    const updatedAgents = new Map(state.agents)
    updatedAgents.set(agentId, {
      ...agent,
      toolCalls: [...agent.toolCalls, toolCall],
      lastActiveAt: Date.now(),
    })
    
    store.setState({ agents: updatedAgents })
  }
}

/**
 * 发送通知
 */
export function sendNotification(
  store: Store<AppState>,
  notification: Omit<Notification, 'id' | 'timestamp'>
): void {
  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
  }
  
  store.setState(state => ({
    notifications: [...state.notifications, newNotification],
  }))
}

// ============================================================
// Computed / Selector 辅助
// ============================================================

export type Selector<T, R> = (state: T) => R

/**
 * 创建选择器函数（在组件中使用）
 */
export function createSelector<T, R>(
  store: Store<T>,
  selector: Selector<T, R>
): () => R {
  let currentValue = selector(store.getState())
  
  store.subscribe((state, prev) => {
    const newValue = selector(state)
    if (newValue !== currentValue) {
      currentValue = newValue
    }
  })
  
  return () => currentValue
}

// ============================================================
// 中间件支持
// ============================================================

export type Middleware<T> = (
  store: Store<T>
) => (next: SetStateFn<T>) => SetStateFn<T>

/**
 * 日志中间件
 */
export const loggerMiddleware: Middleware<AppState> = (store) => (next) => (partial) => {
  const prev = store.getState()
  const result = next(partial)
  const nextState = store.getState()
  
  console.log('[Store] State changed:', {
    changed: Object.keys(nextState).filter(k => 
      JSON.stringify(nextState[k as keyof AppState]) !== JSON.stringify(prev[k as keyof AppState])
    ),
    prev,
    next: nextState,
  })
  
  return result
}

/**
 * 持久化中间件（localStorage）
 */
export function persistMiddleware<T extends object>(
  key: string,
  whitelist?: (keyof T)[]
): Middleware<T> {
  return (store) => (next) => (partial) => {
    // 从 localStorage 恢复
    try {
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        const whitelistSet = whitelist ? new Set(whitelist) : null
        const filtered = whitelistSet
          ? Object.fromEntries(
              Object.entries(parsed).filter(([k]) => whitelistSet.has(k as keyof T))
            )
          : parsed
        store.setState(filtered as Partial<T>)
      }
    } catch (e) {
      console.warn(`[Store] Failed to restore state from ${key}:`, e)
    }
    
    const result = next(partial)
    
    // 持久化
    try {
      const state = store.getState()
      const whitelistSet = whitelist ? new Set(whitelist) : null
      const toSave = whitelistSet
        ? Object.fromEntries(
            Object.entries(state).filter(([k]) => whitelistSet.has(k as keyof T))
          )
        : state
      localStorage.setItem(key, JSON.stringify(toSave))
    } catch (e) {
      console.warn(`[Store] Failed to persist state to ${key}:`, e)
    }
    
    return result
  }
}

// ============================================================
// Agent 状态管理 Helper
// ============================================================

export function createAgentStore(agentId: string) {
  return createStore<AgentState>((set, get) => ({
    id: agentId,
    name: agentId,
    type: 'agent',
    status: 'idle',
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    toolCalls: [],
    
    // Agent 特定 actions
    setStatus: (status) => set({ status }),
    setTask: (task) => set({ currentTask: task }),
    addToolCall: (toolCall) => set(s => ({
      toolCalls: [...s.toolCalls, toolCall],
      lastActiveAt: Date.now(),
    })),
  }))
}

// ============================================================
// 导出
// ============================================================

export default {
  createStore,
  createAgentStore,
  globalAppStore,
  addMessage,
  recordToolCall,
  sendNotification,
  createSelector,
  loggerMiddleware,
  persistMiddleware,
}
