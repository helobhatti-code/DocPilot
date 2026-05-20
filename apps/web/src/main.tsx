import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'react-hot-toast';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { applyTheme, authStore } from '@/store/auth';
import './styles/globals.css';

const stored = (localStorage.getItem('gpms_theme') as 'DARK' | 'LIGHT' | null) ?? null;
const fromUser = authStore.getState().user?.themePreference;
applyTheme(stored ?? fromUser ?? 'DARK');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Exponential backoff: 5s then 10s — gives the free-tier server time to wake up
      // without hammering it and hitting the rate limiter
      retryDelay: (attempt) => Math.min(5000 * 2 ** attempt, 15000),
      refetchOnWindowFocus: false,
      staleTime: 30_000,       // 30s cache — reduces redundant requests
      gcTime: 5 * 60_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
              },
              success: { iconTheme: { primary: '#00D4AA', secondary: '#fff' } },
              error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
            }}
          />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
