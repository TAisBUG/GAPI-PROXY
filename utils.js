// utils.js
import { Readable } from 'stream';

export function processPath(originalPath) {
  const path = originalPath.startsWith('/') ? originalPath.slice(1) : originalPath;
  if (path.startsWith('v1beta/') || path === 'v1beta') {
    return `/${path}`;
  }
  return `/v1beta/${path}`;
}

export async function handleSSEResponse(response, res, req) {
  if (!response.body) {
    throw new Error('Response body is undefined');
  }

  const stream = Readable.from(response.body);
  let lastChunk = '';

  stream.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        currentChunk += data; // 拼接当前数据块

        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          return; // 处理结束信号，直接返回
        }

        try {
          // 检查是否有重复
          if (currentChunk.endsWith(lastChunk) && lastChunk !== '') {
            currentChunk = currentChunk.slice(0, -lastChunk.length); // 去除重复部分
          }

          if (currentChunk) {  // 确保有内容才发送
            const parsedData = JSON.parse(data); // 这里依然解析 data，保持与之前逻辑一致，如果需要解析 currentChunk，需要调整代码
            res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
          }
          
        } catch (e) {
          if (currentChunk) { // 确保有内容才发送
            res.write(`data: ${currentChunk}\n\n`); // 直接发送未解析的数据
          }
        }

      }
    }
    lastChunk = currentChunk; // 更新 lastChunk 为当前数据块
  });

  stream.on('end', () => {
    res.end();
  });

  stream.on('error', (error) => {
    console.error('Stream processing error:', error);
    res.end();
  });

  req.on('close', () => {
    stream.destroy();
  });
}

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}
