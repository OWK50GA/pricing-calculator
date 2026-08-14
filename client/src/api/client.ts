// Token storage — localStorage for simplicity.
// In production this should use httpOnly cookies to prevent XSS token theft.
// Documented tradeoff: localStorage is sufficient for a hiring assignment
// where the security model is not the evaluation focus.

const KEYS = {
  ACCESS:  "pc_access_token",
  REFRESH: "pc_refresh_token",
} as const;

export const tokenStore = {
  getAccess:     ()        => localStorage.getItem(KEYS.ACCESS),
  getRefresh:    ()        => localStorage.getItem(KEYS.REFRESH),
  set:           (access: string, refresh: string) => {
    localStorage.setItem(KEYS.ACCESS,  access);
    localStorage.setItem(KEYS.REFRESH, refresh);
  },
  clear:         ()        => {
    localStorage.removeItem(KEYS.ACCESS);
    localStorage.removeItem(KEYS.REFRESH);
  },
};

// ─────────────────────────────────────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_API_URL as string;
console.log(BASE_URL);

type ApiResponse<T> = { data: T; error: null } | { data: null; error: string };

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    tokenStore.clear();
    return null;
  }

  const json = await res.json();
  tokenStore.set(json.access_token, json.refresh_token);
  return json.access_token;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<ApiResponse<T>> {
  const accessToken = tokenStore.getAccess();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401 && retry) {
    // Queue concurrent requests while one refresh is in flight
    if (isRefreshing) {
      return new Promise((resolve) => {
        refreshQueue.push(async (newToken) => {
          if (!newToken) {
            resolve({ data: null, error: "Session expired" });
          } else {
            resolve(request<T>(path, options, false));
          }
        });
      });
    }

    isRefreshing = true;
    const newToken = await refreshAccessToken();
    isRefreshing = false;
    refreshQueue.forEach((cb) => cb(newToken));
    refreshQueue = [];

    if (!newToken) return { data: null, error: "Session expired" };
    return request<T>(path, options, false);
  }

  if (!res.ok) {
    let message = "Something went wrong";
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      // non-JSON error body
    }
    return { data: null, error: message };
  }

  // 204 No Content
  if (res.status === 204) return { data: null as T, error: null };

  const body = await res.json();
  // Return the full parsed body. The server wraps responses in { status, data, ... }
  // so callers receive that envelope as-is and extract what they need.
  return { data: body as T, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)                          => request<T>(path, { method: "GET" }),
  post:   <T>(path: string, body: unknown)           => request<T>(path, { method: "POST",  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown)           => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string)                          => request<T>(path, { method: "DELETE" }),
};
