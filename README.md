# aegis-sb

> **The agent-native Supabase guardian.** Your AI built the backend. Your AI can also check it before it leaks data.

[![npm](https://img.shields.io/npm/v/aegis-sb.svg)](https://www.npmjs.com/package/aegis-sb)
[![license](https://img.shields.io/npm/l/aegis-sb.svg)](LICENSE)

Every other Supabase scanner runs once when a human types a command. **aegis-sb runs every time your AI agent touches Supabase** — through Cursor, Claude Code, Cline, Continue, Windsurf, or any MCP-compatible client. Three distribution surfaces, one engine, anon-key only (never asks for `service_role`).

When AI tools (Cursor, Lovable, Bolt, Replit AI) generate a Supabase backend, they ship with defaults that leak data:

- Tables readable by anyone with the public anon key
- Tables writable by anyone with the anon key
- Storage buckets configured public
- Open signups paired with `auth.uid() IS NOT NULL` policies → anyone can sign up + read everything
- Wrong-key mistakes (the dev pastes `service_role` thinking it's `anon`)
- **`service_role` accidentally committed to the public frontend bundle**

[Symbiotic Security's January 2026 study](https://www.symbioticsec.ai/blog/vibe-coding-is-not-secured-by-default-what-a-new-study-tells-us-about-ai-generated-code) found only 10.5% of AI-generated code passes both functional and security tests — 8 out of 10 "working" patches ship with vulnerabilities. Their separate [Lovable scan](https://www.symbioticsec.ai/blog/lovable-vulnerability-scanner) found the same pattern in deployed apps.

aegis-sb catches the canonical patterns and feeds your AI agent paste-ready fix prompts.

## Three surfaces, pick yours

### 1. CLI (`npx aegis-sb`)

```bash
npx aegis-sb https://your-project.supabase.co --key eyJhbG...
```

One command, no install. Output modes: text (default), `--json` (CI), `--md` (PR comments). Exit 1 on critical findings (`--no-fail` to override).

**Frontend mode** — give it a deployed URL, it finds the credentials for you:

```bash
npx aegis-sb frontend https://my-app.lovable.app
```

Fetches the deployed page + linked bundles, regex-extracts the Supabase URL and JWT shipped to every visitor, then runs the standard scan. If it finds `service_role` in the public bundle, that's an immediate critical finding.

### 2. MCP server (autonomous agent invocation)

```bash
npx aegis-sb mcp install
```

Auto-configures `aegis-sb-mcp` into both Claude Code (`~/.claude/.mcp.json`) and Cursor (`~/.cursor/mcp.json`). Restart your editor; agents now call `scan_supabase` autonomously when context matches.

Manual install (Claude Code shown):

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

The tool description triggers on Supabase / RLS / deploy / production context, so your agent invokes it without you asking.

### 3. Claude Code skill (proactive triggers)

```bash
npx aegis-sb skill install
```

Installs to `~/.claude/skills/aegis-sb/`. Claude loads it at session start and triggers proactively when you're working on Supabase. Uses the MCP tool when configured, falls back to the CLI.

To remove: `npx aegis-sb skill uninstall`.

### 4. GitHub Action (CI gate)

```yaml
- uses: Bkessing/aegis-sb@v0.4.0
  with:
    url: https://${{ secrets.SUPABASE_PROJECT_REF }}.supabase.co
    anon-key: ${{ secrets.SUPABASE_ANON_KEY }}
    fail-on: critical          # or 'warn' or 'none'
    comment-on-pr: true        # sticky PR comment with findings
```

Findings post to the workflow Summary tab and (on PRs) as a sticky comment. Configurable severity threshold.

## What it scans for (v0.4)

| Probe | Severity | What it catches |
|---|---|---|
| **JWT role** | critical | You pasted `service_role` thinking it was `anon` |
| **Anonymous read** | critical | Anon can `SELECT *` on a table and see rows |
| **Anonymous write** | critical | Anon can `INSERT` into a table |
| **Public storage buckets** | warn | Storage bucket configured `public: true` |
| **Auth posture** | warn | Open signups detected — combined with broad `auth.uid() IS NOT NULL` policies, anyone can sign up and access data |

Each finding includes a paste-ready fix prompt for Cursor / Claude / Lovable.

## Discovery — wordlist + tool presets

Supabase locks `/rest/v1/` (the OpenAPI spec endpoint) to the `service_role` key as of mid-2026. **The anon key cannot enumerate tables.** aegis-sb uses one of three paths:

1. **Built-in wordlist** (default) — probes ~80 common vibe-coder table names.
2. **`--profile <name>`** — adds tool-specific table-name presets. Available: `lovable`, `bolt`, `v0`, `replit`, `cursor`. Combinable: `--profile lovable,bolt`.
3. **`--tables a,b,c`** — explicit list of your project's table names. Use when your schema is fully custom.

## What this tool does NOT do

aegis-sb refuses to:

- Phone home (zero telemetry)
- Send data to a hosted service
- Ask for your `service_role` key (ever)
- Run silently — you see every request

Out-of-scope today (paid v0.5+ roadmap):

- Stripe webhook reliability
- JWT claim spoofing tests
- Client-side gating bypass detection (deeper than the auth-posture probe)
- Supabase cost / egress guards
- Postgres N+1 / performance probes
- **Continuous monitoring + WAL backups + agent-edit undo** (the Replit-nuke-your-database fix — the headline paid feature)

"No findings" today means "no findings in the v0.4 probe set" — not comprehensively secure.

## Roadmap

- **v0.1** — CLI with 4 probes ✓
- **v0.2** — MCP server (cross-agent distribution) ✓
- **v0.3** — Claude Code skill (proactive triggers) ✓
- **v0.4** — Auth posture probe · MCP installer · markdown output · GitHub Action · frontend bundle scanner · tool profiles ✓
- **v0.5+** — Paid hosted tier: continuous monitoring, drift alerts, WAL backups, **agent-edit undo**

## License

MIT © Brandon Kessinger

## Follow along

- Repo: https://github.com/Bkessing/aegis-sb
- npm: https://www.npmjs.com/package/aegis-sb
- Built in public by [@KessingerBuilds](https://x.com/KessingerBuilds)
