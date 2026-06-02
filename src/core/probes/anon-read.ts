import { request, runWithConcurrency } from "../http.js";
import type { Finding, ScanContext } from "../types.js";

/**
 * For each discovered table, attempt SELECT * with anon key.
 *
 * - HTTP 200 with rows         → CRITICAL: anon can read data.
 * - HTTP 200 with empty array  → no finding. Could mean the table is empty,
 *                                or RLS correctly hides all rows from anon.
 *                                Both look identical from anon's POV; we
 *                                cannot distinguish without service_role,
 *                                and false-flagging well-configured tables
 *                                is the fastest way to lose user trust.
 * - HTTP 401/403               → no finding. RLS blocks anon as it should.
 * - Other                      → no finding.
 */
export async function probeAnonRead(ctx: ScanContext): Promise<Finding[]> {
  const baseUrl = ctx.config.url.replace(/\/$/, "");

  const results = await runWithConcurrency(ctx.tables, 5, async (table) => {
    const url = `${baseUrl}/rest/v1/${encodeURIComponent(table.name)}?select=*&limit=5`;
    let res;
    try {
      res = await request({
        url,
        anonKey: ctx.config.anonKey,
        headers: { Prefer: "count=exact" },
        timeoutMs: 10000,
      });
    } catch {
      return null;
    }

    if (!res.ok) return null;

    let rows: unknown[] = [];
    try {
      const parsed = res.json();
      if (Array.isArray(parsed)) rows = parsed;
    } catch {
      return null;
    }

    if (rows.length === 0) {
      // Indistinguishable from "RLS blocks all rows for anon" — do not flag.
      return null;
    }

    const totalCount = parseContentRangeTotal(res.headers.get("content-range"));
    const sampleColumns = sampleColumnNames(rows);

    return {
      id: "anon-table-readable",
      severity: "critical" as const,
      title: `Table \`${table.name}\` is readable by anyone with the anon key`,
      description:
        `An anonymous request to \`${table.name}\` returned ${rows.length} row(s)` +
        (totalCount !== null ? ` (${totalCount} total)` : "") +
        `. ` +
        (sampleColumns.length > 0 ? `Visible columns: ${sampleColumns.join(", ")}. ` : "") +
        `The anon key — which ships in your frontend bundle — can read this table. ` +
        `If RLS is enabled, it has no SELECT policy for anon (or a permissive one). ` +
        `If RLS is disabled, every row is public.`,
      resource: table.name,
      evidence: { rowsReturned: rows.length, totalRows: totalCount, sampleColumns },
      fixPrompt: rlsFixPrompt(table.name),
      reference: "https://supabase.com/docs/guides/database/postgres/row-level-security",
    };
  });

  return results.filter((f): f is Finding => f !== null);
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const match = /\/(\d+|\*)$/.exec(header);
  if (!match) return null;
  const value = match[1]!;
  if (value === "*") return null;
  return Number.parseInt(value, 10);
}

function sampleColumnNames(rows: unknown[]): string[] {
  for (const row of rows) {
    if (typeof row === "object" && row !== null) {
      return Object.keys(row).slice(0, 8);
    }
  }
  return [];
}

function rlsFixPrompt(table: string): string {
  return (
    `In my Supabase project, the table \`${table}\` is readable by the anonymous role. ` +
    `Add a Postgres migration that:\n` +
    `1. Enables Row Level Security on \`${table}\`.\n` +
    `2. Adds an "owner-only read" SELECT policy that requires \`auth.uid()\` to match the row's owner column ` +
    `(or restricts SELECT to authenticated users, depending on the table's intent).\n` +
    `3. Verifies no permissive policy already exists by listing \`pg_policies\` for the table before changes.`
  );
}
