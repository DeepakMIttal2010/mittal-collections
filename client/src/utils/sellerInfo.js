// Seller identity + grievance officer text for the footer and the Contact
// page, built from admin-editable SiteSettings (Admin -> Settings). Every
// value comes from settings -- nothing about the seller is hardcoded -- and
// any line whose required fields are empty comes back as "" so the caller
// can simply skip it (no "undefined", "null" or stray punctuation).
//   - sellerLine needs proprietorName.
//   - grievanceOfficer needs grievanceOfficerName (designation optional).
//   - grievanceLine also needs at least one of email/phone to contact.
const clean = (value) => (typeof value === "string" ? value.trim() : "");

export const buildSellerInfo = (settings, isHindi = false) => {
  const s = settings || {};
  const proprietor = clean(s.proprietorName);
  const officerName = clean(s.grievanceOfficerName);
  const designation = clean(s.grievanceOfficerDesignation);
  const email = clean(s.email);
  const phone = clean(s.phone);

  const grievanceOfficer = officerName
    ? [officerName, designation].filter(Boolean).join(", ")
    : "";
  const contact = [email, phone].filter(Boolean).join(" · ");

  const sellerLine = proprietor
    ? isHindi
      ? `विक्रेता: Mittal Collections (प्रोपराइटर: ${proprietor})`
      : `Sold by: Mittal Collections (Proprietor: ${proprietor})`
    : "";

  const grievanceLine =
    grievanceOfficer && contact
      ? `${isHindi ? "शिकायत अधिकारी" : "Grievance Officer"}: ${grievanceOfficer} · ${contact}`
      : "";

  return { proprietor, grievanceOfficer, email, phone, sellerLine, grievanceLine };
};
