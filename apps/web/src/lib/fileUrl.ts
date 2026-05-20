/**
 * Resolves a stored file URL to an absolute URL pointing at the API server.
 *
 * File URLs are stored as relative paths (e.g. "/uploads/tenant-id/file.jpg")
 * because the API serves them. When displayed in the web app (on a different
 * domain), they must be prefixed with the API base URL.
 */
const API_ROOT = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1')
  .replace(/\/api\/v1\/?$/, '');

export function resolveFileUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_ROOT}${url.startsWith('/') ? url : `/${url}`}`;
}
