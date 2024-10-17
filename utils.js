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
    buffer += chunk.toString();

    const regex = /(?:data: .*(?:\n\n|$))/g;
    let match;
    while ((match = regex.exec(buffer)) !== null) {
      const dataLine = match[0].trim();
      if (dataLine.startsWith('data: ')) {
        const data = dataLine.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
        } else {
          try {
            const parsedData = JSON.parse(data);
            res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
          } catch (error) {
            res.write(`data: ${data}\n\n`);
          }
        }
      }
      buffer = buffer.slice(match.index + match[0].length);
      regex.lastIndex = 0;
    }
  });

  stream.on('end', () => {
    if (buffer.startsWith('data: ')) {
      const data = buffer.slice(6);
      try {
        const parsedData = JSON.parse(data);
        res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
      } catch (error) {
        res.write(`data: ${data}\n\n`);
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
