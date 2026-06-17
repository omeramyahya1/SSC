import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useUserStore } from "./store/useUserStore";
import { useApplicationSettingsStore } from "./store/useApplicationSettingsStore";
import { useAuthenticationStore } from "./store/useAuthenticationStore";
import { getBackendBaseUrl } from "./api/backendBaseUrl";

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
 * Used as a fallback and to ensure the port is actually listening.
 */
async function pingServer() {
  let attempts = 0;
  const maxAttempts = 120 // 60 seconds at 500ms intervals
  const warningThreshold = 40; // 20 seconds at 500ms intervals

  while (true) {
    if (attempts >= maxAttempts) {
      throw new Error("Backend failed to start within 60 seconds");
    }

    try {
      const baseUrl = await getBackendBaseUrl();
      const res = await fetch(`${baseUrl}health`);
      
      if (res.ok) {
        return;
      }
      
      attempts++;
    } catch (error) {
      attempts++;
      if (attempts > warningThreshold) {
        const msg = error instanceof Error ? error.message : "Backend unreachable";
        updateStatus(`Waiting for backend... (${msg})`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * The main logic sequence for the splash screen.
 */
export async function runSplashScreenLogic() {
  try {
    // 1. Wait for the backend to be ready
    updateStatus('Starting up...');
    
    await new Promise<void>(async (resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) reject(new Error("Backend startup timed out (60s)"));
      }, 60000);

      const cleanup = (unlistenFn?: () => void) => {
        resolved = true;
        clearTimeout(timeout);
        if (unlistenFn) unlistenFn();
      };

      // 1a. Listen for the push signal
      const unlisten = await listen('backend-ready', () => {
        if (!resolved) {
          console.log("SPLASH: Backend signal received (Event)");
          cleanup(unlisten);
          resolve();
        }
      });

      // 1b. Fallback polling
      pingServer().then(() => {
        if (!resolved) {
          console.log("SPLASH: Backend ready (Polling fallback)");
          cleanup(unlisten);
          resolve();
        }
      }).catch((err) => {
        if (!resolved) {
          cleanup(unlisten);
          reject(err);
        }
      });
    });

    console.log("SPLASH: Backend is ready, proceeding to data load...");

    // 2. Check for internet connectivity
    updateStatus('Checking connectivity...');
    if (!navigator.onLine) {
      updateStatus('Offline mode');
      // Wait a moment to show the message
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // 3. Load required data
    updateStatus('Loading profile...');
    const latestAuth = await useAuthenticationStore.getState().fetchLatestAuthentication();

    if (latestAuth && latestAuth.user_uuid) {
      const userUUID = latestAuth.user_uuid;
      updateStatus('Fetching user data...');
      await useUserStore.getState().fetchUser(userUUID);
      
      updateStatus('Loading settings...');
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

// Auto-execute when loaded in the browser
if (typeof window !== 'undefined') {
  runSplashScreenLogic();
}
