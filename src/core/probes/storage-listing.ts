import { request, runWithConcurrency } from "../http.js";
import type { Finding, ScanContext } from "../types.js";

/**
 * For each discovered bucket, attempt to LIST objects as anon.
 *
 * The existing `public-buckets` probe catches buckets configured with
 * `public: true` — but that flag only controls whether each object's URL
 * is publicly retrievable. A separate Storage policy controls whether the
 * `storage.objects` table can be queried.
 *
 * Common misconfig: bucket is `public: false` (so the developer thinks
 * files are private) but the `storage.objects` SELECT policy allows
 * `anon` to list everything. Result: the anon role can fetch the full
 * file directory and then construct public URLs for each one. Even if
 * `public: false` requires an authenticated retrieval, the inventory leak
 * itself is meaningful (file names often encode user IDs, customer names,
 * project titles).
 *
 * Severity:
 *   - bucket private (public:false) + listable → CRITICAL
 *   - bucket public (public:true)  + listable → WARN (compounds the
 *     existing public-bucket finding — anon doesn't have to guess paths)
 */
export async function probeStorageListing(ctx: ScanContext): Promise<Finding[]> {
  const baseUrl = ctx.config.url.replace(/\/$/, "");

  const results = await runWithConcurrency(ctx.buckets, 5, async (bucket) => {
    const url = `${baseUrl}/storage/v1/object/list/${encodeURIComponent(bucket.name)}`;
    let res;
    try {
      res = await request({
        url,
        anonKey: ctx.config.anonKey,
        method: "POST",
        body: { prefix: "", limit: 5, sortBy: { column: "name", order: "asc" } },
        timeoutMs: 8000,
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;

    let objects: Array<{ name?: unknown }> = [];
    try {
      const parsed = res.json();
      if (Array.isArray(parsed)) objects = parsed as Array<{ name?: unknown }>;
    } catch {
      return null;
    }

    if (objects.length === 0) return null;

    const sample = objects
      .map((o) => (typeof o.name === "string" ? o.name : null))
      .filter((n): n is string => n !== null)
      .slice(0, 5);

    const isPublic = bucket.public;
    const severity = isPublic ? "warn" : "critical";

    return {
      id: isPublic ? "storage-public-bucket-listable" : "storage-private-bucket-listable",
      severity,
      title: isPublic
        ? `Bucket \`${bucket.name}\` is public AND fully enumerable by anon`
        : `Bucket \`${bucket.name}\` is private but anon can list every object in it`,
      description: isPublic
        ? `Anon can call \`/storage/v1/object/list/${bucket.name}\` and receive the full file directory. ` +
          `Combined with this bucket's \`public: true\` setting (already flagged), an attacker doesn't ` +
          `need to guess file paths — they enumerate everything. Sample: ${sample.join(", ") || "(parsed)"}.`
        : `Anon can call \`/storage/v1/object/list/${bucket.name}\` and receive a file directory listing ` +
          `even though the bucket is marked \`public: false\`. File names often leak user IDs, customer names, ` +
          `or project titles. Even if retrieving each file separately requires auth, the inventory itself is ` +
          `a leak. Sample paths: ${sample.join(", ") || "(parsed)"}.`,
      resource: bucket.name,
      evidence: { bucket: bucket.name, public: bucket.public, sampleObjects: sample },
      fixPrompt: storageFixPrompt(bucket.name, isPublic),
      reference: "https://supabase.com/docs/guides/storage/security/access-control",
    };
  });

  return results.filter((f): f is Finding => f !== null);
}

function storageFixPrompt(bucket: string, isPublic: boolean): string {
  return (
    `In my Supabase project, the storage bucket \`${bucket}\`'s objects can be LISTED by the anonymous role. ` +
    (isPublic
      ? `The bucket is also public, so each object's URL is fetchable too. `
      : `The bucket is private, but the SELECT policy on \`storage.objects\` lets anon enumerate file names. `) +
    `Add a Postgres migration that:\n` +
    `1. Reviews policies on \`storage.objects\` for this bucket via ` +
    `\`SELECT * FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects';\`.\n` +
    `2. Replaces any SELECT policy that targets the \`anon\` role (or \`PUBLIC\`) with one that requires ` +
    `\`auth.role() = 'authenticated'\` AND a per-row ownership check (e.g., \`auth.uid()::text = (storage.foldername(name))[1]\`).\n` +
    `3. Verifies the fix by re-running the list endpoint as anon.`
  );
}
