<template>
  <div class="ai-chat-container">
    <div class="header">
      <h1>🤖 AI助手聊天</h1>
      <div class="status" :class="{ online: isConnected, offline: !isConnected }">
        {{ isConnected ? '服务连接正常' : '服务连接断开' }}
      </div>
    </div>

    <!-- 聊天消息区域 -->
    <div class="chat-messages" ref="messagesContainer">
      <div 
        v-for="(msg, index) in messages" 
        :key="index" 
        class="message"
        :class="{ 'user-message': msg.type === 'user', 'ai-message': msg.type === 'ai' }"
      >
        <div class="message-content">
          <div class="message-text" v-html="formatMessage(msg.content)"></div>
          <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
        </div>
      </div>
      
      <!-- AI思考中提示 -->
      <div v-if="isThinking" class="message ai-message thinking">
        <div class="message-content">
          <div class="message-text">
            <div class="thinking-dots">
              <span></span><span></span><span></span>
            </div>
            {{ thinkingMessage }}
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="input-container">
        <textarea
          v-model="userInput"
          @keydown.enter.prevent="handleSend"
          @keydown.ctrl.enter="userInput += '\n'"
          placeholder="输入您的问题... (Enter发送，Ctrl+Enter换行)"
          :disabled="isLoading"
          ref="textareaRef"
        ></textarea>
        <button 
          @click="handleSend" 
          :disabled="!userInput.trim() || isLoading"
          class="send-button"
        >
          <span v-if="!isLoading">发送</span>
          <span v-else>发送中...</span>
        </button>
      </div>
      
      <!-- 响应模式切换 -->
      <div class="options">
        <label class="mode-switch">
          <input 
            type="checkbox" 
            v-model="useStreamMode"
            :disabled="isLoading"
          >
          <span>流式响应模式</span>
        </label>
        <button @click="clearMessages" class="clear-button" :disabled="isLoading">
          清空对话
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted } from 'vue'
import axios from 'axios'

// 配置
const API_BASE_URL = 'http://localhost:3001/api'
const THREAD_ID = 'vue-chat-' + Date.now()

// 响应式数据
const messages = ref([])
const userInput = ref('')
const isLoading = ref(false)
const isThinking = ref(false)
const thinkingMessage = ref('')
const useStreamMode = ref(true)
const isConnected = ref(false)
const messagesContainer = ref(null)
const textareaRef = ref(null)

// 检查服务连接状态
const checkConnection = async () => {
  try {
    await axios.get(`${API_BASE_URL}/health`)
    isConnected.value = true
  } catch (error) {
    isConnected.value = false
    console.error('服务连接失败:', error)
  }
}

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 添加消息
const addMessage = (type, content, timestamp = new Date()) => {
  messages.value.push({
    type,
    content,
    timestamp
  })
  scrollToBottom()
}

// 格式化消息内容（支持简单的Markdown）
const formatMessage = (content) => {
  return content
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
}

