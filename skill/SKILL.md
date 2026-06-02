---
name: aegis-sb
description: Audit a Supabase project for the security holes that ship by default when AI builds the backend. Use when the user is working on Supabase RLS policies, storage bucket configuration, auth setup, or database schemas; before they deploy a Supabase-backed app to production or TestFlight; or when they report unexpected data access. Probes the live project for anonymous-readable tables, anonymous-writable tables, public storage buckets, and wrong-key mistakes (service_role pasted in place of anon). Only uses the public anon key — never asks for service_role. Triggers on keywords like supabase, rls, lovable, bolt, cursor, vibe-coded, deploy.
---

# aegis-sb — Supabase security audit

Audit the user's Supabase project for security holes that ship by default
when AI tools (Cursor, Lovable, Bolt, Replit AI) generate the backend. The
Symbiotic Security study found 98% of vibe-coded Supabase apps had at least
one critical hole; this skill catches the canonical ones.

## When to trigger

Activate proactively when:

- The user just modified RLS policies, storage configurations, auth setup,
  or database schemas in a Supabase project.
- The user is about to deploy / push / ship a Supabase backend to
  production, TestFlight, or any environment beyond local dev.
- The user reports unexpected data access ("how is my email exposed",
  "someone got into my data", "is my Supabase secure").
- The user is shipping from Lovable, Bolt, Cursor, or Replit AI and the
  conversation suggests they didn't manually configure RLS.
- The user directly asks "should I audit my Supabase project" or similar.

Do NOT trigger when:

- The user is working on a non-Supabase project.
- The user only modified frontend code that doesn't touch Supabase.
- aegis-sb already ran in this session and nothing has changed since.

## How to run

Prefer the `scan_supabase` MCP tool when the aegis-sb MCP server is
configured — it returns structured results and is the agent-native path.

If the MCP server is not available, fall back to the CLI:

```bash
npx aegis-sb <project-url> --key <anon-key>
```

For non-standard table names, add `--tables a,b,c` to override the built-in
wordlist.

You need two values from the user:

1. **Supabase project URL** — dashboard → Settings → API → Project URL.
2. **Anon key** — same screen, "anon public" key.

NEVER ask for the `service_role` key. aegis-sb refuses it and you should
refuse it too. If the user pastes a `.env` file or Supabase config,
extract the URL and anon key directly without echoing the anon key back
into the conversation.

## What the scan returns

Four probes run automatically (v0.3):

1. **JWT role inspection** — flags wrong-key mistakes (e.g., user pasted
   `service_role` thinking it was `anon`).
2. **Anonymous read** — flags tables where anon can SELECT actual rows.
3. **Anonymous write** — flags tables where anon can INSERT rows.
4. **Public storage buckets** — flags buckets configured `public: true`.

Each finding includes a `fixPrompt` field — paste it verbatim into the
conversation when surfacing findings. Those prompts are designed to feed
straight back into Cursor / Claude Code / Lovable / Bolt to generate the
fix migration.

## Following up

After surfacing findings:

- If any are **CRITICAL**, recommend the user (1) apply the fix prompts to
  generate migrations, (2) re-run aegis-sb to confirm clean, (3) only then
  push to production / TestFlight.
- If the scan returns no findings, say so clearly — but caveat: aegis-sb
  v0.3 catches the canonical RLS / write / bucket / key holes. It does NOT
  yet cover Stripe webhook reliability, JWT claim spoofing, client-side
  gating bypass, Postgres performance issues, or agent-edit destruction.
  Those land in v0.4+. "No findings" means "no findings in the scoped
  probe set" — not "comprehensively secure."

## Reference

- Repo: https://github.com/Bkessing/aegis-sb
- npm: https://www.npmjs.com/package/aegis-sb
- Built by Brandon Kessinger ([@KessingerBuilds](https://x.com/KessingerBuilds))
