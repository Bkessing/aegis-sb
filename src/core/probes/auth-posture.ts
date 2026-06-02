import { request } from "../http.js";
import type { Finding, ScanContext } from "../types.js";

/**
 * Detect the project's auth posture using only the anon key.
 *
 * The most underestimated mistake in vibe-coded Supabase apps:
 *
 *   Many projects ship with **anonymous signups enabled** AND policies like
 *   `USING (auth.uid() IS NOT NULL)`. Anyone on the internet can sign up,
 *   immediately becomes "authenticated", and the policy lets them read /
 *   write everything that role is allowed to touch. Effectively no RLS.
 *
 * We can't enumerate policies with the anon key, but we CAN tell whether
 * signups are open. If they are, we surface a WARN so the user explicitly
 * decides: was this intentional? (Yes for social apps. No for most others.)
 *
 * Detection: POST an obviously-invalid payload to /auth/v1/signup.
 *   - `signup_disabled` / similar → no finding
 *   - validation error                → signups are enabled → WARN
 *
 * We never actually create an account. The probe is read-only in practice.
 */
export async function probeAuthPosture(ctx: ScanContext): Promise<Finding[]> {
  const url = `${ctx.config.url.replace(/\/$/, "")}/auth/v1/signup`;

  let res;
  try {
    res = await request({
      url,
      anonKey: ctx.config.anonKey,
      method: "POST",
      body: { email: "", password: "" },
      timeoutMs: 8000,
    });
  } catch {
    return [];
  }

  let body: Record<string, unknown> | null = null;
  try {
    const parsed = res.json();
    if (typeof parsed === "object" && parsed !== null) {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    return [];
  }

  if (!body) return [];

  // Supabase Auth surfaces a couple of distinct error shapes depending on
  // the GoTrue version. We look at the explicit code first, then at the
  // human-readable message as a fallback.
  const code = stringField(body, "code") ?? stringField(body, "error_code");
  const message =
    stringField(body, "message") ?? stringField(body, "msg") ?? stringField(body, "error") ?? "";
  const messageLower = message.toLowerCase();

  const signupsExplicitlyDisabled =
    code === "signup_disabled" ||
    code === "signups_disabled" ||
    messageLower.includes("signup is disabled") ||
    messageLower.includes("signups not allowed") ||
    messageLower.includes("signups are disabled");

  if (signupsExplicitlyDisabled) {
    return [];
  }

  // Validation error or general 4xx/5xx response: signups are on.
  // (If the endpoint were locked entirely, we'd get a 401/403 from PostgREST
  // rather than a structured auth error.)
  const looksLikeAuthEndpoint =
    code !== undefined ||
    messageLower.includes("password") ||
    messageLower.includes("email") ||
    res.status === 422 ||
    res.status === 400;

  if (!looksLikeAuthEndpoint) return [];

  return [
    {
      id: "auth-signups-open",
      severity: "warn",
      title: "Anonymous signups are enabled",
      description:
        "Anyone on the internet can call /auth/v1/signup, create an account, and immediately " +
        "become an `authenticated` user. Combined with the common mistake of writing RLS policies " +
        "as `USING (auth.uid() IS NOT NULL)` instead of `USING (auth.uid() = owner_id)`, this means " +
        "any attacker reads or writes everything that policy allows. " +
        "If this is intentional (social app, public signup product), keep it but audit every " +
        "policy on every table to make sure they enforce ownership / membership — not just " +
        "any logged-in user.",
      evidence: { endpoint: "/auth/v1/signup", responseStatus: res.status, responseCode: code },
      fixPrompt:
        "In my Supabase project, anonymous signups at /auth/v1/signup are enabled. " +
        "Help me decide whether to keep them open by:\n" +
        "1. Listing my use case (am I building a social app where any signup is allowed, " +
        "or an internal/B2B app where signups should be invite-only?)\n" +
        "2. If invite-only: disable anonymous signups in the Supabase dashboard under " +
        "Authentication → Sign In / Up → 'Allow new users to sign up'.\n" +
        "3. If open signups are intentional: audit every RLS policy on every table to make sure " +
        "policies enforce row ownership (e.g., `USING (auth.uid() = owner_id)`) and NOT just " +
        "'any authenticated user' (e.g., `USING (auth.uid() IS NOT NULL)`).",
      reference: "https://supabase.com/docs/guides/auth/auth-anonymous#disable-anonymous-sign-ins",
    },
  ];
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}
