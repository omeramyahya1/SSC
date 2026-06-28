export const StoreKeys = {
  User: "UserStore",
  Authentication: "AuthenticationStore",
  Customer: "CustomerStore",
  Project: "ProjectStore",
  SystemInfo: "SystemInfoStore",
  SystemConfiguration: "SystemConfigurationStore",
  Appliance: "ApplianceStore",
  Inventory: "InventoryStore",
  ProjectComponent: "ProjectComponentStore",
  Invoice: "InvoiceStore",
  Payment: "PaymentStore",
  Document: "DocumentStore",
  Subscription: "SubscriptionStore",
  SubscriptionPayment: "SubscriptionPaymentStore",
  SyncLog: "SyncLogStore",
  ApplicationSettings: "ApplicationSettingsStore",
  Branch: "BranchStore",
  Organization: "OrganizationStore",
} as const;

export type StoreKey = (typeof StoreKeys)[keyof typeof StoreKeys];

export interface RefreshOptions {
  silent?: boolean;
}

export type Fetcher = () => Promise<void> | void;

export interface RegistryEntry {
  fetcher: Fetcher;
  store?: any;
}

const registry = new Map<StoreKey, RegistryEntry>();

export function registerStore(key: StoreKey, fetcher: Fetcher, store?: any) {
  registry.set(key, { fetcher, store });

  if (store && !store.__patched) {
    store.__patched = true;
    const originalSetState = store.setState;
    
    store.setState = (nextStateOrUpdater: any, replace?: boolean) => {
      if (store.__isSilent) {
        let isSettingLoadingTrue = false;
        let isSettingLoadingFalse = false;

        let finalStateOrUpdater = nextStateOrUpdater;

        if (typeof nextStateOrUpdater === 'function') {
          finalStateOrUpdater = (state: any) => {
            const nextState = nextStateOrUpdater(state);
            if (typeof nextState === 'object' && nextState !== null) {
              if (nextState.isLoading === true) {
                isSettingLoadingTrue = true;
              } else if (nextState.isLoading === false) {
                isSettingLoadingFalse = true;
              }
              const { isLoading, ...rest } = nextState;
              return rest;
            }
            return nextState;
          };
        } else if (typeof nextStateOrUpdater === 'object' && nextStateOrUpdater !== null) {
          if (nextStateOrUpdater.isLoading === true) {
            isSettingLoadingTrue = true;
          } else if (nextStateOrUpdater.isLoading === false) {
            isSettingLoadingFalse = true;
          }
          const { isLoading, ...rest } = nextStateOrUpdater;
          finalStateOrUpdater = rest;
        }

        originalSetState(finalStateOrUpdater, replace);

        if (isSettingLoadingTrue) {
          store.__silentActive = true;
        }
        if (isSettingLoadingFalse) {
          store.__silentActive = false;
          store.__isSilent = false;
        }
      } else {
        originalSetState(nextStateOrUpdater, replace);
      }
    };
  }
}

export function refreshStores(keys: StoreKey[], options?: RefreshOptions) {
  keys.forEach((key) => {
    const entry = registry.get(key);
    if (!entry) return;

    if (options?.silent && entry.store) {
      entry.store.__isSilent = true;
    }

    try {
      entry.fetcher();
    } catch (e) {
      if (options?.silent && entry.store) {
        entry.store.__isSilent = false;
        entry.store.__silentActive = false;
      }
      throw e;
    }

    if (options?.silent && entry.store && !entry.store.__silentActive) {
      entry.store.__isSilent = false;
    }
  });
}
