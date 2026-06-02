import type { Finding, ScanContext } from "../types.js";

/**
 * Decode the supplied anon JWT and inspect its claims.
 *
 * Common mistake: a developer pastes their `service_role` key thinking it's
 * the anon key. The service_role key bypasses RLS entirely — using it on the
 * client (or even leaving it in version control) is catastrophic. We catch
 * this before any other probe runs.
 *
 * We do not verify the JWT signature — we only need the claims for
 * diagnostics. The signature would require Supabase's project JWT secret,
 * which we cannot (and should not) request.
 */
export async function probeJwtRole(ctx: ScanContext): Promise<Finding[]> {
  const claims = decodeJwtClaims(ctx.config.anonKey);
  if (!claims) {
    return [
      {
        id: "anon-key-malformed",
        severity: "warn",
        title: "Supplied anon key is not a valid JWT",
        description:
          "The string passed as the anon key does not parse as a JWT (header.payload.signature). " +
          "Double-check the value — Supabase anon keys always start with `eyJ`.",
      },
    ];
  }

  const findings: Finding[] = [];
  const role = typeof claims.role === "string" ? claims.role : null;

  if (role && role !== "anon") {
    findings.push({
      id: "jwt-role-not-anon",
      severity: "critical",
      title: `Supplied key has role \`${role}\` (expected \`anon\`)`,
      description:
        `The JWT you passed claims role \`${role}\`. The aegis-sb scanner is designed to use the public ` +
        `\`anon\` key only — the one that already ships in your frontend bundle. ` +
        (role === "service_role"
          ? `You passed the \`service_role\` key, which bypasses Row Level Security and grants full database access. ` +
            `If this key is in version control, a deployed frontend, or any environment that's not your local dev shell, ` +
            `rotate it immediately at https://supabase.com/dashboard/project/_/settings/api.`
          : `Rerun the scan with the project's anon key instead.`),
      evidence: { role },
      fixPrompt:
        role === "service_role"
          ? `My Supabase service_role key was used by aegis-sb (and may be exposed elsewhere). ` +
            `Walk me through rotating it: 1) generate a new service_role key in the Supabase dashboard, ` +
            `2) audit every place the old key was used (Edge Functions, env files, deployed backends, version control), ` +
            `3) update each location, 4) revoke the old key.`
          : undefined,
      reference: "https://supabase.com/docs/guides/api/api-keys",
    });
  }

  if (typeof claims.exp === "number") {
    const expiresAt = new Date(claims.exp * 1000);
    const now = Date.now();

    if (claims.exp * 1000 < now) {
      findings.push({
        id: "anon-key-expired",
        severity: "warn",
        title: "Anon key is expired",
        description:
          `The supplied JWT's \`exp\` claim is ${expiresAt.toISOString()} — already in the past. ` +
          `Probes may have run against an unauthenticated session. Regenerate the anon key.`,
        evidence: { exp: claims.exp, expiresAt: expiresAt.toISOString() },
      });
    }
  }

  return findings;
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = base64UrlDecode(parts[1]!);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function base64UrlDecode(s: string): string {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const padding = pad === 0 ? "" : "=".repeat(4 - pad);
  // Node's Buffer handles base64 reliably.
  return Buffer.from(padded + padding, "base64").toString("utf-8");
}
