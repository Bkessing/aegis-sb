/**
 * Severity levels for findings.
 *
 * - `critical`: data is exposed / writable / lost. Fix immediately.
 * - `warn`: configuration is risky but not yet weaponized. Likely a problem.
 * - `info`: informational; might be intentional but worth knowing.
 */
export type Severity = "critical" | "warn" | "info";

/** A single security finding from a probe. */
export interface Finding {
  /** Stable ID for this finding type, e.g. `anon-table-readable`. */
  id: string;
  severity: Severity;
  /** Short one-line title shown in CLI output. */
  title: string;
  /** Detailed description shown when the user expands the finding. */
  description: string;
  /** Optional: which table / bucket / resource this applies to. */
  resource?: string;
  /** Optional: extra structured data for the finding. */
  evidence?: Record<string, unknown>;
  /** Optional: paste-to-agent prompt to fix the finding. */
  fixPrompt?: string;
  /** Optional: link to docs / guideline. */
  reference?: string;
}

/** Scan configuration. */
export interface Config {
  /** Supabase project URL, e.g. `https://abc123.supabase.co`. */
  url: string;
  /** Supabase anon key (public-by-design). */
  anonKey: string;
  /** Optional license key (reserved for v0.4+ paid features). */
  licenseKey?: string;
  /**
   * Override the built-in wordlist of common table names.
   * Use when your project has non-standard table names.
   */
  tables?: string[];
  /**
   * Add tool-specific table-name presets to the default wordlist.
   * Available: "lovable", "bolt", "v0", "replit", "cursor".
   * Ignored when `tables` is supplied (since that's a full override).
   */
  profiles?: string[];
  /**
   * Read-only mode: skip probes that send write requests (anon-write,
   * auth-posture signup POST). Use when scanning third-party apps you
   * don't own — avoids creating noise in their logs / analytics.
   */
  readOnly?: boolean;
  /** Suppress non-error output (CLI / scripting use). */
  quiet?: boolean;
}

/** Result of a full scan. */
export interface ScanResult {
  findings: Finding[];
  tablesDiscovered: number;
  bucketsDiscovered: number;
  startedAt: string;
  durationMs: number;
  licenseTier: LicenseTier;
}

/** License tiers. v0.1-0.3 is free-only; paid tiers come online in v0.4+. */
export type LicenseTier = "free" | "pro" | "watchdog" | "studio";

/** License validation result. */
export interface License {
  tier: LicenseTier;
  features: string[];
  expiresAt: string | null;
  valid: boolean;
}

/** Information about a discovered table. */
export interface Table {
  schema: string;
  name: string;
}

/** Information about a discovered storage bucket. */
export interface Bucket {
  id: string;
  name: string;
  public: boolean;
  createdAt: string | null;
}

/** Context shared between probes during a scan. */
export interface ScanContext {
  config: Config;
  license: License;
  tables: Table[];
  buckets: Bucket[];
}

/** A probe function — takes shared context, returns zero or more findings. */
export type Probe = (ctx: ScanContext) => Promise<Finding[]>;

/** Registered probe with metadata. */
export interface ProbeRegistration {
  id: string;
  title: string;
  description: string;
  /** License tier required to run this probe. `free` = always available. */
  requires: LicenseTier;
  run: Probe;
}
