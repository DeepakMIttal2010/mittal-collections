const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// Escapes customer/admin free-text before it's interpolated into an
// outbound HTML email (e.g. a ticket's subject/message) — unlike
// content rendered in the browser (plain JSX text nodes, never
// dangerouslySetInnerHTML for this kind of content), nothing else in
// the email-sending path neutralizes markup, so unescaped text lets
// either side inject arbitrary HTML/links into the mail the other
// reads.
export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
