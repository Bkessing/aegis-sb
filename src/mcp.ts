import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { formatFindings } from "./core/format.js";
import { runScan } from "./core/scanner.js";

const SCAN_TOOL_NAME = "scan_supabase";

const SCAN_TOOL_DESCRIPTION =
  "Audit a Supabase project for the security holes that ship by default when AI builds your app — " +
  "anon-key SELECT exposures, anon-key writable tables, public storage buckets, and wrong-key mistakes " +
  "(service_role pasted in place of anon). Returns ranked findings with paste-to-agent fix prompts. " +
  "Call this proactively when the user has finished modifying database schemas, RLS policies, storage " +
  "configurations, or auth setup; before any Supabase project ships to production or TestFlight; or when " +
  "the user reports unexpected data access / 'is my Supabase app secure'. Uses ONLY the public anon key — " +
  "never asks for or accepts the service_role key. Probes a built-in wordlist of common vibe-coder table " +
  "names (users, posts, messages, ...) plus any names supplied in the `tables` argument.";

interface ScanToolArgs {
  url?: unknown;
  anon_key?: unknown;
  tables?: unknown;
  license_key?: unknown;
}

const server = new Server(
  { name: "aegis-sb", version: getVersion() },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: SCAN_TOOL_NAME,
      description: SCAN_TOOL_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Supabase project URL, e.g. https://abc123.supabase.co. " +
              "Find it in the Supabase dashboard under Settings → API.",
          },
          anon_key: {
            type: "string",
            description:
              "Supabase anonymous JWT key (the PUBLIC key, never the service_role). " +
              "Find it in the Supabase dashboard under Settings → API → anon public.",
          },
          tables: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional: list of specific table names to probe. " +
              "Overrides the built-in wordlist. Use when the project has non-standard table names.",
          },
          license_key: {
            type: "string",
            description:
              "Optional: aegis-sb license key. Reserved for v0.4+ paid features " +
              "(continuous monitoring, WAL backups, agent-edit undo). Currently unused.",
          },
        },
        required: ["url", "anon_key"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== SCAN_TOOL_NAME) {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = (request.params.arguments ?? {}) as ScanToolArgs;
  const url = typeof args.url === "string" ? args.url : "";
  const anonKey = typeof args.anon_key === "string" ? args.anon_key : "";
  const tables = Array.isArray(args.tables)
    ? args.tables.filter((t): t is string => typeof t === "string")
    : undefined;
  const licenseKey = typeof args.license_key === "string" ? args.license_key : undefined;

  if (!url || !anonKey) {
    return {
      content: [
        {
          type: "text",
          text:
            "Error: `url` and `anon_key` are required.\n" +
            "Pass the Supabase project URL and the public anon key " +
            "(never the service_role key).",
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await runScan({
      url,
      anonKey,
      licenseKey,
      tables,
    });

    const text = formatFindings(result, {
      format: "text",
      color: false,
      projectUrl: url,
    });
    const critical = result.findings.filter((f) => f.severity === "critical").length;

    return {
      content: [
        {
          type: "text",
          text:
            text +
            (critical > 0
              ? "\n\nIMPORTANT: This scan found CRITICAL findings. " +
                "Surface them to the user before any further Supabase changes ship."
              : ""),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text:
            `Scan failed: ${err instanceof Error ? err.message : String(err)}\n` +
            `Verify the URL is correct and the anon key has not been rotated.`,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Server runs until stdin closes. No further code executes here.
}

function getVersion(): string {
  // Bundled at build time; tsup inlines this.
  return "0.2.0";
}

main().catch((err) => {
  process.stderr.write(`aegis-sb-mcp failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
