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
  let lastContent = '';  // 存储上一次的完整内容

  stream.on('data', (chunk) => {
    const lines = chunk.toString().split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        try {
          const currentData = JSON.parse(data);
          const currentContent = getCurrentContent(currentData);

          // 如果是空内容，跳过
          if (!currentContent) {
            continue;
          }

          // 检查当前内容是否是上一次内容末尾的重复
          if (lastContent && isEndingDuplicate(lastContent, currentContent)) {
            console.log('Detected and skipped duplicate ending:', currentContent);
            continue;
          }

          // 不是末尾重复，更新lastContent并发送数据
          lastContent = currentContent;
          res.write(`data: ${JSON.stringify(currentData)}\n\n`);

        } catch (e) {
          console.error('Error processing chunk:', e);
          res.write(`data: ${data}\n\n`);
        }
      }
    }
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

// 从响应数据中提取实际内容
function getCurrentContent(data) {
  try {
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    return null;
  }
}

// 检查是否是末尾重复内容
function isEndingDuplicate(lastContent, currentContent) {
  // 如果当前内容长度大于上次内容，显然不是重复
  if (currentContent.length > lastContent.length) {
    return false;
  }

  // 检查当前内容是否出现在上次内容的末尾
  const endPosition = lastContent.length - currentContent.length;
  const endingPart = lastContent.substring(endPosition);
  
  // 只有当前内容完全匹配上次内容的末尾部分时，才认为是重复
  return endingPart === currentContent;
}

export function getApiKeys(req) {
  const keyParam = req.query.key || '';
  if (!keyParam) return [];
  return keyParam.split(';').filter(Boolean);
}
