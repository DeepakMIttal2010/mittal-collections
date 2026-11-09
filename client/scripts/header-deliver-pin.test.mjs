// Header "Deliver to" slot (src/components/Header/Header.jsx): without a
// saved address (guests, or an account with none) it asks for a PIN code
// and opens the existing PincodeChecker, instead of a geo-IP city guess
// ("Deliver to Guest / Hyderabad" for an Aligarh visitor). Customers with
// a saved address keep their address dropdown.
//   node --test scripts/header-deliver-pin.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const header = read("src/components/Header/Header.jsx");

test("the header no longer guesses a city from the IP", () => {
  assert.doesNotMatch(header, /getMyLocation/);
  assert.doesNotMatch(header, /"Guest"/);
  assert.doesNotMatch(header, /Ghaziabad 201012/);
  // The Ghaziabad banner/footer hook keeps its own lookup.
  assert.match(read("src/hooks/useIsGhaziabadVisitor.js"), /getMyLocation\(\)/);
});

test("without a saved address: Enter PIN code (EN/HI) opening the existing PincodeChecker", () => {
  assert.match(header, /import PincodeChecker from "\.\.\/PincodeChecker";/);
  assert.match(header, /t\("Enter PIN code", "पिन कोड डालें"\)/);
  assert.match(header, /onClick=\{\(\) => setPinOpen\(\(open\) => !open\)\}/);
  assert.match(header, /aria-expanded=\{pinOpen\}/);
  assert.match(header, /\{pinOpen && \([\s\S]*?<PincodeChecker \/>/);
  // Guest -> sign in; logged in without an address -> add one.
  assert.match(header, /to=\{isLoggedIn \? "\/addresses\/add" : "\/login"\}/);
  assert.match(header, /t\("\+ Add address", "\+ पता जोड़ें"\)/);
  assert.match(header, /t\("Sign in to use a saved address", "सेव किया पता इस्तेमाल करने के लिए साइन इन करें"\)/);
});

test("dropdown closes on outside click and Escape (no onBlur timer)", () => {
  assert.match(header, /if \(!pinMenuRef\.current\?\.contains\(e\.target\)\) setPinOpen\(false\);/);
  assert.match(header, /if \(e\.key === "Escape"\) setPinOpen\(false\);/);
  assert.doesNotMatch(header, /onBlur=\{\(\) => setTimeout/);
});

test("same fixed-width slot; guests render final on the first paint; saved-address branch unchanged", () => {
  // Placeholder only while a logged-in customer's addresses load.
  assert.match(header, /const \[addressesChecked, setAddressesChecked\] = useState\(\(\) => !isLoggedIn\);/);
  assert.match(header, /\{!addressesChecked \? \(\s*<div className="hidden lg:flex items-start gap-1\.5 shrink-0 w-36 leading-tight" aria-hidden="true">/);
  assert.match(header, /<div ref=\{pinMenuRef\} className="relative hidden lg:block shrink-0 w-36">/);
  // Saved address: same branch, dropdown and actions as before.
  assert.match(header, /\) : isLoggedIn && savedAddresses\.length > 0 \? \(/);
  assert.match(header, /onMouseEnter=\{openAddressMenu\}/);
  assert.match(header, /t\("Choose delivery address", "डिलीवरी पता चुनें"\)/);
  assert.match(header, /\[address\.city, address\.pincode\]\s*\.filter\(Boolean\)\s*\.join\(" "\)/);
});
