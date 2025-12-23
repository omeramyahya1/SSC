import { useEffect, useState } from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/authentication & onboarding/login";
import Registration from "./pages/authentication & onboarding/registration";
import ForgotPassword from "./pages/authentication & onboarding/forgetPassword";
import Dashboard from "./pages/dashboard";
import ChangePassword from "./pages/authentication & onboarding/changePassword";
import Help from "./pages/help";
import Sales from "./pages/sales";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";
import { useAuthenticationStore } from "./store/useAuthenticationStore";

interface AppRoute {
  path: string;
  element: React.ReactNode;
}

// Routes for unauthenticated users
const authRoutes: AppRoute[] = [
  { path: "/", element: <Login /> },
  { path: "/registration", element: <Registration /> },
  { path: "/forgotpassword", element: <ForgotPassword /> },
  { path: "/chagne_password", element: <ChangePassword /> },
  { path: "/help", element: <Help /> },
  { path: "/sales", element: <Sales /> },
  // Redirect any other path to the login page
  { path: "*", element: <Navigate to="/" replace /> },
];

// Routes for authenticated users
const mainRoutes: AppRoute[] = [
  { path: "/dashboard", element: <Dashboard /> },
  { path: "/help", element: <Help /> },
  // Redirect root and any other path to the dashboard
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
];

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

  const routesToRender = isLoggedIn ? mainRoutes : authRoutes;

  return (
    <Routes>
      {routesToRender.map((route, index) => (
        <Route 
          key={index}
          path={route.path}
          element={route.element}
        />
      ))}
    </Routes>
  );
}

export default App;

