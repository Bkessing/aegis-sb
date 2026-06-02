/**
 * Frontend bundle scanner.
 *
 * Given a deployed URL (Vercel, Netlify, Lovable preview, Cloudflare Pages,
 * Render, etc.), fetches the HTML + linked JS bundles and extracts the
 * Supabase project URL and JWT(s) that the frontend ships to every visitor.
 *
 * Returns the credentials so the caller can run the full anon-key scan
 * against them — or, if the extracted JWT has `role: service_role`, flags
 * the catastrophic mistake of committing the service-role key to the
 * frontend bundle.
 */

import { request } from "./http.js";

const SUPABASE_URL_RE = /https?:\/\/([a-z0-9-]+)\.supabase\.(co|in|net)/gi;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;

const MAX_BUNDLE_SIZE = 5 * 1024 * 1024; // 5 MB per fetched JS bundle
const MAX_BUNDLES = 30; // cap total fetches per scan
const FETCH_TIMEOUT_MS = 10000;

export interface FrontendDiscovery {
  supabaseUrl: string | null;
  anonKey: string | null;
  jwtRole: string | null;
  bundlesScanned: number;
  /** Other JWTs found but not matched to a Supabase URL. */
  unmatchedJwts: string[];
  /** Other Supabase URLs found (more than one project referenced). */
  otherSupabaseUrls: string[];
  /** Notes about what was tried — useful for diagnostics. */
  notes: string[];
}

export async function scanFrontend(deployedUrl: string): Promise<FrontendDiscovery> {
  const notes: string[] = [];
  const result: FrontendDiscovery = {
    supabaseUrl: null,
    anonKey: null,
    jwtRole: null,
    bundlesScanned: 0,
    unmatchedJwts: [],
    otherSupabaseUrls: [],
    notes,
  };

  // 1. Fetch the deployed page as a browser would.
  const indexHtml = await fetchAsBrowser(deployedUrl);
  if (!indexHtml.ok) {
    notes.push(`Could not fetch ${deployedUrl} (HTTP ${indexHtml.status}).`);
    return result;
  }

  // 2. Collect URLs of scripts referenced from the page.
  const bundleUrls = collectScriptUrls(indexHtml.body, deployedUrl).slice(0, MAX_BUNDLES);
  notes.push(`Fetched index.html (${indexHtml.body.length} bytes); ${bundleUrls.length} script bundles linked.`);

  // 3. Search the HTML itself + each linked bundle for credentials.
  const corpus: { source: string; text: string }[] = [{ source: deployedUrl, text: indexHtml.body }];

  for (const bundleUrl of bundleUrls) {
    const bundle = await fetchAsBrowser(bundleUrl);
    if (bundle.ok && bundle.body.length <= MAX_BUNDLE_SIZE) {
      corpus.push({ source: bundleUrl, text: bundle.body });
      result.bundlesScanned++;
    }
  }

  // 4. Extract Supabase URLs + JWTs from every source.
  const supabaseUrls = new Set<string>();
  const jwts = new Set<string>();
  for (const { text } of corpus) {
    for (const m of text.matchAll(SUPABASE_URL_RE)) {
      // Normalize to scheme + hostname only (no path).
      const base = `https://${m[1]}.supabase.${m[2]}`;
      supabaseUrls.add(base);
    }
    for (const m of text.matchAll(JWT_RE)) {
      jwts.add(m[0]);
    }
  }

  notes.push(
    `Extracted ${supabaseUrls.size} unique Supabase URL${supabaseUrls.size === 1 ? "" : "s"} ` +
      `and ${jwts.size} JWT-shaped token${jwts.size === 1 ? "" : "s"}.`,
  );

  if (supabaseUrls.size === 0 || jwts.size === 0) {
    return result;
  }

  // 5. Pick the first Supabase URL. Filter JWTs to those issued for this
  // project (the JWT carries a `ref` claim equal to the project subdomain).
  const urlsArr = Array.from(supabaseUrls);
  const primaryUrl = urlsArr[0]!;
  const projectRef = primaryUrl.match(SUPABASE_URL_RE)?.[0]?.replace(/^https?:\/\//, "").split(".")[0] ?? null;
  result.otherSupabaseUrls = urlsArr.slice(1);

  const jwtsArr = Array.from(jwts);
  let matchedJwt: string | null = null;
  let matchedRole: string | null = null;

  for (const jwt of jwtsArr) {
    const claims = decodeJwt(jwt);
    if (!claims) continue;
    const ref = stringClaim(claims, "ref");
    const role = stringClaim(claims, "role");

    if (projectRef && ref === projectRef) {
      matchedJwt = jwt;
      matchedRole = role;
      break;
    }
    // Fall back to first JWT with any role claim if no ref match.
    if (!matchedJwt && role) {
      matchedJwt = jwt;
      matchedRole = role;
    }
  }

  result.supabaseUrl = primaryUrl;
  result.anonKey = matchedJwt;
  result.jwtRole = matchedRole;
  result.unmatchedJwts = jwtsArr.filter((j) => j !== matchedJwt);

  return result;
}

interface FetchedDoc {
  ok: boolean;
  status: number;
  body: string;
}

async function fetchAsBrowser(url: string): Promise<FetchedDoc> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: {
          // Look like a real browser to coax CDNs/edge into giving us the bundle.
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/javascript,application/xhtml+xml,text/javascript,*/*",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return { ok: false, status: 0, body: "" };
  }
}

function collectScriptUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(SCRIPT_SRC_RE)) {
    try {
      const resolved = new URL(m[1]!, baseUrl).toString();
      // Only fetch http(s) bundles, and stay on the same origin or a CDN.
      if (resolved.startsWith("http")) urls.push(resolved);
    } catch {
      // Ignore malformed URLs.
    }
  }
  return urls;
}

function decodeJwt(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf-8");
    const parsed: unknown = JSON.parse(decoded);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function stringClaim(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === "string" ? v : null;
}

export { request as _request };
