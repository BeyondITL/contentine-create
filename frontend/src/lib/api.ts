import { getToken } from './auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// --- CSRF Token Management ---

let csrfToken = '';
let csrfRefreshTimer: ReturnType<typeof setInterval> | null = null;

/** Fetch a fresh CSRF token from the backend. */
export async function initCsrf(): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/auth/csrf-token`);
    if (res.ok) {
      const data = await res.json();
      csrfToken = data.token || '';
    }
  } catch {
    // Silently fail — CSRF will be retried on 403
  }

  // Refresh every 45 minutes (tokens expire after 1 hour)
  if (!csrfRefreshTimer) {
    csrfRefreshTimer = setInterval(() => initCsrf(), 45 * 60 * 1000);
  }
}

// --- Error Classes ---

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// --- Retry Logic ---

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  baseDelay = 1000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, options);

    // Success
    if (response.ok) return response;

    // 401 → try refresh token once; if still failing, throw (don't redirect)
    if (response.status === 401 && attempt === 0) {
      const newToken = await getToken();
      if (newToken) {
        const newOptions = {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${newToken}`,
          },
        };
        const retryResponse = await fetch(url, newOptions);
        if (retryResponse.ok) return retryResponse;
      }
      // Don't call login() here — it triggers loginWithRedirect() which causes
      // infinite redirect loops. Let the calling code handle session expiry.
      throw new APIError('Session expired', 401);
    }

    // 403 with csrf_invalid → refresh CSRF token and retry
    if (response.status === 403 && attempt === 0) {
      const body = await response.clone().json().catch(() => ({}));
      if (body.code === 'csrf_invalid') {
        await initCsrf();
        const newOptions = {
          ...options,
          headers: {
            ...options.headers,
            'X-CSRF-Token': csrfToken,
          },
        };
        const retryResponse = await fetch(url, newOptions);
        if (retryResponse.ok) return retryResponse;
      }
    }

    // 429 → respect Retry-After
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : baseDelay * Math.pow(2, attempt);
      await sleep(waitMs);
      continue;
    }

    // 4xx → don't retry (client error)
    if (response.status >= 400 && response.status < 500) {
      const body = await response.json().catch(() => ({}));
      throw new APIError(body.error || 'Request failed', response.status, body.code, body.details);
    }

    // 5xx → retry with exponential backoff
    if (response.status >= 500 && attempt < retries) {
      await sleep(baseDelay * Math.pow(2, attempt));
      continue;
    }

    // Final attempt failed
    const body = await response.json().catch(() => ({}));
    throw new APIError(body.error || 'Server error', response.status);
  }

  throw new APIError('Max retries exceeded', 0);
}

// --- Core API Methods ---

async function request<T = any>(
  method: string,
  path: string,
  body?: any,
  options: { auth?: boolean; headers?: Record<string, string> } = {}
): Promise<T> {
  const { auth = true, headers: extraHeaders = {} } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  if (auth) {
    const token = await getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  // Add CSRF token for mutating requests
  if (['POST', 'PUT', 'DELETE'].includes(method) && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const response = await fetchWithRetry(`${API_URL}${path}`, fetchOptions);

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return response.text() as any;
}

// --- Public API ---

export const api = {
  get: <T = any>(path: string, opts?: { auth?: boolean }) => request<T>('GET', path, undefined, opts),
  post: <T = any>(path: string, body?: any, opts?: { auth?: boolean }) => request<T>('POST', path, body, opts),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  delete: <T = any>(path: string) => request<T>('DELETE', path),

  /**
   * Upload a file (MP4 blob, image, etc.)
   */
  upload: async (path: string, file: Blob, filename: string): Promise<any> => {
    const token = await getToken();
    const formData = new FormData();
    formData.append('file', file, filename);

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new APIError(body.error || 'Upload failed', response.status);
    }

    return response.json();
  },
};
