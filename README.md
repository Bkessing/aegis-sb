# aegis-sb

> **The agent-native Supabase guardian.** Your AI built the backend. Your AI can also check it before it leaks data.

[![npm](https://img.shields.io/npm/v/aegis-sb.svg)](https://www.npmjs.com/package/aegis-sb)
[![license](https://img.shields.io/npm/l/aegis-sb.svg)](LICENSE)

Every other Supabase scanner runs once when a human types a command. **aegis-sb runs every time your AI agent touches Supabase** — through Cursor, Claude Code, Cline, Continue, Windsurf, or any MCP-compatible client. Three distribution surfaces, one engine, anon-key only (never asks for `service_role`).

When AI tools (Cursor, Lovable, Bolt, Replit AI) generate a Supabase backend, they ship with defaults that leak data:

- Tables readable by anyone with the public anon key
- Tables writable by anyone with the anon key
- Storage buckets configured public
- Wrong-key mistakes (the dev pastes `service_role` thinking it's `anon`)

[Symbiotic Security found 98% of vibe-coded Supabase apps had at least one critical hole.](https://www.symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws)

aegis-sb catches the canonical patterns and feeds your AI agent paste-ready fix prompts.

## Three surfaces, pick yours

### 1. CLI (`npx aegis-sb`)

```bash
npx aegis-sb https://your-project.supabase.co --key eyJhbG...
```

One command, no install. Pipe `--json` for CI. Exit 1 on critical findings (`--no-fail` to override).

### 2. MCP server (autonomous agent invocation)

Wire `aegis-sb-mcp` into Claude Code, Cursor, Cline, Continue, or Windsurf. The agent calls `scan_supabase` autonomously when context matches (modifying RLS, deploying to production, "is my Supabase secure").

**Claude Code:** add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "aegis-sb": {
      "command": "npx",
      "args": ["-y", "aegis-sb-mcp"]
    }
  }
}
```

**Cursor:** Settings → MCP → Add Server → command `npx -y aegis-sb-mcp`.

The tool description triggers on Supabase / RLS / deploy / production context, so your agent invokes it without you asking.

### 3. Claude Code skill (proactive triggers)

```bash
npx aegis-sb skill install
```

Installs to `~/.claude/skills/aegis-sb/`. Claude loads it at session start and triggers proactively when you're working on Supabase. Uses the MCP tool when configured, falls back to the CLI.

To remove: `npx aegis-sb skill uninstall`.

## What it scans for (v0.3)

| Probe | Severity | What it catches |
|---|---|---|
| **JWT role** | critical | You pasted `service_role` thinking it was `anon` |
| **Anonymous read** | critical | Anon can `SELECT *` on a table and see rows |
| **Anonymous write** | critical | Anon can `INSERT` into a table |
| **Public storage buckets** | warn | Storage bucket configured `public: true` |

Each finding includes a paste-ready fix prompt for Cursor / Claude / Lovable.

## Discovery: why your URL alone isn't enough

Supabase locks `/rest/v1/` (the OpenAPI spec endpoint) to the `service_role` key as of mid-2026. **The anon key cannot enumerate tables.** aegis-sb uses one of two paths:

1. **Built-in wordlist** (default) — probes ~80 common vibe-coder table names (`users`, `posts`, `messages`, `cards`, `subscriptions`, ...). Cheap (~50 requests, ~3 seconds).
2. **`--tables a,b,c`** — explicit list of your project's table names. Use when your schema is custom.

## What this tool does NOT do

aegis-sb refuses to:

- Phone home (zero telemetry)
- Send data to a hosted service
- Ask for your `service_role` key (ever)
- Run silently — you see every request

Out-of-scope today (roadmap):

- Stripe webhook reliability (v0.4)
- JWT claim spoofing tests (v0.4)
- Client-side gating bypass detection (v0.4)
- Supabase cost / egress guards (v0.4)
- Postgres N+1 / performance probes (v0.4)
- **Agent-edit undo + WAL backups** (v0.4 — the headline paid feature)

"No findings" today means "no findings in the v0.3 probe set" — not comprehensively secure.

## Roadmap

- **v0.1** — CLI with 4 probes ✓
- **v0.2** — MCP server (cross-agent distribution) ✓
- **v0.3** — Claude Code skill (proactive triggers) ✓
- **v0.4+** — Paid hosted tier: continuous monitoring, drift alerts, WAL backups, **agent-edit undo** (the Replit-nuke-your-database fix)

## License

MIT © Brandon Kessinger

## Follow along

- Repo: https://github.com/Bkessing/aegis-sb
- npm: https://www.npmjs.com/package/aegis-sb
- Built in public by [@KessingerBuilds](https://x.com/KessingerBuilds)
