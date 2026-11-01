import SiteSettings from "../models/SiteSettings.js";
import { escapeHtml } from "./escapeHtml.js";

// Compact seller identity/contact paragraph for the order confirmation
// email, built from admin-editable SiteSettings (same fields the footer
// and Contact page use). Lines whose fields are empty are left out, and
// the whole block is "" when nothing is set -- never "undefined"/"null".
//   - "Sold by" line needs proprietorName (address appended if set).
//   - Contact line needs email or phone; it is labelled as the grievance
//     contact only once a grievance officer is named.
const clean = (value) => (typeof value === "string" ? value.trim() : "");

export const buildSellerEmailBlock = (settings, isHindi = false) => {
  const s = settings || {};
  const proprietor = clean(s.proprietorName);
  const address = clean(s.address);
  const contact = [clean(s.email), clean(s.phone)].filter(Boolean);
  const hasGrievanceOfficer = Boolean(clean(s.grievanceOfficerName));

  const lines = [];
  if (proprietor) {
    const seller = isHindi
      ? `विक्रेता: Mittal Collections (प्रोपराइटर: ${escapeHtml(proprietor)})`
      : `Sold by: Mittal Collections (Proprietor: ${escapeHtml(proprietor)})`;
    lines.push(address ? `${seller}, ${escapeHtml(address)}` : seller);
  }
  if (contact.length) {
    const label = isHindi
      ? hasGrievanceOfficer
        ? "ग्राहक सहायता / शिकायत संपर्क"
        : "ग्राहक सहायता"
      : hasGrievanceOfficer
        ? "Customer Support / Grievance Contact"
        : "Customer Support";
    lines.push(`${label}: ${contact.map(escapeHtml).join(" · ")}`);
  }

  if (!lines.length) return "";
  return `<p style="font-size:12px;color:#64748b;">${lines.join("<br>")}</p>`;
};

// Reads settings for the block. Any failure returns "" so the caller's
// email still goes out unchanged, just without this optional block.
export const loadSellerEmailBlock = async (isHindi = false) => {
  try {
    const settings = await SiteSettings.findOne()
      .select("proprietorName grievanceOfficerName address email phone")
      .lean();
    return buildSellerEmailBlock(settings, isHindi);
  } catch (error) {
    console.error("Seller email block error:", error);
    return "";
  }
};
