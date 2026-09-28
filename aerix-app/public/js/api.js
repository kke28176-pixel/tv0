/* ============================================================
   AERIX — 前端 API 客戶端（呼叫後端 Express API）
   ============================================================ */

async function apiRequest(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* 空回應 */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `發生錯誤（${res.status}）`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const api = {
  get: (url) => apiRequest(url),
  post: (url, body) => apiRequest(url, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: (url, body) => apiRequest(url, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  del: (url) => apiRequest(url, { method: 'DELETE' }),
  upload: (url, formData, method = 'POST') => apiRequest(url, { method, body: formData }),
};
