import { useEffect, useState } from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/authentication & onboarding/login";
import Registration from "./pages/authentication & onboarding/registration";
import ForgotPassword from "./pages/authentication & onboarding/forgetPassword";
import MainContent from "./pages/MainContent";
import ContactSales from "./pages/ContactSales";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";
import { useAuthenticationStore } from "./store/useAuthenticationStore";
import { refreshStores, StoreKeys } from "./api/storeRegistry";
import { Dashboard } from "./pages/dashboard/Dashboard";
import CustomersPage from "./pages/customers/Customers";
import Inventory from "./pages/inventory/Inventory";
import Sales from "./pages/sales/Sales"
import TeamOrganization from "./pages/team & organization/TeamOrganization";
import { VersionHandler } from "./components/versioning/VersionHandler";

import { useTranslation } from "react-i18next";
import { getBackendBaseUrl } from "./api/backendBaseUrl";

function App() {
  const { t } = useTranslation();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const { currentAuthentication, fetchLatestAuthentication } = useAuthenticationStore();
  const { currentUser, _hasHydrated } = useUserStore();

  useEffect(() => {
    let aborted = false;
    const hydrateAndCheckAuth = async () => {
      // 1. Wait for Backend Readiness
      const startTime = Date.now();
      const timeout = 60000; // 60 seconds
      let isReady = false;

      while (!isReady && !aborted) {
        if (Date.now() - startTime > timeout) {
          if (!aborted) setBackendError(t("errors.backend_timeout"));
          return;
        }

        try {
          const baseUrl = await getBackendBaseUrl();
          const res = await fetch(`${baseUrl}health`);
          if (res.ok) {
            isReady = true;
          } else {
            await new Promise(r => setTimeout(r, 1000));
          }
        } catch (e) {
          // Swallow connection errors and retry
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (aborted) return;

      // 2. Hydrate stores from data pre-loaded by the splash screen
      const preloadedUser = localStorage.getItem('preloaded-user');
      const preloadedSettings = localStorage.getItem('preloaded-settings');

      if (preloadedUser) {
        try {
          const userData = JSON.parse(preloadedUser);
          useUserStore.setState({ currentUser: userData, isLoading: false });
        } catch (e) {
          console.error("Failed to parse preloaded user data:", e);
        }
      }

      if (preloadedSettings) {
        try {
          const settingsData = JSON.parse(preloadedSettings);
          useApplicationSettingsStore.setState({
            settings: [settingsData],
            currentSetting: settingsData,
            isLoading: false
          });
        } catch (e) {
          console.error("Failed to parse preloaded settings data:", e);
        }
      } else {
        useApplicationSettingsStore.setState({
          settings: [],
          currentSetting: null,
          isLoading: false,
          latestTC: null,
          needsTCUpdate: false
        });
      }

      // Clean up localStorage
      localStorage.removeItem('preloaded-user');
      localStorage.removeItem('preloaded-settings');

      // Fetch the latest authentication state to determine login status
      const auth = await fetchLatestAuthentication();

      // Trigger a refresh of all stores to ensure UI has latest local data for authenticated sessions
      if (auth?.is_logged_in) {
        refreshStores(Object.values(StoreKeys));
      }

      // The component will re-render when currentAuthentication changes,
      // so we can derive the logged-in status from that.
    };

    hydrateAndCheckAuth();
    return () => { aborted = true; };
  }, [fetchLatestAuthentication, t]);

  useEffect(() => {
    // This effect runs whenever currentAuthentication changes or after the initial fetch
    if (currentAuthentication !== undefined) { // Check if the fetch is complete
      setIsLoggedIn(!!currentAuthentication?.is_logged_in);
    }
  }, [currentAuthentication]);


  if (backendError) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
        <div className="bg-white border shadow-lg rounded-lg max-w-md w-full p-6 text-center">
          <h2 className="text-2xl font-bold mb-4 text-destructive">
            {t("errors.connection_failed")}
          </h2>
          <p className="mb-6 text-muted-foreground">
            {backendError}
          </p>
          <button
            className="w-full bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90"
            onClick={() => window.location.reload()}
          >
            {t("common.retry")}
          </button>
        </div>
      </div>
    );
  }

  // User Guard: Ensure stores are hydrated and we have a user if logged in
  if (isLoggedIn === null || !_hasHydrated || (isLoggedIn && !currentUser)) {
    // Render a loading state or nothing while we determine auth status and stores are rehydrating
    return null;
  }

  return (
    <>
      <VersionHandler />
      <Routes>
      {isLoggedIn ? (
        <>
          <Route path="/home" element={<MainContent />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="sales" element={<Sales />} />
            <Route path="team" element={<TeamOrganization />} />
          </Route>
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Login />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/forgotpassword" element={<ForgotPassword />} />
          <Route path="/contact_sales" element={<ContactSales />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
    </>
  );
}

export default App;

