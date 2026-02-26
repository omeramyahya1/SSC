import { useEffect, useState } from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/authentication & onboarding/login";
import Registration from "./pages/authentication & onboarding/registration";
import ForgotPassword from "./pages/authentication & onboarding/forgetPassword";
import MainContent from "./pages/MainContent";
import ChangePassword from "./pages/authentication & onboarding/changePassword";
import Help from "./pages/Help";
import Sales from "./pages/Sales";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";
import { useAuthenticationStore } from "./store/useAuthenticationStore";
import { Dashboard } from "./pages/dashboard/Dashboard";
import CustomersPage from "./pages/customers/Customers";
import Inventory from "./pages/inventory/Inventory";
import InvoicesFinance from "./pages/invoices & finances/InvoicesFinance";
import TeamOrganization from "./pages/team & organization/TeamOrganization";

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const { currentAuthentication, fetchLatestAuthentication } = useAuthenticationStore();

  useEffect(() => {
    const hydrateAndCheckAuth = async () => {
      // Hydrate stores from data pre-loaded by the splash screen
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
          useApplicationSettingsStore.setState({ settings: [settingsData], isLoading: false });
        } catch (e) {
          console.error("Failed to parse preloaded settings data:", e);
        }
      }

      // Clean up localStorage
      localStorage.removeItem('preloaded-user');
      localStorage.removeItem('preloaded-settings');

      // Fetch the latest authentication state to determine login status
      await fetchLatestAuthentication();
      // The component will re-render when currentAuthentication changes,
      // so we can derive the logged-in status from that.
    };

    hydrateAndCheckAuth();
  }, [fetchLatestAuthentication]);

  useEffect(() => {
    // This effect runs whenever currentAuthentication changes or after the initial fetch
    if (currentAuthentication !== undefined) { // Check if the fetch is complete
      setIsLoggedIn(!!currentAuthentication?.is_logged_in);
    }
  }, [currentAuthentication]);


  if (isLoggedIn === null) {
    // Render a loading state or nothing while we determine auth status
    return null;
  }

  return (
    <Routes>
      {isLoggedIn ? (
        <>
          <Route path="/home" element={<MainContent />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="invoices" element={<InvoicesFinance />} />
            <Route path="team" element={<TeamOrganization />} />
          </Route>
          <Route path="/help" element={<Help />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </>
      ) : (
        <>
          <Route path="/" element={<Login />} />
          <Route path="/registration" element={<Registration />} />
          <Route path="/forgotpassword" element={<ForgotPassword />} />
          <Route path="/change_password" element={<ChangePassword />} />
          <Route path="/help" element={<Help />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      )}
    </Routes>
  );
}

export default App;

