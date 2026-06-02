import pc from "picocolors";
import type { Finding, ScanResult, Severity } from "./types.js";

export type OutputFormat = "text" | "json" | "md";

export interface FormatOptions {
  format?: OutputFormat;
  color?: boolean;
  quiet?: boolean;
  projectUrl?: string;
}

interface Colorizer {
  bold: (s: string) => string;
  dim: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  green: (s: string) => string;
  underline: (s: string) => string;
}

const identity = (s: string): string => s;

const colorless: Colorizer = {
  bold: identity,
  dim: identity,
  red: identity,
  yellow: identity,
  cyan: identity,
  green: identity,
  underline: identity,
};

export function formatFindings(result: ScanResult, options: FormatOptions = {}): string {
  const format = options.format ?? "text";

  if (format === "json") return JSON.stringify(result, null, 2);
  if (format === "md") return formatMarkdown(result, options);

  return formatText(result, options);
}

function formatText(result: ScanResult, options: FormatOptions): string {
  const c: Colorizer = options.color === false ? colorless : pc;
  const lines: string[] = [];

  lines.push("");
  lines.push(c.bold("aegis-sb scan"));
  if (options.projectUrl) {
    lines.push(`  ${c.dim(options.projectUrl)}`);
  }
  lines.push(
    `  ${c.dim(
      `${result.tablesDiscovered} table${result.tablesDiscovered === 1 ? "" : "s"}, ` +
        `${result.bucketsDiscovered} bucket${result.bucketsDiscovered === 1 ? "" : "s"}, ` +
        `${result.durationMs}ms`,
    )}`,
  );
  lines.push("");

  const sorted = [...result.findings].sort(compareSeverity);

  if (sorted.length === 0) {
    lines.push(c.green("✓  No findings."));
    lines.push("");
    return lines.join("\n");
  }

  for (const f of sorted) {
    lines.push(formatFindingText(f, c));
    lines.push("");
  }

  const counts = countBySeverity(sorted);
  lines.push(c.bold("Summary"));
  if (counts.critical > 0) lines.push(`  ${c.red("✗")} ${counts.critical} critical`);
  if (counts.warn > 0) lines.push(`  ${c.yellow("⚠")} ${counts.warn} warning`);
  if (counts.info > 0) lines.push(`  ${c.cyan("ℹ")} ${counts.info} info`);
  lines.push("");

  return lines.join("\n");
}

function formatMarkdown(result: ScanResult, options: FormatOptions): string {
  const lines: string[] = [];

  lines.push("## aegis-sb scan");
  if (options.projectUrl) {
    lines.push("");
    lines.push(`\`${options.projectUrl}\``);
  }
  lines.push("");
  lines.push(
    `${result.tablesDiscovered} table${result.tablesDiscovered === 1 ? "" : "s"} · ` +
      `${result.bucketsDiscovered} bucket${result.bucketsDiscovered === 1 ? "" : "s"} · ` +
      `${result.durationMs}ms`,
  );
  lines.push("");

  const sorted = [...result.findings].sort(compareSeverity);

  if (sorted.length === 0) {
    lines.push("✅ **No findings.**");
    lines.push("");
    return lines.join("\n");
  }

  const counts = countBySeverity(sorted);
  const summaryParts: string[] = [];
  if (counts.critical > 0) summaryParts.push(`🚨 **${counts.critical} critical**`);
  if (counts.warn > 0) summaryParts.push(`⚠️ ${counts.warn} warning`);
  if (counts.info > 0) summaryParts.push(`ℹ️ ${counts.info} info`);
  lines.push(summaryParts.join(" · "));
  lines.push("");

  for (const f of sorted) {
    lines.push(formatFindingMarkdown(f));
    lines.push("");
  }

  return lines.join("\n");
}

function formatFindingText(f: Finding, c: Colorizer): string {
  const badge =
    f.severity === "critical"
      ? c.red("CRITICAL")
      : f.severity === "warn"
        ? c.yellow("WARN")
        : c.cyan("INFO");

  const lines: string[] = [`${badge}  ${c.bold(f.title)}`];

  lines.push(`         ${wrapIndent(f.description, 9)}`);

  if (f.fixPrompt) {
    lines.push("");
    lines.push(`         ${c.dim("Paste into your AI agent to fix:")}`);
    lines.push(`         ${c.dim("─".repeat(50))}`);
    lines.push(`         ${wrapIndent(f.fixPrompt, 9)}`);
    lines.push(`         ${c.dim("─".repeat(50))}`);
  }

  if (f.reference) {
    lines.push("");
    lines.push(`         ${c.dim("Reference:")} ${c.underline(f.reference)}`);
  }

  return lines.join("\n");
}

function formatFindingMarkdown(f: Finding): string {
  const icon = f.severity === "critical" ? "🚨" : f.severity === "warn" ? "⚠️" : "ℹ️";
  const sevLabel =
    f.severity === "critical" ? "**CRITICAL**" : f.severity === "warn" ? "**WARN**" : "_INFO_";

  const lines: string[] = [];
  lines.push(`### ${icon} ${sevLabel} · ${f.title}`);
  lines.push("");
  lines.push(f.description);

  if (f.fixPrompt) {
    lines.push("");
    lines.push("**Paste into your AI agent to fix:**");
    lines.push("");
    lines.push("```text");
    lines.push(f.fixPrompt);
    lines.push("```");
  }

  if (f.reference) {
    lines.push("");
    lines.push(`Reference: <${f.reference}>`);
  }

  return lines.join("\n");
}

function compareSeverity(a: Finding, b: Finding): number {
  const order: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };
  return order[a.severity] - order[b.severity];
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { critical: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}

function wrapIndent(text: string, indent: number): string {
  const pad = " ".repeat(indent);
  return text.replace(/\n/g, `\n${pad}`);
}
