export const StoreKeys = {
  User: "UserStore",
  Authentication: "AuthenticationStore",
  Customer: "CustomerStore",
  Project: "ProjectStore",
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
} as const;

export type StoreKey = (typeof StoreKeys)[keyof typeof StoreKeys];

export type Fetcher = () => Promise<void> | void;

const registry = new Map<StoreKey, Fetcher>();

export function registerStore(key: StoreKey, fetcher: Fetcher) {
  registry.set(key, fetcher);
}

export function refreshStores(keys: StoreKey[]) {
  keys.forEach((key) => {
    const fetcher = registry.get(key);
    if (fetcher) fetcher();
  });
}
