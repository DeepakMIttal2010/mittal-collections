// ============================
// Verify Webhook (Meta calls this once, when the Callback URL is saved
// in the WhatsApp app dashboard, to confirm we actually own this
// endpoint before subscribing it to real events)
// ============================
export const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.status(403).send("Verification failed");
};

// ============================
// Receive Webhook Events (message-status updates, incoming replies —
// Meta requires this endpoint to exist and return 200 for the
// subscription to stay active, even before we act on any event type)
// ============================
export const receiveWebhook = (req, res) => {
  // Always 200 quickly — Meta retries/disables a webhook that doesn't
  // acknowledge fast, regardless of what's inside the payload.
  res.status(200).send("OK");

  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (entry?.statuses) {
      console.log("WhatsApp status update:", JSON.stringify(entry.statuses));
    }
    if (entry?.messages) {
      console.log("WhatsApp incoming message:", JSON.stringify(entry.messages));
    }
  } catch (error) {
    console.error("WhatsApp Webhook Parse Error:", error);
  }
};
