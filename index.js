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

// 主要代理处理
app.all('*', async (req, res) => {
  try {
    // 构建目标 URL
    const targetURL = new URL(TELEGRAPH_URL + req.path);
    
    // 获取并处理 API 密钥
    const apiKeys = getApiKeys(req);
    if (apiKeys.length > 0) {
      const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
      targetURL.searchParams.set('key', selectedKey);
    }

    // 复制原始查询参数
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'key') { // 跳过原始的 key 参数
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

    // 发送请求
    const response = await fetch(targetURL.toString(), fetchOptions);
    const data = await response.json();

    // 发送响应
    res.status(response.status).json(data);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
