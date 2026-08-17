import { useEffect, useState } from "react";

const DISMISS_KEY = "mc_install_banner_dismissed_until";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

const isDismissActive = () => {
  const until = Number(localStorage.getItem(DISMISS_KEY));
  return Boolean(until) && Date.now() < until;
};

// Chrome only lets us trigger the *native* install dialog once it has
// fired `beforeinstallprompt` (its own timing, not ours) — but the user
// wants the header icon itself to always be there whenever the app isn't
// installed, not blink in and out depending on whether that event has
// fired yet. So `showIcon` is the broad "not installed, not snoozed"
// signal the icon renders on, while `canPromptNatively` tells the caller
// whether clicking it can open the real browser dialog right now or
// needs to fall back to manual instructions (always the case on iOS
// Safari, which never fires this event at all).
export function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(isDismissActive);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true,
    );

    const handlePrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setIsStandalone(true);
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!installEvent) return { prompted: false };

    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);

    if (outcome === "dismissed") {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DURATION_MS),
      );
      setDismissed(true);
    }

    return { prompted: true };
  };

  return {
    showIcon: !isStandalone && !dismissed,
    canPromptNatively: Boolean(installEvent),
    promptInstall,
  };
}
