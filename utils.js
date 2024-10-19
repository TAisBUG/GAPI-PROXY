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
  let lastContent = null; // 用于存储上一次的内容
  let buffer = ''; // 用于处理跨块的数据

  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    
    // 保留最后一行，因为它可能是不完整的
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const parsedData = JSON.parse(data);
          // 从响应中提取实际内容
          const content = extractContent(parsedData);
          
          // 检查是否是重复内容
          if (lastContent && isRepeatContent(content, lastContent)) {
            continue; // 跳过重复内容
          }

          // 更新最后发送的内容
          lastContent = content;
          
          // 发送数据
          res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
        } catch (e) {
          // 如果解析失败，仍然发送原始数据
          res.write(`data: ${data}\n\n`);
        }
      }
    }
  });

  stream.on('end', () => {
    // 处理缓冲区中剩余的数据
    if (buffer) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (data !== '[DONE]') {
          try {
            const parsedData = JSON.parse(data);
            const content = extractContent(parsedData);
            if (!lastContent || !isRepeatContent(content, lastContent)) {
              res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
            }
          } catch (e) {
            res.write(`data: ${data}\n\n`);
          }
        }
      }
    }
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

// 从响应数据中提取实际内容
function extractContent(parsedData) {
  try {
    return parsedData.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (e) {
    return JSON.stringify(parsedData);
  }
}

// 检查是否是重复内容
function isRepeatContent(currentContent, lastContent) {
  if (!currentContent || !lastContent) return false;
  return lastContent.endsWith(currentContent);
}

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}
