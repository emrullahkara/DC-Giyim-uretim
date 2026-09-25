export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[];

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      'x-dc-csrf': '1',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login')) window.dispatchEvent(new Event('dc:unauthorized'));
    throw new ApiError(res.status, data?.message ?? 'Sunucuya ulaşılamadı.', data?.code);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body: Json = {}) => request<T>('POST', url, body),
  patch: <T = any>(url: string, body: Json = {}) => request<T>('PATCH', url, body),
  put: <T = any>(url: string, body: Json = {}) => request<T>('PUT', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};

export function qs(params: Record<string, string | number | undefined | null | false>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '' && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
