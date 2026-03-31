import { StoreKeys } from "./storeRegistry";
import type { StoreKey } from "./storeRegistry";

type RefreshRule = {
  methods: string[];
  pattern: RegExp;
  stores: StoreKey[];
};

const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];

export const refreshRules: RefreshRule[] = [
  { methods: mutationMethods, pattern: /^\/users(\/|$)/, stores: [StoreKeys.User] },
  { methods: mutationMethods, pattern: /^\/authentications(\/|$)/, stores: [StoreKeys.Authentication, StoreKeys.User] },
  { methods: mutationMethods, pattern: /^\/customers(\/|$)/, stores: [StoreKeys.Customer, StoreKeys.Project] },
  { methods: mutationMethods, pattern: /^\/projects(\/|$)/, stores: [StoreKeys.Project, StoreKeys.Customer] },
  { methods: mutationMethods, pattern: /^\/system_configurations(\/|$)/, stores: [StoreKeys.SystemConfiguration, StoreKeys.Project] },
  { methods: mutationMethods, pattern: /^\/appliances(\/|$)/, stores: [StoreKeys.Appliance, StoreKeys.Project] },
  { methods: mutationMethods, pattern: /^\/inventory(\/|$)/, stores: [StoreKeys.Inventory] },
  { methods: mutationMethods, pattern: /^\/inventory\/project-components(\/|$)/, stores: [StoreKeys.ProjectComponent, StoreKeys.Inventory] },
  { methods: mutationMethods, pattern: /^\/recommendations(\/|$)/, stores: [StoreKeys.ProjectComponent] },
  { methods: mutationMethods, pattern: /^\/documents(\/|$)/, stores: [StoreKeys.Document] },
  { methods: mutationMethods, pattern: /^\/subscriptions(\/|$)/, stores: [StoreKeys.Subscription] },
  { methods: mutationMethods, pattern: /^\/subscription_payments(\/|$)/, stores: [StoreKeys.SubscriptionPayment, StoreKeys.Subscription] },
  { methods: mutationMethods, pattern: /^\/sync_logs(\/|$)/, stores: [StoreKeys.SyncLog] },
  { methods: mutationMethods, pattern: /^\/application_settingss(\/|$)/, stores: [StoreKeys.ApplicationSettings] },
  { methods: mutationMethods, pattern: /^\/invoices(\/|$)/, stores: [StoreKeys.Invoice] },
  { methods: mutationMethods, pattern: /^\/finances\/invoices(\/|$)/, stores: [StoreKeys.Invoice, StoreKeys.Inventory] },
  { methods: mutationMethods, pattern: /^\/finances\/payments(\/|$)/, stores: [StoreKeys.Payment, StoreKeys.Invoice] },
];

export function matchRefreshTargets(method: string, path: string): StoreKey[] {
  const stores = new Set<StoreKey>();

  refreshRules.forEach((rule) => {
    if (rule.methods.includes(method) && rule.pattern.test(path)) {
      rule.stores.forEach((store) => stores.add(store));
    }
  });

  return Array.from(stores);
}
