import { AlertOctagon, RefreshCw } from 'lucide-react';
import React from 'react';

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center bg-bg-primary text-text-primary p-6">
          <div className="bg-bg-card border border-border rounded-xl p-6 max-w-md w-full text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 grid place-items-center mb-3">
              <AlertOctagon size={22} className="text-rose-500" />
            </div>
            <h1 className="text-lg font-semibold mb-1">Something went wrong</h1>
            <p className="text-sm text-text-secondary mb-4">
              The app hit an unexpected error. Try reloading; if the problem persists,
              contact your administrator.
            </p>
            <pre className="bg-bg-input border border-border rounded p-2 text-xs text-rose-300 overflow-auto max-h-32 mb-4 text-left">
              {this.state.error.message}
            </pre>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => { this.reset(); window.location.reload(); }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-primary text-white text-sm"
              >
                <RefreshCw size={14} /> Reload
              </button>
              <button
                onClick={this.reset}
                className="px-3 py-1.5 rounded-lg bg-bg-input border border-border text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
