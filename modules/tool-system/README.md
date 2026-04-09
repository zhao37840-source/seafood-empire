# Claude Code 架构深度分析

> 来源：逆向工程 Claude Code CLI (`/Users/zhaoshuting/Downloads/claude-code-main/`)
> 分析日期：2026-04-09

---

## 一、核心架构总览

```
┌─────────────────────────────────────────────────────┐
│                    src/entrypoints/cli.tsx           │
│              (入口：全局polyfill + 引导)              │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│                    src/main.tsx                      │
│     Commander.js CLI定义 → 解析参数 → 初始化REPL    │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│                  src/QueryEngine.ts                 │
│   对话编排器：消息循环、compaction、attribution       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│                    src/query.ts                      │
│   API核心：发送请求、处理流式响应、工具调用循环       │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│  src/tools.ts (注册表) → src/tools/<ToolName>/     │
│       ~40个工具，每个独立目录                       │
└──────────────────────────────────────────────────────┘
```

---

## 二、工具系统设计（Tool.ts）

### 核心接口

```typescript
// 工具定义 = buildTool({ ... }) 工厂函数产出
const tool = buildTool({
  name: 'Bash',
  inputSchema: z.object({ command: z.string() }),
  aliases: ['bash', 'shell'],
  description: async (input, options) => "执行shell命令",
  
  async call(args, context, canUseTool, parentMessage, onProgress) {
    // 核心执行逻辑
    return { data: result }
  },
  
  isConcurrencySafe: (input) => false,
  isReadOnly: (input) => false,
  isDestructive: (input) => false,
  
  checkPermissions: async (input, context) => {
    return { behavior: 'allow', updatedInput: input }
  },
  
  renderToolResultMessage: (content, progress, options) => {
    return <BashOutput content={content} />
  },
  
  userFacingName: (input) => 'Bash'
})
```

### 工具六大核心能力

| 方法 | 作用 |
|------|------|
| `call()` | 执行逻辑，返回 `ToolResult<T>` |
| `description()` | 动态生成工具描述（根据输入条件变化） |
| `inputSchema` | Zod schema，类型安全 |
| `checkPermissions()` | 权限检查，返回 allow/deny/ask |
| `renderToolResultMessage()` | React组件渲染结果 |
| `renderToolUseMessage()` | 显示工具调用输入 |
| `isConcurrencySafe()` | 是否可并行 |
| `isDestructive()` | 是否有破坏性 |
| `interruptBehavior()` | 工具运行中用户发新消息时的行为 |
| `validateInput()` | 输入校验 |

### 工具权限模式

```typescript
// 权限结果类型
type PermissionResult = 
  | { behavior: 'allow', updatedInput?: Record<string, unknown> }
  | { behavior: 'deny', message: string }
  | { behavior: 'ask' }

// 权限规则（支持通配符）
{ "Bash(git *)": "allow", "Bash(rm *)": "deny" }
```

### ToolUseContext（工具执行上下文）

```typescript
context = {
  messages,           // 完整对话历史
  abortController,    // 可取消API请求
  getAppState,       // 获取应用状态
  setAppState,       // 修改状态
  readFileState,     // 文件状态缓存
  toolUseId,         // 当前工具调用ID
  onProgress,        // 进度回调
  ...权限相关...
}
```

---

## 三、状态管理系统（Zustand）

### Store模式

```typescript
// src/state/store.ts
export const useStore = createStore((set, get) => ({
  // State
  messages: [],
  tools: [],
  permissions: {},
  
  // Actions
  addMessage: (msg) => set(s => ({ messages: [...s.messages, msg] })),
  updateTool: (id, updates) => set(s => ({
    tools: s.tools.map(t => t.id === id ? { ...t, ...updates } : t)
  })),
  
  // Computed
  getToolByName: (name) => get().tools.find(t => t.name === name)
}))
```

### AppState（全局状态）

```typescript
// src/state/AppState.tsx
type AppState = {
  // 消息
  messages: Message[]
  
  // 工具
  tools: Tools
  permissionResults: Map<string, PermissionResult>
  
  // Agent
  activeAgentId?: AgentId
  agentType?: string
  
  // UI
  theme: ThemeName
  isLoading: boolean
  
  // MCP
  mcpClients: MCPServerConnection[]
  mcpResources: Record<string, ServerResource[]>
}
```

---

## 四、QueryEngine（核心循环）

```typescript
// src/QueryEngine.ts 的核心循环
class QueryEngine {
  async run(userMessage: UserMessage): Promise<void> {
    // 1. 构建消息上下文
    const ctx = await buildContext(userMessage)
    
    // 2. 调用API（流式）
    const stream = await queryAPI(ctx)
    
    // 3. 处理流式响应
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        // 开始显示内容块
      }
      if (event.type === 'tool_use') {
        // 执行工具
        const result = await tool.call(args, context, canUseTool, parentMsg)
        // 把结果注入消息
      }
      if (event.type === 'message_delta') {
        // 处理停止原因
      }
    }
    
    // 4.  compaction（如消息太长）
    if (shouldCompact(messages)) {
      await compact()
    }
  }
}
```

---

## 五、REPL交互界面

```typescript
// src/screens/REPL.tsx
// React + Ink 组件，在终端渲染交互UI
// - 消息列表（PromptInput / MessageRow / Messages）
// - 工具权限弹窗（permissions/）
// - 快捷键处理

// 权限弹窗流程
1. 用户执行工具 → checkPermissions() → 'ask'
2. 弹出PermissionDialog组件
3. 用户选择 Allow/Deny/Allow All
4. 结果存入permissionResults Map
```

---

## 六、可提取到海鲜帝国的模式

### 1. 工具定义模式（Tool.ts）

可以直接复用 `buildTool()` 模式来标准化海鲜帝国Agent的工具定义。

### 2. 权限系统

```typescript
// 权限规则匹配
type PermissionRule = {
  pattern: string,    // "Bash(git *)"
  behavior: 'allow' | 'deny' | 'ask'
}

// 检查流程
canUseTool(tool, input, context) → {
  // 1. 检查 alwaysAllowRules
  // 2. 检查 alwaysDenyRules  
  // 3. 调用 tool.checkPermissions()
  // 4. 返回结果
}
```

### 3. 工具注册表

```typescript
// src/tools.ts 的注册模式
export function getTools(config: Config): Tools {
  return [
    BashTool,
    GrepTool,
    GlobTool,
    ReadTool,
    WriteTool,
    EditTool,
    AgentTool,
    ...(feature('MCP') ? MCPTools : []),
  ].filter(t => t.isEnabled?.() ?? true)
}
```

### 4. 进度回调系统

工具执行时通过 `onProgress` 回调实时更新UI（流式输出、进度条）

---

## 七、已知限制（反编译导致）

- ~1341 个 TypeScript 错误（类型系统不完整）
- `feature()` 函数始终返回 `false`（所有功能开关关闭）
- React Compiler 的 `_c()` memoization 调用是反编译垃圾
- 部分模块被删除（Voice Mode、Plugins、Marketplace）

---

## 八、对海鲜帝国的价值

这些模式可以让海鲜帝国的Agent系统获得：

1. **标准化工具定义** — 每个agent的工具都有统一接口
2. **精细权限控制** — 可以按命令级别控制危险操作
3. **流式输出** — 工具执行过程实时可见
4. **Compaction** — 超长对话自动压缩
5. **多Agent协作** — AgentTool支持派生子Agent
