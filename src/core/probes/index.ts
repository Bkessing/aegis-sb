import type { ProbeRegistration } from "../types.js";
import { probeAnonRead } from "./anon-read.js";
import { probeAnonWrite } from "./anon-write.js";
import { probeAuthPosture } from "./auth-posture.js";
import { probeJwtRole } from "./jwt-role.js";
import { probePublicBuckets } from "./public-buckets.js";
import { probeStorageListing } from "./storage-listing.js";

/**
 * Registry of all probes available in this version.
 *
 * Order matters: probes earlier in the list run first. JWT role check runs
 * first so we surface "you passed the wrong key" before doing anything else
 * with that key.
 */
export const probes: ProbeRegistration[] = [
  {
    id: "jwt-role",
    title: "JWT role inspection",
    description: "Decodes the anon JWT and flags wrong-key mistakes (e.g., service_role).",
    requires: "free",
    run: probeJwtRole,
  },
  {
    id: "anon-read",
    title: "Anonymous read",
    description: "Attempts SELECT * on every discovered table with the anon key.",
    requires: "free",
    run: probeAnonRead,
  },
  {
    id: "anon-write",
    title: "Anonymous write",
    description: "Attempts INSERT on every discovered table with the anon key.",
    requires: "free",
    run: probeAnonWrite,
  },
  {
    id: "public-buckets",
    title: "Public storage buckets",
    description: "Flags storage buckets configured as public.",
    requires: "free",
    run: probePublicBuckets,
  },
  {
    id: "storage-listing",
    title: "Storage object listing",
    description: "Flags buckets whose object list is enumerable by the anon role.",
    requires: "free",
    run: probeStorageListing,
  },
  {
    id: "auth-posture",
    title: "Auth posture",
    description: "Detects open anonymous signups.",
    requires: "free",
    run: probeAuthPosture,
  },
];
