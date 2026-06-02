import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFindings } from "./core/format.js";
import { runScan } from "./core/scanner.js";
import { installSkill, uninstallSkill } from "./skill-installer.js";

interface CliArgs {
  url?: string;
  key?: string;
  licenseKey?: string;
  tables?: string[];
  json?: boolean;
  noColor?: boolean;
  noFail?: boolean;
  quiet?: boolean;
  help?: boolean;
  version?: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--version" || arg === "-v") args.version = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--no-color") args.noColor = true;
    else if (arg === "--no-fail") args.noFail = true;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--key" || arg === "--anon-key") args.key = argv[++i];
    else if (arg === "--license-key") args.licenseKey = argv[++i];
    else if (arg === "--tables") {
      const value = argv[++i];
      args.tables = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (!arg.startsWith("-") && !args.url) args.url = arg;
  }
  return args;
}

function helpText(): string {
  return `aegis-sb — Supabase security guardian

Audits a Supabase project for the security holes that ship by default when
AI builds your app. Uses only the public anon key — never the service-role.

Usage:
  npx aegis-sb <project-url> --key <anon-key> [options]

Arguments:
  <project-url>         Supabase project URL (or env: SUPABASE_URL)

Subcommands:
  skill install         Install the Claude Code skill to ~/.claude/skills/
  skill uninstall       Remove the Claude Code skill

Options:
  --key <anon-key>      Anon key (or env: SUPABASE_ANON_KEY)
  --license-key <key>   License key (reserved for v0.4+ paid features)
  --tables <names>      Comma-separated table names to scan. Overrides the
                        built-in wordlist of common vibe-coder table names.
                        Use when your app has non-standard table names.
  --json                Machine-readable JSON output
  --no-color            Disable ANSI colors
  --no-fail             Always exit 0 (default: exit 1 on critical findings)
  --quiet               Suppress non-finding output
  --help, -h            Show this help
  --version, -v         Show version

Discovery:
  Supabase locks /rest/v1/ (OpenAPI spec) to the service_role key. aegis-sb
  uses only the public anon key, so it cannot enumerate tables. Instead it
  probes a built-in wordlist of common table names (users, posts, messages,
  ...). Pass --tables to override with your project's specific table names.

Examples:
  npx aegis-sb https://abc123.supabase.co --key eyJhbG...
  npx aegis-sb https://abc.supabase.co --key eyJ... --tables users,posts,orders
  SUPABASE_URL=... SUPABASE_ANON_KEY=... npx aegis-sb --json > scan.json

Find your URL + anon key in your Supabase dashboard: Settings → API.

Brandon Kessinger · MIT · https://github.com/Bkessing/aegis-sb`;
}

function getVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string };
    return pkg.version;
  } catch {
    return "(unknown)";
  }
}

async function handleSkillSubcommand(argv: string[]): Promise<void> {
  const action = argv[0];
  if (action === "install") {
    await installSkill();
    return;
  }
  if (action === "uninstall") {
    await uninstallSkill();
    return;
  }
  process.stdout.write(
    "aegis-sb skill — manage the Claude Code skill\n\n" +
      "Usage:\n" +
      "  npx aegis-sb skill install     Install skill to ~/.claude/skills/aegis-sb\n" +
      "  npx aegis-sb skill uninstall   Remove the skill\n",
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === "skill") {
    await handleSkillSubcommand(argv.slice(1));
    return;
  }

  const args = parseArgs(argv);

  if (args.help) {
    console.log(helpText());
    return;
  }

  if (args.version) {
    console.log(getVersion());
    return;
  }

  const url = args.url ?? process.env.SUPABASE_URL;
  const key = args.key ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    process.stderr.write(
      "Error: project URL and anon key required.\n\n" +
        "Pass them as args:    npx aegis-sb <url> --key <anon-key>\n" +
        "Or set environment:   SUPABASE_URL=... SUPABASE_ANON_KEY=... npx aegis-sb\n\n" +
        "Run --help for more.\n",
    );
    process.exit(2);
  }

  try {
    if (!args.quiet) {
      process.stderr.write("Scanning…\n");
    }

    const result = await runScan({
      url,
      anonKey: key,
      licenseKey: args.licenseKey,
      tables: args.tables,
      quiet: args.quiet,
    });

    const output = formatFindings(result, {
      json: args.json,
      color: !args.noColor && process.stdout.isTTY,
      quiet: args.quiet,
      projectUrl: url,
    });

    process.stdout.write(output);
    if (!args.json) process.stdout.write("\n");

    const hasCritical = result.findings.some((f) => f.severity === "critical");
    if (hasCritical && !args.noFail) {
      process.exit(1);
    }
  } catch (err) {
    process.stderr.write(`Error: scan failed.\n${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
}

main();
