// States that website orders may be delivered to, matched against the
// State India Post returns for the delivery PIN code (never the state the
// customer typed). The business is not GST-registered, and an
// inter-state supply of goods requires registration (CGST Act s.24(i)),
// so this stays Uttar Pradesh only until the owner approves expanding it
// after a GST review. Deliberately not an admin setting: adding a state is
// a code change that goes through review.
//
// An empty or malformed list never means "everywhere" — see
// getAllowedDeliveryStates in utils/deliveryEligibility.js.
export const ALLOWED_DELIVERY_STATES = ["Uttar Pradesh"];
