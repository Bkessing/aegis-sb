import { request } from "../http.js";
import type { Finding, ScanContext } from "../types.js";

/**
 * Detect the project's auth posture using only the anon key.
 *
 * Common mistake: open anonymous signups + `USING (auth.uid() IS NOT NULL)`
 * policies. Anyone signs up, becomes "authenticated", and the policy lets
 * them read/write everything. We surface a WARN so the user explicitly
 * decides whether open signups are intentional and whether their policies
 * enforce ownership.
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

  if (signupsExplicitlyDisabled) return [];

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
        "Anyone can sign up via `/auth/v1/signup` and immediately get the `authenticated` role. " +
        "If any RLS policy on any table is just `USING (auth.uid() IS NOT NULL)` instead of an ownership " +
        "check, every signed-up user reads or writes data through it. " +
        "Intentional for social apps. Worth a closer look for everything else.",
      evidence: { endpoint: "/auth/v1/signup", responseStatus: res.status, responseCode: code },
      fixPrompt:
        "In my Supabase project, anonymous signups at /auth/v1/signup are enabled. " +
        "Tell me:\n" +
        "1. Is this intentional? (social app vs invite-only)\n" +
        "2. If invite-only: disable in dashboard under Authentication → Sign In / Up.\n" +
        "3. If open: audit every RLS policy — replace `auth.uid() IS NOT NULL` with " +
        "`auth.uid() = owner_id` or equivalent ownership check.",
      reference: "https://supabase.com/docs/guides/auth/auth-anonymous#disable-anonymous-sign-ins",
    },
  ];
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" ? v : undefined;
}
