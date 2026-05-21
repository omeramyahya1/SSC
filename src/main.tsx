import { createRoot } from "react-dom/client";
import { HashRouter } from 'react-router-dom';
import App from "./App";
import './i18'
import "./App.css";


createRoot(document.getElementById("root") as HTMLElement).render(
  <>
    <HashRouter>
      <App />
    </HashRouter>
  </>,
);
