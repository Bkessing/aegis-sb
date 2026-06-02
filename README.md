# aegis-sb

> Supabase security guardian. Audits a Supabase project for the security holes that ship by default when AI builds your app.

**Status: v0.0.1 — name reservation. Real functionality lands in v0.1.**

When an AI tool (Cursor, Lovable, Bolt, Replit AI) generates a Supabase backend, it ships with defaults that leak data:

- Tables readable by anyone with the public anon key
- RLS disabled on production tables
- Storage buckets configured public
- Client-side gating on paid features
- No backups before destructive agent edits

[Symbiotic Security found 98% of vibe-coded Supabase apps had at least one critical hole.](https://www.symbioticsec.ai/blog/we-scanned-1-072-vibe-coded-apps-98-had-security-flaws)

`aegis-sb` scans for the canonical issues and gives you paste-to-Cursor fix prompts. No service-role key required — works with the public anon key your frontend already has.

## Roadmap

- **v0.0.1** _(current)_ — package name reservation
- **v0.1** — CLI with 4 core probes (anon-key reads, anon-key writes, RLS-off tables, public storage buckets)
- **v0.2** — MCP server (Cursor, Claude Code, Cline, Windsurf, Continue)
- **v0.3** — Claude skill (proactive scans before deploy)
- **v0.4+** — Paid watchdog tier (continuous monitoring, WAL backups, agent-edit undo)

## Install (works in v0.1)

```bash
npx aegis-sb <your-project-url> --key <anon-key>
```

The anon key is the one already in your frontend bundle — public-by-design. No service-role key is asked for in any version.

## What this tool does NOT do

- Does not require an account on a hosted service
- Does not phone home or send telemetry
- Does not ask for your service-role key (ever)
- Source code is MIT — read it yourself

## License

MIT © Brandon Kessinger

## Follow along

[@KessingerBuilds on X](https://x.com/KessingerBuilds) — building this in public.
