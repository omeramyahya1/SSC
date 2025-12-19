// src/store/useAuthenticationStore.ts
import { authenticationService, Authentication, NewAuthenticationData } from '@/api/authenticationService';
import { createCrudStore } from './createCrudStore';

/**
 * The Zustand store for managing authentication data records.
 *
 * Note: This store is for direct CRUD management of authentication records,
 * which may be useful for admin panels. For user-facing login/logout,
 * a more specialized store (`useAuthStore` or similar) would be recommended.
 */
export const useAuthenticationStore = createCrudStore<Authentication, NewAuthenticationData>(authenticationService);
