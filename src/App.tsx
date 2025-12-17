import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { useTranslation } from "react-i18next";

function App() {

  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ar': 'en';
    i18n.changeLanguage(newLang)
  }

  async function waitForBackend() {
  while (true) {
    try {
      const res = await fetch("http://localhost:5000/health");
      if (res.ok) {
        return;
      }
    } catch {
      // backend not ready yet
    }

    await new Promise((r) => setTimeout(r, 500));
  }
}



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
    <main>
      <div className="p-4">
      <h1 className="text-2xl font-bold">{t("welcome")}</h1>
      <h1 className="text-start font-semibold">{t("test")}</h1>
      <p className="text-neutral mt-2">{t('description')}</p>
      
      <button 
        onClick={toggleLanguage}
        className="btn-primary mt-4"
      >
        {i18n.language === 'en' ? 'تحويل للعربية' : 'Switch to English'}
      </button>
    </div>
    </main>
  );
}

export default App;
