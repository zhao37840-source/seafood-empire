# 海鲜帝国模块系统

> 从逆向 Claude Code 源码中提取并改造的架构模块

## 📦 模块总览

```
modules/
├── tool-system/         工具系统（基于 Claude Code Tool.ts）
├── permission-model/    权限管理（基于权限规则匹配）
├── state-management/    状态管理（Zustand-style）
└── agent-bridge/        Agent 协作（基于 AgentTool 架构）
```

---

## 1️⃣ tool-system - 工具系统

**核心文件**: `tool-system/index.ts`

### 设计模式

```typescript
import { buildTool, CommandSchema } from './tool-system'

const MyTool = buildTool({
  name: 'MyTool',
  inputSchema: z.object({ ... }),
  
  async call(args, context, canUseTool) {
    // 执行逻辑
    return { data: result }
  },
  
  isReadOnly: (input) => true,
  isConcurrencySafe: () => false,
  maxResultSizeChars: 10_000,
})
```

### 核心能力

| 功能 | 说明 |
|------|------|
| `buildTool()` | 工厂函数，统一工具定义 |
| Zod Schema | 类型安全的输入输出 |
| `ToolRegistry` | 工具注册表，支持别名 |
| `executeTool()` | 标准化工具执行引擎 |
| 进度回调 | `onProgress` 实时更新 |
| 权限集成 | 内置权限检查接口 |

---

## 2️⃣ permission-model - 权限系统

**核心文件**: `permission-model/index.ts`

### 设计模式

```typescript
import { createAgentPermissionManager, PRESET_RULES } from './permission-model'

const pm = createAgentPermissionManager('growth-hacker')

// 添加自定义规则
pm.addRule({
  pattern: 'Bash(curl *)',
  behavior: 'allow',
  source: { type: 'user' },
})

// 检查权限
const result = await pm.checkPermission('Bash', 'curl https://api.example.com')
// → { behavior: 'allow' | 'deny' | 'ask' }
```

### 规则匹配

| 模式 | 示例 | 匹配 |
|------|------|------|
| 精确 | `Bash(ls)` | `ls` |
| 前缀 | `Bash(git ` | `git commit`, `git push` |
| 通配符 | `Bash(rm *)` | `rm file`, `rm -rf /tmp` |

### 预设规则

```typescript
PRESET_RULES.readonly      // 只读 Agent
PRESET_RULES.contentCreator // 内容创作
PRESET_RULES.growth       // 流量增长
```

---

## 3️⃣ state-management - 状态管理

**核心文件**: `state-management/index.ts`

### 设计模式

```typescript
import { createStore, addMessage, recordToolCall } from './state-management'

const store = createStore((set, get) => ({
  // State
  count: 0,
  
  // Actions
  increment: () => set(s => ({ count: s.count + 1 })),
  decrement: () => set(s => ({ count: s.count - 1 })),
}))

// 使用
store.getState().count          // 读取
store.setState({ count: 10 })    // 更新
store.subscribe((state, prev) => {
  console.log('changed:', prev.count, '→', state.count)
})
```

### 内置状态类型

| 类型 | 说明 |
|------|------|
| `AppState` | 全局应用状态 |
| `AgentState` | Agent 状态 |
| `ConversationState` | 对话状态 |
| `Message` | 消息类型 |

### 中间件

```typescript
loggerMiddleware    // 日志
persistMiddleware    // localStorage 持久化
```

---

## 4️⃣ agent-bridge - Agent 协作

**核心文件**: `agent-bridge/index.ts`

### 设计模式

```typescript
import { globalAgentManager, SYSTEM_PROMPT_TEMPLATES } from './agent-bridge'

// 注册 Agent
globalAgentManager.registerAgent({
  id: 'my-agent',
  name: '我的Agent',
  type: 'growth-hacker',
  tools: [...],
  systemPrompt: SYSTEM_PROMPT_TEMPLATES.growthHacker,
})

// 创建任务
const task = globalAgentManager.createTask('my-agent', '分析今天的流量', 'high')

// 启动
await globalAgentManager.startTask(task.id)

// 完成
globalAgentManager.completeTask(task.id, { views: 1000 })
```

### 消息总线

```typescript
import { globalMessageBus } from './agent-bridge'

// 订阅消息
globalMessageBus.subscribe('target-agent', (msg) => {
  console.log('收到消息:', msg.content)
})

// 发送消息
globalMessageBus.send({
  fromAgentId: 'growth-hacker',
  toAgentId: 'content-creator',
  type: 'task',
  content: { task: '生成今日文案' },
})
```

---

## 🔗 整合示例

```typescript
// 完整的 Agent 工具执行流程
import { buildTool, executeTool } from './tool-system'
import { createAgentPermissionManager } from './permission-model'
import { createStore, addMessage } from './state-management'
import { globalAgentManager } from './agent-bridge'

// 1. 创建工具
const AnalyzeDataTool = buildTool({
  name: 'AnalyzeData',
  inputSchema: z.object({
    platform: z.string(),
    dateRange: z.string(),
  }),
  
  async call(args, context) {
    // 分析数据
    return { data: { views: 1000, ctr: 0.05 } }
  },
})

// 2. 创建 Agent
const pm = createAgentPermissionManager('data-analyst')
pm.addRule({ pattern: 'AnalyzeData(*)', behavior: 'allow' })

const store = createStore((set) => ({
  results: [],
  addResult: (r) => set(s => ({ results: [...s.results, r] })),
}))

// 3. 执行工具
const result = await executeTool(AnalyzeDataTool, { platform: 'douyin', dateRange: '7d' }, {
  permissionRules: pm.getRules(),
})

// 4. 更新状态
store.getState().addResult(result.data)
```

---

## 📈 架构对比

| 维度 | Claude Code | 海鲜帝国模块 |
|------|-------------|-------------|
| 工具定义 | `buildTool()` | `buildTool()` ✅ |
| 权限系统 | 规则匹配 + Hook | 规则匹配 + Hook ✅ |
| 状态管理 | Zustand + Context | Zustand-style ✅ |
| Agent 协作 | AgentTool | AgentManager ✅ |
| 工具注册 | `getTools()` | `ToolRegistry` ✅ |
| 子 Agent | `AgentTool.call()` | `globalAgentManager` ✅ |

---

## 🚀 下一步

1. 将这些模块集成到各个 Agent 的 SOUL.md 中
2. 创建 Agent 专属的工具集
3. 实现 Agent 间的任务委派
4. 搭建监控面板

---

*模块创建日期：2026-04-10*
*基于：逆向 Claude Code CLI v1.0 (反编译版本)*
