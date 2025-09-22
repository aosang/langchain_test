import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { TavilySearch } from '@langchain/tavily'
import { ChatDeepSeek } from '@langchain/deepseek'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage } from '@langchain/core/messages'

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors()) // 允许跨域请求
app.use(express.json()) // 解析JSON请求体

// 初始化AI Agent
const agentModel = new ChatDeepSeek({
  model: 'deepseek-chat',
  temperature: 0,
  apiKey: process.env.DEEPSEEK_API_KEY,
  maxTokens: 1000,
  timeout: 30000,
})

const agentCheckpoint = new MemorySaver()

// 轻量级Agent（仅对话，无工具）
const chatAgent = createReactAgent({
  llm: agentModel,
  tools: [], // 无工具，响应更快
  checkpointSaver: agentCheckpoint,
})

// 搜索增强Agent（包含TavilySearch）
const searchAgent = createReactAgent({
  llm: agentModel,
  tools: [
    new TavilySearch({
      maxResults: 1,
      apiKey: process.env.TAVILY_API_KEY
    })
  ],
  checkpointSaver: agentCheckpoint,
})

// 关键词检测函数
function needsSearch(message) {
  const searchKeywords = [
    // 时间相关
    '时间', '今天', '明天', '昨天', '最新', '现在', '最近', '当前',
    // 信息查询
    '搜索', '查找', '查询', '什么是', '介绍', '资料', '信息',
    // 实时数据
    '价格', '股票', '汇率', '天气', '新闻', '数据',
    // 事实查证
    '发生了什么', '怎么回事', '原因', '结果',
    // 产品信息
    '产品', '品牌', '公司', '发布', '上市',
    // 学习查询
    '学习', '教程', '方法', '技巧', '如何',
    // 英文关键词
    'what', 'how', 'when', 'where', 'why', 'search', 'find', 'latest', 'news', 'price', 'weather'
  ]
  
  const chatKeywords = [
    // 日常问候
    '你好', '早上好', '下午好', '晚上好', '再见', '拜拜',
    // 礼貌用语
    '谢谢', '不客气', '抱歉', '对不起',
    // 情感表达
    '好的', '可以', '行', '不错', '很好', '算了',
    // 闲聊
    '聊天', '怎么样', '感觉', '觉得', '喜欢', '讨厌',
    // 简单问题
    '能干什么', '会什么', '能力', '功能'
  ]
  
  const messageText = message.toLowerCase()
  
  // 先检查是否是纯聊天（优先级高）
  if (chatKeywords.some(keyword => messageText.includes(keyword))) {
    return false
  }
  
  // 再检查是否需要搜索
  if (searchKeywords.some(keyword => messageText.includes(keyword))) {
    return true
  }
  
  // 默认情况：优先使用轻量级Agent保证响应速度
  return false
}

// 获取适合的Agent
function getAgent(message) {
  const needsSearchTool = needsSearch(message)
  console.log(`🤖 选择Agent: ${needsSearchTool ? '搜索增强模式' : '快速对话模式'}`)
  return needsSearchTool ? searchAgent : chatAgent
}

// API路由 - 普通响应
app.post('/api/chat', async (req, res) => {
  try {
    const { message, threadId = 'default' } = req.body

    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' })
    }


    // 获取AI响应
    const selectedAgent = getAgent(message)
    const agentStream = await selectedAgent.stream(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: threadId }, streamMode: 'messages' }
    )

    let finalResponse = ''

    for await (const messageArray of agentStream) {
      const msg = messageArray[0]
      
      if (msg && msg.content) {
        if (msg.constructor.name === 'AIMessage' && 
            (!msg.tool_calls || msg.tool_calls.length === 0)) {
          finalResponse = msg.content
        }
      }
    }

    res.json({
      success: true,
      data: {
        response: finalResponse,
        threadId: threadId,
        timestamp: new Date().toISOString()
      }
    })

  } catch (error) {
    res.status(500).json({
      success: false,
      error: '服务器内部错误',
      message: error.message
    })
  }
})

