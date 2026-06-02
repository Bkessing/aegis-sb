import type { Finding, ScanContext } from "../types.js";

/**
 * Flag any storage bucket configured as `public: true`.
 *
 * Public buckets serve their contents to anyone with the URL — no auth, no
 * RLS, no rate limit beyond Supabase's defaults. This is sometimes
 * intentional (avatars, marketing assets) and sometimes a security hole
 * (user uploads, private files). We surface as WARN, not CRITICAL, because
 * intent is project-specific.
 */
export async function probePublicBuckets(ctx: ScanContext): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const bucket of ctx.buckets) {
    if (!bucket.public) continue;

    findings.push({
      id: "public-storage-bucket",
      severity: "warn",
      title: `Storage bucket \`${bucket.name}\` is public`,
      description:
        `The bucket \`${bucket.name}\` is configured with \`public: true\`. ` +
        `Every object in this bucket is readable by anyone with its URL — no authentication, no RLS, no per-file policy. ` +
        `If the bucket holds user uploads, screenshots, or PDFs that should be private, this is a leak. ` +
        `If it holds public assets (logos, marketing images), this is intentional.`,
      resource: bucket.name,
      evidence: { bucket: bucket.name, public: true },
      fixPrompt: publicBucketFixPrompt(bucket.name),
      reference: "https://supabase.com/docs/guides/storage/security/access-control",
    });
  }

  return findings;
}

function publicBucketFixPrompt(bucket: string): string {
  return (
    `In my Supabase project, the storage bucket \`${bucket}\` is set to public. ` +
    `If this is intentional (e.g., logos or marketing assets), confirm and ignore. ` +
    `If it is unintentional:\n` +
    `1. Update the bucket via the Storage UI or \`UPDATE storage.buckets SET public = false WHERE name = '${bucket}'\`.\n` +
    `2. Add storage policies that allow \`SELECT\` only to authenticated users (or owners of each file) via the \`storage.objects\` table.\n` +
    `3. Audit recent access logs to estimate exposure.`
  );
}
