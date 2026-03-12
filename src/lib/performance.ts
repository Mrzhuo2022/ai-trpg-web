/**
 * Performance optimization utilities
 */

/**
 * Debounce function execution
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function (this: unknown, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttle function execution
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastResult: ReturnType<T>;
  
  return function (this: unknown, ...args: Parameters<T>) {
    if (!inThrottle) {
      inThrottle = true;
      lastResult = fn.apply(this, args) as ReturnType<T>;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
    return lastResult;
  };
}

/**
 * Request animation frame throttle
 */
export function rafThrottle<T extends (...args: unknown[]) => unknown>(
  fn: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  
  return function (this: unknown, ...args: Parameters<T>) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      fn.apply(this, args);
      rafId = null;
    });
  };
}

/**
 * LRU Cache implementation
 */
export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    // Evict oldest if at capacity
    else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Measure function execution time
 */
export function measureTime<T extends (...args: unknown[]) => unknown>(
  fn: T,
  label: string
): T {
  return (function (this: unknown, ...args: Parameters<T>) {
    const start = performance.now();
    try {
      const result = fn.apply(this, args);
      if (result instanceof Promise) {
        return result.finally(() => {
          const end = performance.now();
          console.debug(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
        });
      }
      const end = performance.now();
      console.debug(`[Performance] ${label}: ${(end - start).toFixed(2)}ms`);
      return result;
    } catch (error) {
      const end = performance.now();
      console.debug(`[Performance] ${label} (errored): ${(end - start).toFixed(2)}ms`);
      throw error;
    }
  }) as T;
}

/**
 * Batch multiple updates into a single render
 */
export function batchUpdates<T>(updates: Array<() => T>, batchSize = 10): T[] {
  const results: T[] = [];
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    results.push(...batch.map(fn => fn()));
  }
  return results;
}
