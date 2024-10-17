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
  let previousChunk = '';

  stream.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        currentChunk += data;

        if (data === '[DONE]') {
          if (currentChunk.length > 2 && previousChunk.endsWith(currentChunk.slice(0, -6))) {
            res.write('data: [DONE]\n\n');
            return;
          } else if (currentChunk !== '[DONE]') {
            try {
              const parsedData = JSON.parse(currentChunk);
              res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
            } catch (e) {
              res.write(`data: ${currentChunk}\n\n`);
            }
          }
          res.write('data: [DONE]\n\n');
          return;
        }
      }
    }

    if (previousChunk) {
      try {
        const parsedData = JSON.parse(previousChunk);
        res.write(`data: ${JSON.stringify(parsedData)}\n\n`);
      } catch (e) {
        res.write(`data: ${previousChunk}\n\n`);
      }
    }

    previousChunk = currentChunk;
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