// 格式化时间
const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 普通模式发送消息
const sendNormalMessage = async (message) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/chat`, {
      message: message,
      threadId: THREAD_ID
    })

    if (response.data.success) {
      addMessage('ai', response.data.data.response)
    } else {
      addMessage('ai', '抱歉，处理您的请求时出现了错误。')
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    addMessage('ai', '网络连接错误，请检查服务是否正常运行。')
  }
}

// 流式模式发送消息
const sendStreamMessage = async (message) => {
  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        threadId: THREAD_ID
      })
    })

    if (!response.ok) {
      throw new Error('Stream request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let aiResponse = ''

    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            
            switch (data.type) {
              case 'start':
                isThinking.value = true
                thinkingMessage.value = data.message
                break
                
              case 'thinking':
                thinkingMessage.value = data.message
                break
                
              case 'content':
                if (isThinking.value) {
                  isThinking.value = false
                  // 添加AI消息占位符
                  addMessage('ai', '')
                }
                // 更新最后一条AI消息
                aiResponse += data.content + '\n'
                if (messages.value.length > 0 && messages.value[messages.value.length - 1].type === 'ai') {
                  messages.value[messages.value.length - 1].content = aiResponse.trim()
                }
                scrollToBottom()
                break
                
              case 'end':
                isThinking.value = false
                break
                
              case 'error':
                isThinking.value = false
                addMessage('ai', `错误: ${data.message}`)
                break
            }
          } catch (e) {
            console.warn('解析SSE数据失败:', e)
          }
        }
      }
    }
  } catch (error) {
    console.error('流式请求失败:', error)
    isThinking.value = false
    addMessage('ai', '网络连接错误，请检查服务是否正常运行。')
  }
}

// 发送消息
const handleSend = async () => {
  const message = userInput.value.trim()
  if (!message || isLoading.value) return

  // 添加用户消息
  addMessage('user', message)
  userInput.value = ''
  isLoading.value = true

  try {
    if (useStreamMode.value) {
      await sendStreamMessage(message)
    } else {
      await sendNormalMessage(message)
    }
  } finally {
    isLoading.value = false
    isThinking.value = false
  }

  // 聚焦输入框
  nextTick(() => {
    textareaRef.value?.focus()
  })
}

// 清空对话
const clearMessages = () => {
  messages.value = []
  addMessage('ai', '您好！我是AI助手，有什么可以帮助您的吗？')
}

// 组件挂载时
onMounted(() => {
  checkConnection()
  addMessage('ai', '您好！我是AI助手，有什么可以帮助您的吗？')
  
  // 定期检查连接状态
  setInterval(checkConnection, 30000)
})
</script>

<style scoped>
.ai-chat-container {
  max-width: 800px;
  margin: 0 auto;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 1rem;
  text-align: center;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.header h1 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
}

.status {
  font-size: 0.9rem;
  opacity: 0.9;
}

.status.online {
  color: #4ade80;
}

.status.offline {
  color: #f87171;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  background: white;
}

.message {
  margin-bottom: 1rem;
  display: flex;
  animation: fadeIn 0.3s ease-in;
}

.message.user-message {
  justify-content: flex-end;
}

.message.ai-message {
  justify-content: flex-start;
}

.message-content {
  max-width: 70%;
  padding: 0.75rem 1rem;
  border-radius: 1rem;
  position: relative;
}

.user-message .message-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom-right-radius: 0.25rem;
}

.ai-message .message-content {
  background: #f3f4f6;
  color: #374151;
  border-bottom-left-radius: 0.25rem;
}

.message-text {
  line-height: 1.5;
  word-wrap: break-word;
}

.message-time {
  font-size: 0.75rem;
  opacity: 0.7;
  margin-top: 0.25rem;
  text-align: right;
}

.thinking {
  opacity: 0.8;
}

.thinking-dots {
  display: inline-block;
  margin-right: 0.5rem;
}

.thinking-dots span {
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #9ca3af;
  margin: 0 1px;
  animation: thinking 1.4s infinite ease-in-out both;
}

.thinking-dots span:nth-child(1) { animation-delay: -0.32s; }
.thinking-dots span:nth-child(2) { animation-delay: -0.16s; }

.input-area {
  background: white;
  border-top: 1px solid #e5e7eb;
  padding: 1rem;
}

.input-container {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.input-container textarea {
  flex: 1;
  min-height: 50px;
  max-height: 120px;
  padding: 0.75rem;
  border: 2px solid #e5e7eb;
  border-radius: 0.5rem;
  resize: vertical;
  font-family: inherit;
  font-size: 0.9rem;
  line-height: 1.4;
  transition: border-color 0.2s;
}

.input-container textarea:focus {
  outline: none;
  border-color: #667eea;
}

.send-button {
  padding: 0.75rem 1.5rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
  white-space: nowrap;
}

.send-button:hover:not(:disabled) {
  opacity: 0.9;
}

.send-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.mode-switch {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.clear-button {
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #d1d5db;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.clear-button:hover:not(:disabled) {
  background: #e5e7eb;
}

.clear-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 动画 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes thinking {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

/* 代码样式 */
:deep(code) {
  background: rgba(0,0,0,0.1);
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: 'Courier New', monospace;
  font-size: 0.875em;
}

/* 滚动条样式 */
.chat-messages::-webkit-scrollbar {
  width: 6px;
}

.chat-messages::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.chat-messages::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
