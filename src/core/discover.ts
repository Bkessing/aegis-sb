import { request, runWithConcurrency } from "./http.js";
import type { Bucket, Config, Table } from "./types.js";
import { buildWordlist, DEFAULT_TABLE_WORDLIST } from "./wordlist.js";

export { DEFAULT_TABLE_WORDLIST };

/**
 * Discover which tables in the project exist + are exposed to PostgREST.
 *
 * Supabase locks `/rest/v1/` (OpenAPI spec) to the service_role key — we
 * cannot enumerate. Instead we probe a wordlist of common vibe-coder table
 * names. Each candidate gets one HEAD-style request (`limit=0`):
 *
 *   - HTTP 200             → table exists (and is reachable by anon, either
 *                            via permissive RLS or because it's open)
 *   - HTTP 401/403         → table exists but RLS blocks anon (good — this
 *                            is the secure default)
 *   - HTTP 404             → table doesn't exist (skip)
 *   - Other                → skip (server error / unknown)
 *
 * Both 200 and 401/403 confirm the table exists; subsequent probes will
 * test what anon can actually do with it.
 */
export async function discoverTables(
  config: Config,
  candidates: string[] = DEFAULT_TABLE_WORDLIST,
): Promise<Table[]> {
  const baseUrl = config.url.replace(/\/$/, "");

  const results = await runWithConcurrency(candidates, 8, async (name) => {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(name)}?limit=0`;
    let res;
    try {
      res = await request({
        url,
        anonKey: config.anonKey,
        headers: { Prefer: "count=exact" },
        timeoutMs: 5000,
      });
    } catch {
      return null;
    }

    if (res.status === 404) return null; // Definitively doesn't exist.
    if (res.status >= 500) return null; // Server error — uncertain.
    if (res.status === 200 || res.status === 401 || res.status === 403) {
      return { schema: "public", name };
    }
    return null;
  });

  return results.filter((t): t is Table => t !== null);
}

/**
 * Discover storage buckets via the Storage API list endpoint.
 * Anon role can list buckets by default in most Supabase projects.
 */
export async function discoverBuckets(config: Config): Promise<Bucket[]> {
  const url = `${config.url.replace(/\/$/, "")}/storage/v1/bucket`;
  let res;
  try {
    res = await request({ url, anonKey: config.anonKey, timeoutMs: 10000 });
  } catch {
    return [];
  }

  if (res.status === 401 || res.status === 403) return [];
  if (!res.ok) return [];

  let data: unknown;
  try {
    data = res.json();
  } catch {
    return [];
  }

  if (!Array.isArray(data)) return [];

  return data
    .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
    .map((b) => ({
      id: String(b.id ?? b.name ?? ""),
      name: String(b.name ?? ""),
      public: Boolean(b.public),
      createdAt: typeof b.created_at === "string" ? b.created_at : null,
    }))
    .filter((b) => b.name !== "");
}
