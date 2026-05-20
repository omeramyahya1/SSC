export type AppChannel = 'dev' | 'beta' | 'prod';

export interface AppManifest {
  latest_version: string;
  critical_min_version: string;
  notification?: {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'promo';
  };
}

export const getAppChannel = (): AppChannel => {
  return (import.meta.env.VITE_APP_CHANNEL as AppChannel) || 'dev';
};

export const compareVersions = (v1: string, v2: string): number => {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};
