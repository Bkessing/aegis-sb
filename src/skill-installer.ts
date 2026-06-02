import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the bundled `skill/` directory inside the installed npm package.
 *
 * When installed (globally, locally, or via `npx`), the package layout is:
 *   <pkg-root>/dist/cli.js
 *   <pkg-root>/skill/SKILL.md
 * so skill lives at `dirname(cli.js)/../skill`.
 */
function getSkillSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "skill");
}

/** Target directory for installed Claude Code skills. */
function getSkillTargetDir(): string {
  const home = process.env.HOME;
  if (!home) {
    throw new Error("HOME environment variable is not set; cannot locate ~/.claude.");
  }
  return join(home, ".claude", "skills", "aegis-sb");
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath);
    }
  }
}

export async function installSkill(): Promise<void> {
  const source = getSkillSourceDir();
  const target = getSkillTargetDir();

  if (!(await fileExists(source))) {
    throw new Error(
      `Skill source not found at ${source}. ` +
        `The aegis-sb package may be installed without skill files.`,
    );
  }

  await copyDirRecursive(source, target);

  process.stdout.write(`Installed aegis-sb skill to ${target}\n\n`);
  process.stdout.write(
    "Claude Code will pick it up at the next session start.\n" +
      "Restart Claude Code, or run /skills in any session to refresh.\n\n",
  );
  process.stdout.write(
    "The skill triggers proactively when the user is working on Supabase,\n" +
      "modifying RLS policies, or about to deploy a backend. It calls the\n" +
      "scan_supabase MCP tool when available, or falls back to `npx aegis-sb`.\n",
  );
}

export async function uninstallSkill(): Promise<void> {
  const target = getSkillTargetDir();

  if (!(await fileExists(target))) {
    process.stdout.write(`Nothing to uninstall — ${target} does not exist.\n`);
    return;
  }

  await rm(target, { recursive: true, force: true });
  process.stdout.write(`Removed aegis-sb skill from ${target}\n`);
}
