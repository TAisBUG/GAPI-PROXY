// utils.js
import { Readable } from 'stream';

export function processPath(originalPath) {
  const path = originalPath.startsWith('/') ? originalPath.slice(1) : originalPath;
  if (path.startsWith('v1beta/') || path === 'v1beta') {
    return `/${path}`;
  }
  return `/v1beta/${path}`;
}

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}

export async function handleSSEResponse(response, res, req) {
  if (!response.body) {
    throw new Error('Response body is undefined');
  }

  const stream = Readable.from(response.body);
  let buffer = '';
  let lastChunk = null;

  const processChunk = (chunk) => {
    try {
      return JSON.parse(chunk);
    } catch (e) {
      return chunk;
    }
  };

  const writeData = (data) => {
    if (typeof data === 'object') {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } else {
      res.write(`data: ${data}\n\n`);
    }
  };

  const handleLine = (line) => {
    if (!line.startsWith('data: ')) return false;
    
    const data = line.slice(6);
    if (!data) return false;

    if (data === '[DONE]') {
      if (lastChunk) {
        const currentContent = buffer;
        const hasNewlineInPrevious = lastChunk.endsWith('\n');
        const hasNewlineInCurrent = currentContent.startsWith('\n');

        // 检查是否存在换行符并且内容重复
        if ((hasNewlineInPrevious || hasNewlineInCurrent) && 
            currentContent.length > 5 && 
            lastChunk.endsWith(currentContent.slice(0, -6))) {
          res.write('data: [DONE]\n\n');
          return true;
        }

        // 如果内容不重复，发送最后的数据
        const processedData = processChunk(currentContent);
        if (processedData && processedData !== '[DONE]') {
          writeData(processedData);
        }
      }
      res.write('data: [DONE]\n\n');
      return true;
    }

    if (lastChunk) {
      const processedData = processChunk(lastChunk);
      if (processedData) {
        writeData(processedData);
      }
    }

    lastChunk = data;
    return false;
  };

  stream.on('data', (chunk) => {
    const text = chunk.toString();
    buffer += text;
    
    // 按行分割处理数据
    const lines = buffer.split('\n');
    // 保留最后一个可能不完整的行
    buffer = lines.pop() || '';

    // 处理完整的行
    for (const line of lines) {
      if (handleLine(line.trim())) {
        return;
      }
    }
  });

  stream.on('end', () => {
    // 处理缓冲区中剩余的数据
    if (buffer) {
      const line = buffer.trim();
      handleLine(line);
    }
    res.end();
  });

  stream.on('error', (error) => {
    console.error('Stream processing error:', error);
    res.end();
  });

  // 当请求被客户端终止时清理流
  req.on('close', () => {
    stream.destroy();
  });
}
