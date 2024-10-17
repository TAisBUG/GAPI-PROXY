import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import { processPath, handleSSEResponse, getApiKeys } from './utils.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const TELEGRAPH_URL = 'https://generativelanguage.googleapis.com/v1beta';

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.all('*', async (req, res) => {
  try {
    const processedPath = processPath(req.path);
    const targetURL = new URL(TELEGRAPH_URL.replace(/\/v1beta$/, '') + processedPath);
    
    const apiKeys = getApiKeys(req);
    if (apiKeys.length > 0) {
      const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
      targetURL.searchParams.set('key', selectedKey);
    }

    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 'key') {
        targetURL.searchParams.set(key, value);
      }
    }

    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const isSSE = req.query.alt === 'sse';

    const response = await fetch(targetURL.toString(), fetchOptions);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${error}`);
    }

    if (isSSE) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      await handleSSEResponse(response, res, req);
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});
