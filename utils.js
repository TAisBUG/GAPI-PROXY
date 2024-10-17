export function processPath(originalPath) {
  const path = originalPath.startsWith('/') ? originalPath.slice(1) : originalPath;
  if (path.startsWith('v1beta/') || path === 'v1beta') {
    return `/${path}`;
  }
  return `/v1beta/${path}`;
}

export async function handleSSEResponse(response, res, req) {
  const reader = response.body.getReader();
  const encoder = new TextEncoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        res.write('data: [DONE]\n\n');
        break;
      }
      
      const chunk = new TextDecoder().decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
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
    }
  } catch (error) {
    console.error('Stream processing error:', error);
  } finally {
    res.end();
  }

  req.on('close', () => {
    reader.cancel();
  });
}

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}
