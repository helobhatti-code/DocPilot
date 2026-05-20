import { useEffect, useRef, useState } from 'react';

/** Debounce a value by `delay` ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Track viewport breakpoint matches. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(query);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    m.addEventListener('change', listener);
    setMatches(m.matches);
    return () => m.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

/** Lightweight in-memory cache with TTL. */
export function createCache<T>(ttlMs: number) {
  const store = new Map<string, { value: T; at: number }>();
  return {
    get(key: string): T | undefined {
      const e = store.get(key);
      if (!e) return undefined;
      if (Date.now() - e.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key: string, value: T) {
      store.set(key, { value, at: Date.now() });
    },
    clear() { store.clear(); },
  };
}

/** Virtual scroll for large lists — minimal implementation. */
export function useVirtualizer({
  count, itemHeight, overscan = 5, scrollRef,
}: {
  count: number;
  itemHeight: number;
  overscan?: number;
  scrollRef: React.RefObject<HTMLElement>;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportH(el.clientHeight);
    onResize();
    el.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [scrollRef]);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(count, Math.ceil((scrollTop + viewportH) / itemHeight) + overscan);
  const items = [];
  for (let i = startIndex; i < endIndex; i++) {
    items.push({ index: i, top: i * itemHeight });
  }
  return {
    totalSize: count * itemHeight,
    items,
    startIndex,
    endIndex,
  };
}

/** Auto-focus an element on mount. */
export function useAutoFocus<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}
