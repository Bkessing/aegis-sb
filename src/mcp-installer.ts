import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface McpTarget {
  /** Display name for output. */
  name: string;
  /** Path to the MCP config JSON file. */
  configPath: string;
}

function getTargets(): McpTarget[] {
  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME environment variable is not set; cannot locate MCP configs.");
  }
  return [
    { name: "Claude Code", configPath: join(home, ".claude", ".mcp.json") },
    { name: "Cursor", configPath: join(home, ".cursor", "mcp.json") },
  ];
}

const SERVER_NAME = "aegis-sb";

const SERVER_ENTRY = {
  command: "npx",
  args: ["-y", "aegis-sb-mcp"],
};

interface McpConfig {
  mcpServers?: Record<string, { command?: string; args?: string[] } | undefined>;
  [key: string]: unknown;
}

async function readConfigOrEmpty(path: string): Promise<McpConfig> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as McpConfig;
    }
    return {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeConfig(path: string, config: McpConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const formatted = JSON.stringify(config, null, 2) + "\n";
  await writeFile(path, formatted, "utf-8");
}

export async function installMcp(): Promise<void> {
  const targets = getTargets();
  const summary: string[] = [];

  for (const target of targets) {
    const config = await readConfigOrEmpty(target.configPath);
    const servers = (config.mcpServers ??= {});

    if (servers[SERVER_NAME]) {
      summary.push(`  ${target.name}: already installed (${target.configPath})`);
      continue;
    }

    servers[SERVER_NAME] = SERVER_ENTRY;
    await writeConfig(target.configPath, config);
    summary.push(`  ${target.name}: installed → ${target.configPath}`);
  }

  process.stdout.write("Installed aegis-sb MCP server:\n");
  process.stdout.write(`${summary.join("\n")}\n\n`);
  process.stdout.write(
    "Restart your editor (or run the MCP refresh command) for the new server to load.\n" +
      "Once loaded, agents can invoke `scan_supabase` autonomously when the user is " +
      "working on Supabase contexts.\n",
  );
}

export async function uninstallMcp(): Promise<void> {
  const targets = getTargets();
  const summary: string[] = [];

  for (const target of targets) {
    const config = await readConfigOrEmpty(target.configPath);
    const servers = config.mcpServers;

    if (!servers || !servers[SERVER_NAME]) {
      summary.push(`  ${target.name}: not installed (${target.configPath})`);
      continue;
    }

    delete servers[SERVER_NAME];
    await writeConfig(target.configPath, config);
    summary.push(`  ${target.name}: removed from ${target.configPath}`);
  }

  process.stdout.write("Uninstalled aegis-sb MCP server:\n");
  process.stdout.write(`${summary.join("\n")}\n`);
}
