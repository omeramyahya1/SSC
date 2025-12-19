import { useEffect } from "react";
import "./App.css";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/authentication & onboarding/login";
import CreateNewAccount from "./pages/authentication & onboarding/createNewAccount";
import ForgotPassword from "./pages/authentication & onboarding/forgetPassword";
import CustomersPage from "./pages/CustomersPage";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";

interface AppRoute {
  path: string;
  element: React.ReactNode;
}

const appRoutes: AppRoute[] = [
  {
    path: "/",
    element: <Login />,
  },
  {
    path: "/register",
    element: <CreateNewAccount />,
  },
  {
    path: "/forgotpassword",
    element: <ForgotPassword />,
  },
  {
    path: "/customers",
    element: <CustomersPage />,
  },
]


function App() {

  useEffect(() => {
    // This effect runs once when the main window opens.
    // It hydrates the Zustand stores from the data pre-loaded by the splash screen.
    const preloadedUser = localStorage.getItem('preloaded-user');
    const preloadedSettings = localStorage.getItem('preloaded-settings');

    if (preloadedUser) {
      try {
        const userData = JSON.parse(preloadedUser);
        useUserStore.setState({ userData, isLoading: false });
        console.log('Hydrated user data from splash screen:', userData);
      } catch (e) {
        console.error("Failed to parse preloaded user data:", e);
      }
    }

    if (preloadedSettings) {
      try {
        const settingsData = JSON.parse(preloadedSettings);
        // Since settings are also a list, we set the 'items' state.
        // And we assume here we only loaded one settings object.
        useApplicationSettingsStore.setState({ items: [settingsData], isLoading: false });
        console.log('Hydrated settings data from splash screen:', settingsData);
      } catch (e) {
        console.error("Failed to parse preloaded settings data:", e);
      }
    }

    // Clean up localStorage to prevent using stale data on next launch
    localStorage.removeItem('preloaded-user');
    localStorage.removeItem('preloaded-settings');
  }, []);


  return (
    <Routes>
      {appRoutes.map((route, index) => (
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
