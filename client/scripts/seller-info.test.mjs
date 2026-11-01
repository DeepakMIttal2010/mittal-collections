// Seller identity / grievance text shared by the footer and Contact page
// (src/utils/sellerInfo.js). Lines with missing fields must come back
// empty so nothing like "undefined", "null" or a stray "·" is shown.
//   node --test scripts/seller-info.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildSellerInfo } from "../src/utils/sellerInfo.js";

const FULL = {
  proprietorName: " Test Proprietor ",
  grievanceOfficerName: "Test Officer",
  grievanceOfficerDesignation: "Proprietor",
  email: "support@example.com",
  phone: "+91-9000000000",
};

test("English lines", () => {
  const s = buildSellerInfo(FULL, false);
  assert.equal(s.sellerLine, "Sold by: Mittal Collections (Proprietor: Test Proprietor)");
  assert.equal(s.grievanceLine, "Grievance Officer: Test Officer, Proprietor · support@example.com · +91-9000000000");
  assert.equal(s.grievanceOfficer, "Test Officer, Proprietor");
});

test("Hindi lines", () => {
  const s = buildSellerInfo(FULL, true);
  assert.equal(s.sellerLine, "विक्रेता: Mittal Collections (प्रोपराइटर: Test Proprietor)");
  assert.equal(s.grievanceLine, "शिकायत अधिकारी: Test Officer, Proprietor · support@example.com · +91-9000000000");
});

test("empty, null or missing settings give empty lines", () => {
  for (const settings of [undefined, null, {}, { proprietorName: "   ", grievanceOfficerName: null }]) {
    const s = buildSellerInfo(settings, false);
    assert.equal(s.sellerLine, "");
    assert.equal(s.grievanceLine, "");
    assert.equal(s.grievanceOfficer, "");
  }
});

test("partial settings hide only what is missing", () => {
  const noDesignation = buildSellerInfo({ ...FULL, grievanceOfficerDesignation: "" }, false);
  assert.equal(noDesignation.grievanceLine, "Grievance Officer: Test Officer · support@example.com · +91-9000000000");

  const emailOnly = buildSellerInfo({ ...FULL, phone: "" }, false);
  assert.equal(emailOnly.grievanceLine, "Grievance Officer: Test Officer, Proprietor · support@example.com");

  const noContact = buildSellerInfo({ ...FULL, email: "", phone: "" }, false);
  assert.equal(noContact.grievanceLine, "");
  assert.equal(noContact.sellerLine, "Sold by: Mittal Collections (Proprietor: Test Proprietor)");

  const noOfficer = buildSellerInfo({ ...FULL, grievanceOfficerName: "" }, true);
  assert.equal(noOfficer.grievanceLine, "");
  assert.equal(noOfficer.grievanceOfficer, "");

  for (const s of [noDesignation, emailOnly, noContact, noOfficer]) {
    assert.doesNotMatch(Object.values(s).join(" "), /undefined|null|, ·|· ·|,\s*$/);
  }
});

test("footer and Contact page render the helper's lines, not hardcoded seller facts", () => {
  const footer = fs.readFileSync(new URL("../src/components/Footer/Footer.jsx", import.meta.url), "utf8");
  const contact = fs.readFileSync(new URL("../src/pages/Contact.jsx", import.meta.url), "utf8");
  assert.match(footer, /buildSellerInfo\(settings, language === "hi"\)/);
  assert.match(footer, /seller\.sellerLine &&/);
  assert.match(footer, /seller\.grievanceLine &&/);
  assert.match(contact, /buildSellerInfo\(settings, language === "hi"\)/);
  assert.match(contact, /seller\.proprietor \|\| seller\.grievanceOfficer/);
  // The complaint-timeline line is gated on a named grievance officer.
  assert.match(contact, /\{seller\.grievanceOfficer && \(\s*<p[^>]*>\s*\{t\(\s*"We acknowledge consumer complaints within 48 hours/);
  for (const src of [footer, contact]) assert.doesNotMatch(src, /Geetika/i);
});