// API路由 - 流式响应 (Server-Sent Events)
app.post('/api/chat/stream', async (req, res) => {
  try {
    const { message, threadId = 'default' } = req.body

    if (!message) {
      return res.status(400).json({ error: '消息内容不能为空' })
    }

    console.log(`📝 收到流式请求: ${message}`)

    // 设置SSE响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    })

    // 发送开始事件
    res.write(`data: ${JSON.stringify({ type: 'start', message: '开始处理请求...' })}\n\n`)

    // 检查API密钥是否存在
    const hasValidDeepSeekKey = process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim() !== '' && !process.env.DEEPSEEK_API_KEY.includes('your_')
    const hasValidTavilyKey = process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim() !== '' && !process.env.TAVILY_API_KEY.includes('your_')
    
    if (!hasValidDeepSeekKey || !hasValidTavilyKey) {
      res.write(`data: ${JSON.stringify({ type: 'thinking', message: '检测到API密钥未配置，返回测试响应...' })}\n\n`)
      
      setTimeout(() => {
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: `您好！我收到了您的消息："${message}"。\n\n由于API密钥未配置，这是一个测试响应。请配置DEEPSEEK_API_KEY和TAVILY_API_KEY环境变量以启用完整功能。`,
          timestamp: new Date().toISOString()
        })}\n\n`)
        
        res.write(`data: ${JSON.stringify({ 
          type: 'end', 
          message: '响应完成',
          threadId: threadId 
        })}\n\n`)
        res.end()
      }, 1000)
      
      return
    }

    // 获取AI响应流
    try {
      const selectedAgent = getAgent(message)
      const agentStream = await selectedAgent.stream(
        { messages: [new HumanMessage(message)] },
        { configurable: { thread_id: threadId }, streamMode: 'messages' }
      )

      let hasStartedOutput = false
      let fullResponse = ''

      for await (const messageArray of agentStream) {
        const msg = messageArray[0]
        
        if (msg && msg.content) {
          if ((msg.constructor.name === 'AIMessage' || msg.constructor.name === 'AIMessageChunk') && 
              (!msg.tool_calls || msg.tool_calls.length === 0)) {
            
            if (!hasStartedOutput) {
              res.write(`data: ${JSON.stringify({ type: 'thinking', message: '思考完成，开始回答...' })}\n\n`)
              hasStartedOutput = true
            }
            
            fullResponse += msg.content
          }
        }
      }
      
      // 发送完整的响应内容
      if (fullResponse) {
        res.write(`data: ${JSON.stringify({ 
          type: 'content', 
          content: fullResponse,
          timestamp: new Date().toISOString()
        })}\n\n`)
      }
      
    } catch (agentError) {
      res.write(`data: ${JSON.stringify({ 
        type: 'content', 
        content: `处理请求时发生错误: ${agentError.message}`,
        timestamp: new Date().toISOString()
      })}\n\n`)
    }

    // 发送结束事件
    res.write(`data: ${JSON.stringify({ 
      type: 'end', 
      message: '响应完成',
      threadId: threadId 
    })}\n\n`)
    res.end()

  } catch (error) {
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      error: '服务器内部错误',
      message: error.message 
    })}\n\n`)
    res.end()
  }
})

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'AI Agent API服务运行正常',
    timestamp: new Date().toISOString(),
  })
})

// 获取对话历史（简单示例）
app.get('/api/chat/history/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params
    
    // 这里可以实现取对话历史的逻辑
    // 目前返回示例数据
    res.json({
      success: true,
      data: {
        threadId: threadId,
        message: '历史记录功能待实现'
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: '获取历史记录失败',
      message: error.message
    })
  }
})

// 启动服务器
app.listen(PORT, () => {
  console.log(`🚀 AI Agent API服务已启动`)
  console.log(`📡 服务地址: http://localhost:${PORT}`)
  console.log(`🔍 健康检查: http://localhost:${PORT}/api/health`)
  console.log(`💬 聊天接口: POST http://localhost:${PORT}/api/chat`)
  console.log(`📺 流式接口: POST http://localhost:${PORT}/api/chat/stream`)
})

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...')
  process.exit(0)
})
