import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

export interface RefreshResponse { accessToken: string }
export interface ApiErrorResponse { message: string; code?: string }
interface RetryableRequestConfig extends InternalAxiosRequestConfig { _retry?: boolean }
type TokenListener = (token: string | null) => void;

const baseURL = (import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "/api" : "http://localhost:5000/api")).replace(/\/$/, "");
export const api = axios.create({ baseURL, withCredentials: true, timeout: 15000 });
const refreshClient = axios.create({ baseURL, withCredentials: true, timeout: 15000 });
let accessToken: string | null = null;
let refreshPromise: Promise<string> | null = null;
let logoutCallback: (() => void) | null = null;
let logoutNotified = false;
let generation = 0;
const listeners = new Set<TokenListener>();

export function setAccessToken(token: string | null): void {
  generation += 1;
  accessToken = token;
  if (token) logoutNotified = false;
  listeners.forEach((listener) => listener(token));
}

export function subscribeAccessToken(listener: TokenListener): () => void {
  listeners.add(listener);
  listener(accessToken);
  return () => { listeners.delete(listener); };
}

export function setLogoutCallback(callback: (() => void) | null): void { logoutCallback = callback; }

function handleRefreshFailure(): void {
  if (logoutNotified) return;
  logoutNotified = true;
  setAccessToken(null);
  logoutCallback?.();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") window.location.assign("/login");
}

export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    const startedAt = generation;
    const pending = refreshClient.post<RefreshResponse>("/auth/refresh")
      .then(({ data }) => {
        if (generation !== startedAt) throw new Error("Session changed during refresh");
        if (typeof data?.accessToken !== "string" || !data.accessToken) throw new Error("Invalid refresh response");
        setAccessToken(data.accessToken);
        return data.accessToken;
      });
    refreshPromise = pending.finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set("Authorization", `Bearer ${accessToken}`);
  return config;
});

api.interceptors.response.use((response) => response, async (error: AxiosError<ApiErrorResponse>) => {
  const request = error.config as RetryableRequestConfig | undefined;
  const status = error.response?.status;
  if (status === 403 && error.response?.data.code === "SESSION_REVOKED") {
    handleRefreshFailure();
    return Promise.reject(error);
  }
  const needsRefresh = status === 401 || (status === 403 && error.response?.data.code === "TOKEN_EXPIRED");
  // Credential failures must reach the login form without refreshing or redirecting.
  const authEndpoint = /\/auth\/(?:(?:login|signup|refresh|logout|google)(?:[/?]|$)|password\/(?:request|verify|reset)(?:[/?]|$))/.test(request?.url ?? "");
  if (!request || request._retry || !needsRefresh || authEndpoint) return Promise.reject(error);
  request._retry = true;
  try {
    const previousToken = request.headers.get("Authorization");
    const token = accessToken && previousToken !== `Bearer ${accessToken}` ? accessToken : await refreshAccessToken();
    request.headers.set("Authorization", `Bearer ${token}`);
    return api.request(request);
  } catch (refreshError) {
    if (axios.isAxiosError(refreshError) && [401, 403].includes(refreshError.response?.status ?? 0)) handleRefreshFailure();
    return Promise.reject(refreshError);
  }
});
