import { request, runWithConcurrency } from "../http.js";
import type { Finding, ScanContext } from "../types.js";

/**
 * For each discovered table, attempt INSERT with the anon key.
 *
 * We post an empty body, which will fail validation on most tables — but the
 * KIND of failure tells us about the auth posture:
 *
 * - 201 Created → CRITICAL: anon successfully wrote. Try to delete it back.
 * - 400/422 (validation error) → CRITICAL: write was authorized but the
 *   payload was rejected. A real attacker would craft a valid payload.
 * - 401/403 → no finding (RLS / role blocks anon write).
 * - Other → no finding.
 */
export async function probeAnonWrite(ctx: ScanContext): Promise<Finding[]> {
  const baseUrl = ctx.config.url.replace(/\/$/, "");

  const results = await runWithConcurrency(ctx.tables, 5, async (table) => {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(table.name)}`;
    const res = await request({
      url,
      anonKey: ctx.config.anonKey,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {},
      timeoutMs: 10000,
    });

    if (res.status === 201 || res.status === 200) {
      // Best-effort cleanup of any row we just created.
      await attemptCleanup(baseUrl, ctx.config.anonKey, table.name, res);
      return writeFinding({ table: table.name, kind: "succeeded" });
    }

    if (res.status === 400 || res.status === 422) {
      // PostgREST returns these when the row failed validation (NOT NULL,
      // FK, type errors) but auth would have allowed the write.
      return writeFinding({ table: table.name, kind: "validation-only" });
    }

    return null;
  });

  return results.filter((f): f is Finding => f !== null);
}

async function attemptCleanup(
  baseUrl: string,
  anonKey: string,
  table: string,
  insertRes: { headers: Headers; text: string },
): Promise<void> {
  try {
    const parsed = JSON.parse(insertRes.text);
    if (!Array.isArray(parsed) || parsed.length === 0) return;
    const row = parsed[0];
    if (typeof row !== "object" || row === null) return;
    if (!("id" in row) || row.id === null || row.id === undefined) return;

    const url = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(String(row.id))}`;
    await request({
      url,
      anonKey,
      method: "DELETE",
      timeoutMs: 5000,
    });
  } catch {
    // Best-effort. If cleanup fails, the row stays — but that's an even
    // stronger signal of misconfiguration that we already flagged above.
  }
}

interface WriteFindingArgs {
  table: string;
  kind: "succeeded" | "validation-only";
}

function writeFinding(args: WriteFindingArgs): Finding {
  const { table, kind } = args;

  if (kind === "succeeded") {
    return {
      id: "anon-table-writable",
      severity: "critical",
      title: `Table \`${table}\` accepts writes from the anon key`,
      description:
        `An anonymous INSERT into \`${table}\` succeeded (HTTP 201). ` +
        `Anyone with the anon key — which ships in your frontend bundle — can write rows to this table. ` +
        `aegis-sb attempted to delete the inserted row, but its presence may persist if cleanup also failed.`,
      resource: table,
      evidence: { method: "POST", status: 201 },
      fixPrompt: writeFixPrompt(table),
      reference: "https://supabase.com/docs/guides/database/postgres/row-level-security",
    };
  }

  return {
    id: "anon-table-writable-authz",
    severity: "critical",
    title: `Table \`${table}\` accepts anon write requests (payload was rejected by validation)`,
    description:
      `An anonymous INSERT into \`${table}\` was authorized by RLS but rejected by row validation ` +
      `(NOT NULL, FK, or type constraints). The auth layer let the request through — ` +
      `a real attacker would simply craft a valid payload. RLS does not block this write.`,
    resource: table,
    evidence: { method: "POST", status: "400/422" },
    fixPrompt: writeFixPrompt(table),
    reference: "https://supabase.com/docs/guides/database/postgres/row-level-security",
  };
}

function writeFixPrompt(table: string): string {
  return (
    `In my Supabase project, the table \`${table}\` accepts INSERT from the anonymous role. ` +
    `Add a Postgres migration that:\n` +
    `1. Enables Row Level Security on \`${table}\` (if not already enabled).\n` +
    `2. Removes any INSERT policy that allows the anon role.\n` +
    `3. If anonymous inserts are intentional (e.g., a "contact us" form), replace the policy with one that ` +
    `enforces specific column-level constraints (e.g., \`WITH CHECK (length(email) < 200 AND created_at = now())\`).`
  );
}
