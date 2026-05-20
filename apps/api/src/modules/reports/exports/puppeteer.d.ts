/**
 * Minimal type stub for puppeteer.
 *
 * This shim keeps the project's `tsc` happy in environments where the
 * dependency hasn't been installed yet. Once puppeteer is installed its
 * bundled `.d.ts` takes precedence — this file becomes a no-op fallback.
 */
declare module 'puppeteer' {
  export interface LaunchOptions {
    headless?: boolean;
    args?: string[];
  }
  export interface Page {
    setContent(html: string, opts?: { waitUntil?: string }): Promise<void>;
    pdf(opts: Record<string, unknown>): Promise<Uint8Array>;
    close(): Promise<void>;
  }
  export interface Browser {
    newPage(): Promise<Page>;
    close(): Promise<void>;
    connected: boolean;
  }
  export function launch(opts?: LaunchOptions): Promise<Browser>;

  const _default: {
    launch(opts?: LaunchOptions): Promise<Browser>;
  };
  export default _default;
}
