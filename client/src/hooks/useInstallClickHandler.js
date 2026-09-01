import { toast } from "react-toastify";

import { useInstallPrompt } from "./useInstallPrompt";
import { useLanguage } from "../context/LanguageContext";

// Shared by the desktop header dropdown and the mobile account drawer's
// "Download the App" action.
export function useInstallClickHandler() {
  const { canPromptNatively, promptInstall } = useInstallPrompt();
  const { t } = useLanguage();

  return async () => {
    if (canPromptNatively) {
      await promptInstall();
      return;
    }

    // No `beforeinstallprompt` yet (Chrome hasn't decided to offer it) or
    // never will (iOS Safari has no such API) — give people the manual
    // path via a toast instead of doing nothing on click.
    toast.info(
      t(
        'From your browser\'s menu, choose "Add to Home Screen" or "Install App".',
        'अपने ब्राउज़र के मेनू से "Add to Home Screen" या "Install App" चुनें।',
      ),
      { autoClose: 6000 },
    );
  };
}
