import type { License } from "./types.js";

/**
 * Validate a license key.
 *
 * v0.1-0.3 stub: all keys (including no key) resolve to the free tier with
 * the v1 probe set. Paid features (continuous monitoring, WAL backups,
 * agent-undo) come online in v0.4 when this function hits a hosted endpoint
 * to validate.
 *
 * The license_key parameter is accepted today so MCP server configs and CLI
 * flags don't need to change when the paid tier ships.
 */
export async function validateLicense(_licenseKey?: string): Promise<License> {
  return {
    tier: "free",
    features: [
      "scan_anon_read",
      "scan_anon_write",
      "scan_public_buckets",
      "scan_jwt_role",
    ],
    expiresAt: null,
    valid: true,
  };
}
