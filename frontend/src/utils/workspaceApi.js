export async function readWorkspaceResponse(response, getLocalText) {
  const unavailable = getLocalText(
    '无法连接工作区服务，请确认后端已启动后重试。',
    'Cannot connect to the workspace service. Start the backend and try again.'
  );
  const outdated = getLocalText(
    '工作区接口尚未加载，请重启后端并刷新页面后重试。',
    'The workspace API is not loaded. Restart the backend and refresh the page.'
  );
  const invalid = getLocalText(
    '工作区服务返回了无效响应，请重启后端后重试。',
    'The workspace service returned an invalid response. Restart the backend and try again.'
  );
  const body = await response.text();
  let data = null;
  try {
    data = body.trim() ? JSON.parse(body) : null;
  } catch {
    // Proxies and outdated servers may return HTML or an empty error response.
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error(outdated);
    if ([502, 503, 504].includes(response.status)) throw new Error(unavailable);
    throw new Error((typeof data?.error === 'string' && data.error) || `${unavailable} (HTTP ${response.status})`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(!body.trim() ? unavailable : invalid);
  }
  if (typeof data.error === 'string' && data.error) throw new Error(data.error);
  return data;
}
