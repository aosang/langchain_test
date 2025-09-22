# AI Agent API 服务

这是一个基于 LangChain 和 Express 的 AI 聊天 API 服务，支持普通响应和流式响应两种模式，专为前端 Vue3 项目设计。

## 📁 文件说明

- `agent.js` - 原始的 AI Agent 脚本（控制台版本）
- `api-server.js` - Express API 服务器
- `vue-example.vue` - Vue3 组件示例
- `demo.html` - 简单的 HTML 演示页面
- `package.json` - 项目依赖配置

## 🚀 快速开始

### 1. 安装依赖

```bash
cd langchain_test
npm install
```

### 2. 环境配置

创建 `.env` 文件，添加必要的 API 密钥：

```env
# DeepSeek API 密钥
DEEPSEEK_API_KEY=your_deepseek_api_key_here

# Tavily 搜索 API 密钥
TAVILY_API_KEY=your_tavily_api_key_here

# 可选：自定义端口
PORT=3001
```

### 3. 启动 API 服务

```bash
npm start
```

或

```bash
node api-server.js
```

服务启动后，你会看到：
```
🚀 AI Agent API服务已启动
📡 服务地址: http://localhost:3001
🔍 健康检查: http://localhost:3001/api/health
💬 聊天接口: POST http://localhost:3001/api/chat
📺 流式接口: POST http://localhost:3001/api/chat/stream
```

### 4. 测试 API

#### 方法一：使用 HTML 演示页面
直接在浏览器中打开 `demo.html` 文件即可测试。

#### 方法二：使用 curl 测试
```bash
# 普通聊天接口
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请介绍一下自己"}'

# 健康检查
curl http://localhost:3001/api/health
```

## 📡 API 接口文档

### 1. 健康检查
```
GET /api/health
```

**响应示例：**
```json
{
  "success": true,
  "message": "AI Agent API服务运行正常",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. 普通聊天接口
```
POST /api/chat
```

**请求参数：**
```json
{
  "message": "用户消息内容",
  "threadId": "可选的会话ID，默认为default"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": {
    "response": "AI助手的回复内容",
    "threadId": "会话ID",
    "timestamp": "2024-01-01T12:00:00.000Z"
  }
}
```

### 3. 流式聊天接口
```
POST /api/chat/stream
```

**请求参数：** 同普通聊天接口

**响应格式：** Server-Sent Events (SSE)

**事件类型：**
- `start`: 开始处理请求
- `thinking`: AI 正在思考
- `content`: 返回内容片段
- `end`: 响应结束
- `error`: 错误信息

**SSE 数据示例：**
```
data: {"type":"start","message":"开始处理请求..."}

data: {"type":"thinking","message":"思考完成，开始回答..."}

data: {"type":"content","content":"这是回复的一部分","timestamp":"2024-01-01T12:00:00.000Z"}

data: {"type":"end","message":"响应完成","threadId":"default"}
```

## 🎨 前端集成示例

### Vue3 + Axios 示例

参考 `vue-example.vue` 文件，主要功能：

```javascript
import axios from 'axios'

// 普通请求
const sendMessage = async (message) => {
  const response = await axios.post('http://localhost:3001/api/chat', {
    message: message,
    threadId: 'your-thread-id'
  })
  
  console.log(response.data.data.response)
}

// 流式请求
const sendStreamMessage = async (message) => {
  const response = await fetch('http://localhost:3001/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, threadId: 'your-thread-id' })
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    // 处理 SSE 数据...
  }
}
```

### React 示例

```javascript
// 使用 fetch 进行流式请求
const sendStreamMessage = async (message) => {
  try {
    const response = await fetch('http://localhost:3001/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6))
          
          if (data.type === 'content') {
            // 更新 UI 显示内容
            setResponse(prev => prev + data.content)
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error)
  }
}
```

## 🔧 特性说明

### 1. 双响应模式
- **普通模式**：等待完整响应后一次性返回
- **流式模式**：实时返回 AI 生成的内容，用户体验更好

### 2. 会话管理
- 支持多会话并行，通过 `threadId` 区分
- 自动保存对话上下文和记忆

### 3. 错误处理
- 完善的错误捕获和用户友好的错误消息
- 自动重连和健康检查

### 4. CORS 支持
- 默认允许所有跨域请求
- 适合前端开发和测试

## 🛠️ 开发说明

### 自定义配置

在 `api-server.js` 中可以修改：

```javascript
// 修改端口
const PORT = process.env.PORT || 3001

// 修改AI模型参数
const agentModel = new ChatDeepSeek({
  model: 'deepseek-chat',
  temperature: 0,        // 创造性，0-1
  maxTokens: 1000,       // 最大token数
  timeout: 30000,        // 超时时间
})

// 修改搜索工具配置
const agentTools = [
  new TavilySearch({
    maxResults: 1,       // 搜索结果数量
    apiKey: process.env.TAVILY_API_KEY
  })
]
```

### 添加新的工具

```javascript
// 例如添加计算器工具
import { Calculator } from '@langchain/tools/calculator'

const agentTools = [
  new TavilySearch({ maxResults: 1, apiKey: process.env.TAVILY_API_KEY }),
  new Calculator(), // 新增计算器工具
]
```

## 🐛 常见问题

### 1. 连接错误
- 确保 API 服务已启动（端口 3001）
- 检查防火墙设置
- 验证 CORS 配置

### 2. API 密钥错误
- 确认 `.env` 文件中的密钥正确
- 检查 DeepSeek 和 Tavily 账户余额

### 3. 流式响应不工作
- 确保前端支持 Server-Sent Events
- 检查浏览器开发者工具中的网络请求

### 4. 响应过慢
- 调整 `timeout` 参数
- 减少 `maxTokens` 限制
- 检查网络连接

## 📜 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

如有问题，请查看控制台输出或创建 Issue。
