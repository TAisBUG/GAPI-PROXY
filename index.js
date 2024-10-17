const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 目标 URL
const TELEGRAPH_URL = 'https://generativelanguage.googleapis.com/v1beta';

// 中间件
app.use(cors());
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// 处理路径，检查和处理 v1beta
function processPath(originalPath) {
  // 移除开头的斜杠（如果存在）
  const path = originalPath.startsWith('/') ? originalPath.slice(1) : originalPath;
  
  // 检查路径是否已经包含 v1beta
  if (path.startsWith('v1beta/') || path === 'v1beta') {
    return `/${path}`;
  }
  
  // 如果不包含 v1beta，添加它
  return `/v1beta/${path}`;
}

// 处理 SSE 数据流
async function handleSSEResponse(response, res) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最后一个不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // 移除 'data: ' 前缀
          if (data === '[DONE]') {
            res.write('data: [DONE]\n\n');
            continue;
          }
          try {
            // 解析并重新格式化数据
            const parsedData = JSON.parse(data);
            res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
          } catch (e) {
            console.error('Parse error:', e);
            // 如果解析失败，发送原始数据
            res.write(`data: ${data}\n\n`);
          }
        }
      }
    }

    // 处理剩余的buffer
    if (buffer) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsedData = JSON.parse(data);
            res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
          } catch (e) {
            res.write(`data: ${data}\n\n`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream processing error:', error);
  } finally {
    res.end();
  }
}

// 主要代理处理
app.all('*', async (req, res) => {
  try {
    // 处理路径
    const processedPath = processPath(req.path);
    
    // 构建目标 URL，使用处理后的路径
    const targetURL = new URL(TELEGRAPH_URL.replace(/\/v1beta$/, '') + processedPath);
    
    // 获取并处理 API 密钥
    const apiKeys = getApiKeys(req);
    if (apiKeys.length > 0) {
      const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
      targetURL.searchParams.set('key', selectedKey);
    }

    // 复制原始查询参数
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'key') {
        targetURL.searchParams.set(key, value);
      }
    }

    // 准备请求选项
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    // 添加请求体（如果有）
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    // 检查是否是 SSE 请求
    const isSSE = req.query.alt === 'sse';

    if (isSSE) {
      // 设置 SSE 响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // 发送请求并处理流响应
      const response = await fetch(targetURL.toString(), fetchOptions);
      await handleSSEResponse(response, res);
    } else {
      // 非 SSE 请求的处理逻辑
      const response = await fetch(targetURL.toString(), fetchOptions);
      const data = await response.json();
      res.status(response.status).json(data);
    }

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

// 提取 API 密钥
function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}

// 启动服务器
app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
