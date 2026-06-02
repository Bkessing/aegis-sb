/**
 * Minimal HTTP helper around fetch with timeout + auth header injection.
 * Anon-key only — never accepts or sends service-role keys.
 */

export interface RequestOptions {
  url: string;
  anonKey: string;
  method?: "GET" | "POST" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface Response {
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
  json: () => unknown;
}

export async function request(opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  try {
    const res = await fetch(opts.url, {
      method: opts.method ?? "GET",
      headers: {
        apikey: opts.anonKey,
        Authorization: `Bearer ${opts.anonKey}`,
        ...(opts.body !== undefined
          ? { "Content-Type": "application/json" }
          : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      text,
      json: () => (text ? JSON.parse(text) : null),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Run async tasks with a max concurrency limit. */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  });

  await Promise.all(workers);
  return results;
}
