// Fired on window whenever the logged-in customer's default delivery
// address changes (e.g. picked a different one from the Header dropdown).
// Anything that derives from "where is this customer" — the Ghaziabad
// delivery-banner check, in particular — listens for this to stay in
// sync, since it has no other way to know the switch happened.
export const DEFAULT_ADDRESS_CHANGED_EVENT = "mc:default-address-changed";

export const notifyDefaultAddressChanged = () => {
  window.dispatchEvent(new Event(DEFAULT_ADDRESS_CHANGED_EVENT));
};
