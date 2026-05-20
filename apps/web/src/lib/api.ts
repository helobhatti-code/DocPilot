import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { authStore } from '@/store/auth';

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStore.getState().accessToken;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = authStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    const { accessToken, refreshToken: newRefresh } = res.data as {
      accessToken: string;
      refreshToken: string;
    };
    authStore.getState().setTokens(accessToken, newRefresh);
    return accessToken;
  } catch {
    authStore.getState().logout();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/')
    ) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers = original.headers ?? {};
        original.headers['Authorization'] = `Bearer ${token}`;
        return api.request(original);
      }
    }
    return Promise.reject(error);
  },
);
