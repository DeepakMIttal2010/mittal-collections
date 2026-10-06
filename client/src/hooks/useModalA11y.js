import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Shared focus management for every modal/dialog/drawer in the app — a
// 2026-10-05 accessibility audit found none of them (QuickViewModal,
// CartDrawer, ReturnRequestModal, WelcomeBenefitsPopup, the admin
// Share/QuickView dialogs) trapped focus, moved focus in on open, or
// restored it on close, and only one (ProductDetails.jsx's image
// lightbox) even had Escape-to-close. A keyboard user tabbing through an
// open modal could wander out into the dimmed page behind it with no
// indication they'd left the dialog, and Escape did nothing anywhere
// else.
//
// Usage: const panelRef = useModalA11y(isOpen, onClose); then put
// `ref={panelRef}` on the modal's own panel element (the bordered/
// elevated box, not the full-screen overlay behind it) and
// `role="dialog" aria-modal="true"` on that same element.
export function useModalA11y(active, onClose) {
  const panelRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    // Deferred a frame — the panel's own content (and therefore its
    // focusable children) isn't in the DOM yet during the same render
    // that flips `active` to true.
    const focusFrame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector(FOCUSABLE_SELECTOR);
      (first || panel).focus();
    });

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }

      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusables = [...panel.querySelectorAll(FOCUSABLE_SELECTOR)];
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      // Cycle within the panel instead of letting Tab escape into the
      // dimmed page behind it — the actual "trap" part of a focus trap.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      // Only refocus a still-connected element — if whatever opened this
      // modal has since been removed from the DOM (e.g. the page
      // navigated away while the modal was open), .focus() on a detached
      // node is a silent no-op, so this check is just for clarity, not
      // strictly required.
      if (previouslyFocusedRef.current?.isConnected) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [active, onClose]);

  return panelRef;
}
