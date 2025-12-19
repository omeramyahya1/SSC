import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { Routes, Route } from "react-router-dom";
import Login from "./pages/authentication & onboarding/login";
import CreateNewAccount from "./pages/authentication & onboarding/createNewAccount";
import ForgotPassword from "./pages/authentication & onboarding/forgetPassword";
import CustomersPage from "./pages/CustomersPage";

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
  let started = false;
  if (started) return;
  started = true;

  (async () => {
    while (true) {
      try {
        const res = await fetch("http://localhost:5000/health");
        if (res.ok) break;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    await invoke("splash_screen");
  })();
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
