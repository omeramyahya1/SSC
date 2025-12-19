// src/api/subscriptionService.ts
import api from './client';

export interface Subscription {
  subscription_id: number;
  user_id: number;
  payment_id: number;
  date_created: string;
  expiration_date: string;
  grace_period_end: string;
  type: "monthly" | "annual" | "lifetime";
  status: "active" | "expired";
  license_code: string;
}

export type NewSubscriptionData = Omit<Subscription, 'subscription_id' | 'date_created'>;

const resource = '/subscriptions';

export const subscriptionService = {
  /**
   * Fetches all subscriptions from the backend.
   */
  getAll: async (): Promise<Subscription[]> => {
    const { data } = await api.get(resource);
    return data;
  },

  /**
   * Fetches a single subscription by its ID.
   * @param id The ID of the subscription to fetch.
   */
  getById: async (id: number): Promise<Subscription> => {
    const { data } = await api.get(`${resource}/${id}`);
    return data;
  },

  /**
   * Creates a new subscription.
   * @param newSubscriptionData The data for the new subscription.
   */
  create: async (newSubscriptionData: NewSubscriptionData): Promise<Subscription> => {
    const { data } = await api.post(resource, newSubscriptionData);
    return data;
  },

  /**
   * Updates an existing subscription.
   * @param id The ID of the subscription to update.
   * @param updatedData The new data for the subscription.
   */
  update: async (id: number, updatedData: Partial<NewSubscriptionData>): Promise<Subscription> => {
    const { data } = await api.put(`${resource}/${id}`, updatedData);
    return data;
  },

  /**
   * Deletes a subscription by its ID.
   * @param id The ID of the subscription to delete.
   */
  delete: async (id: number): Promise<void> => {
    await api.delete(`${resource}/${id}`);
  },
};
