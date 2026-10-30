export function attachCheckpoint(messages, checkpoint) {
  if (!checkpoint?.id || !checkpoint.messageId) return messages;
  return messages.map(message => message.role === 'user' && String(message.id) === String(checkpoint.messageId)
    ? { ...message, checkpoint } : message);
}

export function checkpointOwners(messages) {
  let owner = null;
  return messages.map(message => {
    if (message.role === 'user') owner = message.checkpoint?.id ? message : null;
    return owner;
  });
}

async function readResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || `Checkpoint request failed (${response.status})`);
  return data;
}

export async function restoreCheckpoint(backendUrl, chatId, checkpointId, fetcher = fetch) {
  const auth = await readResponse(await fetcher(`${backendUrl}/api/auth/token`));
  if (typeof auth.token !== 'string' || !auth.token) throw new Error('无法获取检查点还原凭证。');
  const data = await readResponse(await fetcher(`${backendUrl}/api/checkpoints/restore`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-agent-auth-token': auth.token },
    body: JSON.stringify({ chatId, checkpointId }),
  }));
  if (data.success !== true || !Array.isArray(data.messages) || !data.userMessage || data.checkpoint?.id !== checkpointId) {
    throw new Error('检查点还原响应不完整，请重新加载对话确认状态。');
  }
  return data;
}
