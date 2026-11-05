// Ticket pages must send the login that belongs to their side of the site:
// the admin panel's ticket page uses adminToken, the customer's ticket page
// uses the storefront token. The admin page used to call the customer
// functions, so an admin logged in only to the admin panel saw "Ticket not
// found" and couldn't reply (found 2026-11-04 while testing delivery
// feedback tickets).
//   node --test scripts/admin-ticket-auth.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (rel) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const service = read("src/services/ticketService.js");

// exported function name -> which header helper its body uses
const headersByFunction = Object.fromEntries(
  [...service.matchAll(/export const (\w+) = async[\s\S]*?\n};/g)].map(([body, name]) => [
    name,
    body.includes("adminAuthHeaders()") ? "admin" : body.includes("authHeaders()") ? "customer" : "none",
  ]),
);

const ticketImports = (page) => {
  const match = page.match(/import \{([^}]*)\} from "[./]*services\/ticketService"/);
  assert.ok(match, "page imports from ticketService");
  return match[1].split(",").map((s) => s.trim()).filter(Boolean);
};

test("every ticket call on the admin ticket page sends the admin token", () => {
  const used = ticketImports(read("src/pages/admin/AdminTicketDetail.jsx"));

  assert.ok(used.length > 0);
  for (const name of used) {
    assert.equal(headersByFunction[name], "admin", `${name} must use adminAuthHeaders`);
  }
});

test("the admin ticket list sends the admin token", () => {
  for (const name of ticketImports(read("src/pages/admin/AdminTickets.jsx"))) {
    assert.equal(headersByFunction[name], "admin", `${name} must use adminAuthHeaders`);
  }
});

test("the customer's own ticket pages keep sending the storefront token", () => {
  for (const page of ["src/pages/TicketDetail.jsx", "src/pages/Tickets.jsx"]) {
    for (const name of ticketImports(read(page))) {
      assert.equal(headersByFunction[name], "customer", `${page}: ${name} must use authHeaders`);
    }
  }
});

test("admin and customer versions of the same call hit the same endpoint", () => {
  const url = (name) => service.match(new RegExp(`export const ${name} =[\\s\\S]*?fetch\\(\`([^\`]+)\``))[1];

  assert.equal(url("getTicketByIdAdmin"), url("getTicketById"));
  assert.equal(url("addTicketMessageAdmin"), url("addTicketMessage"));
});
