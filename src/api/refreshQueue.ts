import type { StoreKey } from "./storeRegistry";

type RefreshFn = (keys: StoreKey[]) => void;

const pending = new Set<StoreKey>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const debounceMs = 400;

export function scheduleRefresh(keys: StoreKey[], refreshFn: RefreshFn) {
  keys.forEach((key) => pending.add(key));

  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    const toRefresh = Array.from(pending);
    pending.clear();
    flushTimer = null;
    if (toRefresh.length) refreshFn(toRefresh);
  }, debounceMs);
}
