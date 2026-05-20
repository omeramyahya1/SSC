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

export const getAppChannel = (): AppChannel => {
  const raw = import.meta.env.VITE_APP_CHANNEL;
  return raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev";
};

export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.replace(/^v/, "").split(".");
  const parts2 = v2.replace(/^v/, "").split(".");

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const raw1 = parts1[i];
    const raw2 = parts2[i];
    if (
      (raw1 !== undefined && !/^\d+$/.test(raw1)) ||
      (raw2 !== undefined && !/^\d+$/.test(raw2))
    ) {
      throw new Error(`Invalid version format: "${v1}" vs "${v2}"`);
    }
    const p1 = raw1 === undefined ? 0 : Number(raw1);
    const p2 = raw2 === undefined ? 0 : Number(raw2);
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};
