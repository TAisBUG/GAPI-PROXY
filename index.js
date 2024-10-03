const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const TELEGRAPH_URL = 'https://generativelanguage.googleapis.com/v1beta';

app.use(express.json());
app.use(cors());

app.all('*', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  url.host = TELEGRAPH_URL.replace(/^https?:\/\//, '');
  
  // 检查是否是POST请求且路径匹配
  if (req.method === 'POST' && url.pathname.includes('/v1beta/models/')) {
    const apiKeys = getApiKeys(url);
    if (apiKeys.length > 0) {
      // 选择一个API密钥并更新URL
      const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
      url.searchParams.set('key', selectedKey);
    }
  }

  const modifiedRequest = {
    method: req.method,
    headers: req.headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    redirect: 'follow'
  };

  try {
    const response = await fetch(url.toString(), modifiedRequest);
    const data = await response.text();

    res.status(response.status);
    for (const [key, value] of response.headers) {
      res.setHeader(key, value);
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

function getApiKeys(url) {
  const keyParam = url.searchParams.get('key');
  if (!keyParam) {
    return [];
  }
  // 使用正则表达式安全地分割密钥，同时处理单个密钥的情况
  return keyParam.match(/([^;]+)/g) || [keyParam];
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
