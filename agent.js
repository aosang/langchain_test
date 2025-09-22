import 'dotenv/config'
import { TavilySearch } from '@langchain/tavily'
import { ChatDeepSeek   } from '@langchain/deepseek'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { HumanMessage } from '@langchain/core/messages'

// 定义tools
const agentTools = [
  new TavilySearch({
    maxResults: 1, //最多查询3个结果
    apiKey: process.env.TAVILY_API_KEY // Tavily  API 密钥
  })
]

const agentModel = new ChatDeepSeek({
  model: 'deepseek-chat',
  temperature: 0,
  apiKey: process.env.DEEPSEEK_API_KEY,
  // 优化参数
  maxTokens: 1000, // 限制最大token数
  timeout: 30000,  // 30秒超时
})

const agentCheckpoint = new MemorySaver()

const agent = createReactAgent({
  llm: agentModel,
  tools: agentTools,
  checkpointSaver: agentCheckpoint, //记忆，保存状态数据
})

// 显示查询中提示
console.log('🔍 正在查询中，请稍候...');

// 使用消息流式模式来实现真正的流式输出
const agentStream = await agent.stream(
  { messages: [new HumanMessage('What do you think about the iPhone 17?')]},
  { configurable: {thread_id: '1'}, streamMode: 'messages' }
)

let hasStartedOutput = false

for await (const messageArray of agentStream) {
  // messageArray[0] 是消息对象，messageArray[1] 是元数据
  const message = messageArray[0]
  
  if (message && message.content) {
    // 只输出AI的最终回答（AIMessage类型且没有tool_calls）
    if (message.constructor.name === 'AIMessage' && 
        (!message.tool_calls || message.tool_calls.length === 0)) {
      
      // 第一次输出时清除查询中提示
      if (!hasStartedOutput) {
        console.clear(); // 清除控制台
        hasStartedOutput = true
      }
      
      // 逐行输出最终回答
      const lines = message.content.split('\n')
      for (const line of lines) {
        console.log(line)
        // 减少延迟来提升响应速度
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
  }
}

// const agentNextState = await agent.stream(
//   { messages: [new HumanMessage('what about Beijing')] },
//   { configurable: { thread_id: '1' }, streamMode: 'updates' }
// )
// for await (const step of agentNextState) { 
//   console.log(JSON.stringify(step))
// }
