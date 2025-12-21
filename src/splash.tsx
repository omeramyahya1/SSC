import { invoke } from "@tauri-apps/api/core";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";
import { useAuthenticationStore } from "./store/useAuthenticationStore";

/**
 * Updates the status message element on the splash.html page.
 * @param message The message to display.
 */
function updateStatus(message: string) {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.innerText = message;
  }
}

/**
 * Pings the backend server until it's responsive.
 */
async function pingServer() {
  while (true) {
    try {
      const res = await fetch("http://localhost:5000/health");
      if (res.ok) {
        return;
      }
    } catch (error) {
      // Ignore fetch errors and retry
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * The main logic sequence for the splash screen.
 */
export async function runSplashScreenLogic() {
  try {
    // 1. Ping the server to ensure it's running
    updateStatus('Starting up...');
    await pingServer();

    // 2. Check for internet connectivity
    updateStatus('Checking connectivity...');
    if (!navigator.onLine) {
      updateStatus('Offline mode');
      // Wait a moment to show the message
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 3. Load required data
    updateStatus('Loading...');
    
    const latestAuth = await useAuthenticationStore.getState().fetchLatestAuthentication();
    
    if (latestAuth && latestAuth.user_id) {
      const userId = latestAuth.user_id;
      // Fetch user data and settings
      await useUserStore.getState().fetchUser(userId);
      // In a real scenario you would fetch settings related to the user
      // For now we will fetch all settings as an example
      await useApplicationSettingsStore.getState().fetchSettings();


      // Persist the loaded data to localStorage for the main window
      const { currentUser } = useUserStore.getState();
      const { settings } = useApplicationSettingsStore.getState();
      
      if (currentUser) {
        localStorage.setItem('preloaded-user', JSON.stringify(currentUser));
      }
      if (settings && settings.length > 0) {
        // Assuming we store the settings for the logged in user, or the first one for this example
        localStorage.setItem('preloaded-settings', JSON.stringify(settings[0]));
      }
    }

    updateStatus('Launching...');
    // Give a brief moment for the user to see the final message
    await new Promise(resolve => setTimeout(resolve, 500));

    // 4. Invoke splash screen closure
    await invoke("splash_screen");

  } catch (error) {
    console.error("Error during splash screen loading:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
    updateStatus(`Error: ${errorMessage}`);
    // Keep the splash screen open for a few seconds on error to show the message
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Still try to close the splash screen to not block the app entirely
    await invoke("splash_screen").catch(e => console.error("Failed to close splash screen on error:", e));
  }
}
