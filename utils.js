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

  let buffer = '';

  const stream = Readable.from(response.body);

  stream.on('data', (chunk) => {
    const chunkString = chunk.toString();
    buffer += chunkString;

    const lines = buffer.split('\n');
    buffer = '';

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }
        try {
          const parsedData = JSON.parse(data);
          res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
        } catch (e) {
          res.write(`data: ${data}\n\n`);
        }
      }
    }

    if (lines.length > 0) {
      buffer = lines[lines.length - 1];
    }
  });

  stream.on('end', () => {
    if (buffer) {
      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        try {
          const parsedData = JSON.parse(data);
          res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
        } catch (e) {
          res.write(`data: ${data}\n\n`);
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

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}
