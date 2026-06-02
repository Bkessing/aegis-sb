import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatFindings } from "./core/format.js";
import { scanFrontend } from "./core/frontend.js";
import { runScan } from "./core/scanner.js";
import { installMcp, uninstallMcp } from "./mcp-installer.js";
import { installSkill, uninstallSkill } from "./skill-installer.js";

interface CliArgs {
  url?: string;
  key?: string;
  licenseKey?: string;
  tables?: string[];
  profiles?: string[];
  readOnly?: boolean;
  json?: boolean;
  md?: boolean;
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
    else if (arg === "--md" || arg === "--markdown") args.md = true;
    else if (arg === "--no-color") args.noColor = true;
    else if (arg === "--no-fail") args.noFail = true;
    else if (arg === "--read-only") args.readOnly = true;
    else if (arg === "--quiet") args.quiet = true;
    else if (arg === "--key" || arg === "--anon-key") args.key = argv[++i];
    else if (arg === "--license-key") args.licenseKey = argv[++i];
    else if (arg === "--tables") {
      const value = argv[++i];
      args.tables = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
    } else if (arg === "--profile") {
      const value = argv[++i];
      args.profiles = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
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
  frontend <url>        Scan a DEPLOYED frontend (Lovable / Vercel / Netlify):
                        extract the shipped Supabase URL + anon JWT from the
                        public bundle, then run the standard scan. Surfaces
                        catastrophic mistakes like service_role in the bundle.
  skill install         Install the Claude Code skill to ~/.claude/skills/
  skill uninstall       Remove the Claude Code skill
  mcp install           Auto-configure MCP server in Claude Code + Cursor
  mcp uninstall         Remove from both MCP configs

Options:
  --key <anon-key>      Anon key (or env: SUPABASE_ANON_KEY)
  --license-key <key>   License key (reserved for v0.4+ paid features)
  --tables <names>      Comma-separated table names to scan. Overrides the
                        built-in wordlist.
  --profile <names>     Add tool-specific table-name presets to the wordlist.
                        Available: lovable, bolt, v0, replit, cursor.
                        Combinable: --profile lovable,bolt
  --read-only           Skip probes that send writes (anon-write, auth-posture).
                        Use when scanning a project you don't own — avoids
                        creating noise in their logs and analytics.
  --json                Machine-readable JSON output
  --md, --markdown      Markdown output (use for PR comments / CI artifacts)
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

async function handleFrontendSubcommand(argv: string[]): Promise<void> {
  const deployedUrl = argv[0];
  if (!deployedUrl || deployedUrl.startsWith("-")) {
    process.stdout.write(
      "aegis-sb frontend — extract Supabase credentials from a deployed app\n\n" +
        "Usage:\n" +
        "  npx aegis-sb frontend <deployed-url> [--json | --md] [--with-writes]\n\n" +
        "Examples:\n" +
        "  npx aegis-sb frontend https://my-app.lovable.app\n" +
        "  npx aegis-sb frontend https://my-app.vercel.app --md\n\n" +
        "Fetches the deployed page + linked JS bundles, extracts any Supabase URL and JWT\n" +
        "shipped to every visitor, then runs the standard scan against the discovered project.\n" +
        "\n" +
        "Frontend mode defaults to read-only (no anon-write / signup probes) since you're\n" +
        "scanning someone else's project. Pass --with-writes if you own it and want the\n" +
        "full probe set.\n" +
        "\n" +
        "If the extracted JWT has `role: service_role`, that is a CRITICAL finding by itself.\n",
    );
    return;
  }

  const wantJson = argv.includes("--json");
  const wantMd = argv.includes("--md") || argv.includes("--markdown");

  process.stderr.write(`Scanning frontend: ${deployedUrl}\n`);
  const discovery = await scanFrontend(deployedUrl);

  if (!discovery.supabaseUrl || !discovery.anonKey) {
    const message =
      `Could not find Supabase credentials in the bundle at ${deployedUrl}.\n` +
      discovery.notes.map((n) => `  - ${n}`).join("\n") +
      (discovery.notes.length > 0 ? "\n" : "") +
      "If the app uses an alternate config loader, pass the URL + key explicitly:\n" +
      "  npx aegis-sb <project-url> --key <anon-key>\n";
    process.stderr.write(message);
    process.exit(2);
  }

  process.stderr.write(
    `Found:\n` +
      `  Supabase URL: ${discovery.supabaseUrl}\n` +
      `  JWT role:     ${discovery.jwtRole ?? "(unknown — could not decode)"}\n` +
      `  Bundles scanned: ${discovery.bundlesScanned}\n` +
      (discovery.otherSupabaseUrls.length > 0
        ? `  Other Supabase URLs found: ${discovery.otherSupabaseUrls.join(", ")}\n`
        : "") +
      "\nRunning the standard scan against the discovered project...\n",
  );

  // Hand off to the normal scanner. Frontend mode defaults to read-only —
  // the user just gave us a third-party URL, we don't want to attempt
  // writes against their database without an explicit override.
  const writeRequested = argv.includes("--with-writes");
  const result = await runScan({
    url: discovery.supabaseUrl,
    anonKey: discovery.anonKey,
    readOnly: !writeRequested,
  });

  const format = wantJson ? "json" : wantMd ? "md" : "text";
  const output = formatFindings(result, {
    format,
    color: !wantJson && !wantMd && process.stdout.isTTY,
    projectUrl: discovery.supabaseUrl,
  });

  process.stdout.write(output);
  if (format === "text") process.stdout.write("\n");

  const hasCritical = result.findings.some((f) => f.severity === "critical");
  process.exit(hasCritical ? 1 : 0);
}

async function handleMcpSubcommand(argv: string[]): Promise<void> {
  const action = argv[0];
  if (action === "install") {
    await installMcp();
    return;
  }
  if (action === "uninstall") {
    await uninstallMcp();
    return;
  }
  process.stdout.write(
    "aegis-sb mcp — auto-configure the aegis-sb MCP server\n\n" +
      "Usage:\n" +
      "  npx aegis-sb mcp install       Add aegis-sb-mcp to Claude Code + Cursor configs\n" +
      "  npx aegis-sb mcp uninstall     Remove from both configs\n\n" +
      "Targets:\n" +
      "  Claude Code: ~/.claude/.mcp.json\n" +
      "  Cursor:      ~/.cursor/mcp.json\n",
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === "skill") {
    await handleSkillSubcommand(argv.slice(1));
    return;
  }

  if (argv[0] === "mcp") {
    await handleMcpSubcommand(argv.slice(1));
    return;
  }

  if (argv[0] === "frontend") {
    await handleFrontendSubcommand(argv.slice(1));
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
      profiles: args.profiles,
      readOnly: args.readOnly,
      quiet: args.quiet,
    });

    const format = args.json ? "json" : args.md ? "md" : "text";
    const output = formatFindings(result, {
      format,
      color: !args.noColor && process.stdout.isTTY,
      quiet: args.quiet,
      projectUrl: url,
    });

    process.stdout.write(output);
    if (format === "text") process.stdout.write("\n");

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
