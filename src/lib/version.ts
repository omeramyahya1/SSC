export type AppChannel = "dev" | "beta" | "prod";

export interface AppManifest {
  latest_version: string;
  critical_min_version: string;
  notification?: {
    id: string;
    message: string;
    type: "info" | "warning" | "promo";
  };
}

export const getChannelFromVersion = (version: string): AppChannel => {
  return isPrereleaseVersion(version) ? "beta" : "prod";
};

export const getAppChannel = (version?: string): AppChannel => {
  if (version) {
    return getChannelFromVersion(version);
  }
  const raw = import.meta.env.VITE_APP_CHANNEL;
  return raw === "dev" || raw === "beta" || raw === "prod" ? raw : "prod";
};

type SemVer = {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<string | number>;
};

function parseSemver(input: string): SemVer | null {
  const v = (input || "").trim().replace(/^v/i, "");
  const match = v.match(
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
  );
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const prereleaseRaw = match[4];

  if (![major, minor, patch].every((n) => Number.isFinite(n))) return null;

  const prerelease: Array<string | number> = prereleaseRaw
    ? prereleaseRaw.split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id))
    : [];

  return { major, minor, patch, prerelease };
}

function cmpIdentifier(a: string | number, b: string | number): number {
  if (a === b) return 0;
  const aNum = typeof a === "number";
  const bNum = typeof b === "number";
  if (aNum && bNum) return a > b ? 1 : -1;
  if (aNum && !bNum) return -1;
  if (!aNum && bNum) return 1;
  return String(a) > String(b) ? 1 : -1;
}

export const compareVersions = (v1: string, v2: string): number => {
  const a = parseSemver(v1);
  const b = parseSemver(v2);

  // If versions aren't valid SemVer, fall back to numeric dot compare.
  if (!a || !b) {
    const parts1 = (v1 || "").replace(/^v/i, "").split(".").map((x) => Number(x) || 0);
    const parts2 = (v2 || "").replace(/^v/i, "").split(".").map((x) => Number(x) || 0);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  const aPre = a.prerelease;
  const bPre = b.prerelease;

  // No prerelease beats prerelease.
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  for (let i = 0; i < Math.max(aPre.length, bPre.length); i++) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    const c = cmpIdentifier(ai, bi);
    if (c !== 0) return c;
  }

  return 0;
};

export const isPrereleaseVersion = (version: string): boolean => {
  const parsed = parseSemver(version);
  return !!parsed && parsed.prerelease.length > 0;
};
