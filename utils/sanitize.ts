// src/utils/sanitize.ts
/*
  Sanitize arbitrary values so they can be stored in IndexedDB (structured clone).
  - Strips functions, DOM nodes, Events, Window, Set/Map/Weak*, Symbols
  - Keeps primitives, plain objects, arrays, ArrayBuffer / TypedArrays / Dates (as ISO strings)
*/
export function sanitizeForIDB<T>(val: T, seen = new WeakSet<object>()): T {
  // Primitives are safe
  if (val === null) return val;
  const t = typeof val as string;
  if (t !== "object") {
    // functions & symbols are excluded
    return (t === "function" || t === "symbol") ? (undefined as unknown as T) : val;
  }

  // Handle special host objects
  // @ts-ignore
  if (typeof Element !== "undefined" && val instanceof Element) return undefined as unknown as T;
  // @ts-ignore
  if (typeof Event !== "undefined" && val instanceof Event) return undefined as unknown as T;
  // @ts-ignore
  if (typeof Window !== "undefined" && val instanceof Window) return undefined as unknown as T;

  // Disallow common non-cloneables
  // @ts-ignore
  if (val instanceof Map || val instanceof Set || val instanceof WeakMap || val instanceof WeakSet) {
    return undefined as unknown as T;
  }

  // Allow ArrayBuffer / TypedArrays directly
  // @ts-ignore
  if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) return val;

  // Dates → ISO string (cloneable)
  // @ts-ignore
  if (val instanceof Date) return (val.toISOString() as unknown) as T;

  if (seen.has(val as unknown as object)) return undefined as unknown as T;
  seen.add(val as unknown as object);

  if (Array.isArray(val)) {
    // sanitize each element and drop undefineds
    const out = (val as unknown as any[])
      .map((v) => sanitizeForIDB(v, seen))
      .filter((v) => v !== undefined);
    return out as unknown as T;
  }

  // Plain object: keep only cloneable entries
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as unknown as Record<string, unknown>)) {
    const sv = sanitizeForIDB(v as unknown as T, seen);
    if (sv !== undefined) out[k] = sv;
  }
  return out as unknown as T;
}