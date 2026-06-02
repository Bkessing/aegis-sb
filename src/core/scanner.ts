import { discoverBuckets, discoverTables } from "./discover.js";
import { validateLicense } from "./license.js";
import { probes } from "./probes/index.js";
import type { Config, Finding, ScanContext, ScanResult } from "./types.js";
import { buildWordlist } from "./wordlist.js";

/**
 * Run a full scan against a Supabase project.
 *
 * Steps:
 *   1. Validate license (stubbed to free tier in v0.1-0.3).
 *   2. Discover tables (via PostgREST OpenAPI) + buckets (via Storage API).
 *   3. Run each registered probe sequentially. A failing probe doesn't kill
 *      the scan — its error becomes an `info` finding so the caller can see
 *      what happened.
 */
export async function runScan(config: Config): Promise<ScanResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  const license = await validateLicense(config.licenseKey);

  const candidates = config.tables ?? buildWordlist(config.profiles);
  const [tables, buckets] = await Promise.all([
    discoverTables(config, candidates),
    discoverBuckets(config),
  ]);

  const ctx: ScanContext = { config, license, tables, buckets };
  const findings: Finding[] = [];

  for (const probe of probes) {
    const featureKey = `scan_${probe.id.replace(/-/g, "_")}`;
    if (!license.features.includes(featureKey)) {
      // License tier doesn't allow this probe — skip silently in v0.1.
      // In v0.4+ this is where paid probes get gated.
      continue;
    }

    try {
      const probeFindings = await probe.run(ctx);
      findings.push(...probeFindings);
    } catch (err) {
      findings.push({
        id: `probe-error-${probe.id}`,
        severity: "info",
        title: `Probe \`${probe.id}\` threw an error`,
        description: err instanceof Error ? err.message : String(err),
        evidence: { probe: probe.id },
      });
    }
  }

  return {
    findings,
    tablesDiscovered: tables.length,
    bucketsDiscovered: buckets.length,
    startedAt,
    durationMs: Date.now() - startMs,
    licenseTier: license.tier,
  };
}
