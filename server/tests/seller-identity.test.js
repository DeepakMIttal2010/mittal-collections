import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";

// Razorpay is never reached (COD orders only); the mailer is mocked so the
// order confirmation email can be inspected.
const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import SiteSettings from "../models/SiteSettings.js";
import { buildSellerEmailBlock, loadSellerEmailBlock } from "../utils/sellerEmailBlock.js";
import { createUser, signToken, createProduct } from "./helpers.js";

const SELLER = {
  proprietorName: "Test Proprietor",
  grievanceOfficerName: "Test Officer",
  grievanceOfficerDesignation: "Proprietor",
  address: "Test Address, Ghaziabad",
  email: "support@example.com",
  phone: "+91-9000000000",
};

// Spies on SiteSettings.findOne must not leak into the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

const putSettings = (token, body) =>
  request(app).put("/api/settings").set("Authorization", `Bearer ${token}`).send(body);

describe("site settings: seller identity fields", () => {
  it("default to empty strings", async () => {
    const settings = await SiteSettings.create({});
    expect(settings.proprietorName).toBe("");
    expect(settings.grievanceOfficerName).toBe("");
    expect(settings.grievanceOfficerDesignation).toBe("");
  });

  it("save trimmed values and return them on the public endpoint", async () => {
    const admin = await createUser({ role: "admin" });
    const res = await putSettings(signToken(admin), {
      proprietorName: "  Test Proprietor  ",
      grievanceOfficerName: " Test Officer ",
      grievanceOfficerDesignation: " Proprietor ",
    });
    expect(res.status).toBe(200);

    const pub = await request(app).get("/api/settings");
    expect(pub.body.settings.proprietorName).toBe("Test Proprietor");
    expect(pub.body.settings.grievanceOfficerName).toBe("Test Officer");
    expect(pub.body.settings.grievanceOfficerDesignation).toBe("Proprietor");
  });

  it("reject values over 100 characters or non-text with a 400", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const tooLong = await putSettings(token, { proprietorName: "x".repeat(101) });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toMatch(/proprietorName/);

    const notText = await putSettings(token, { grievanceOfficerName: { $gt: "" } });
    expect(notText.status).toBe(400);

    const exactly100 = await putSettings(token, { grievanceOfficerDesignation: "y".repeat(100) });
    expect(exactly100.status).toBe(200);
  });

  it("a partial update leaves every other setting unchanged", async () => {
    await SiteSettings.create({ ...SELLER, codCharge: 50, supportHours: "Mon-Sat" });
    const admin = await createUser({ role: "admin" });

    const res = await putSettings(signToken(admin), { grievanceOfficerDesignation: "Owner" });
    expect(res.status).toBe(200);

    const saved = await SiteSettings.findOne().lean();
    expect(saved.grievanceOfficerDesignation).toBe("Owner");
    expect(saved.proprietorName).toBe(SELLER.proprietorName);
    expect(saved.grievanceOfficerName).toBe(SELLER.grievanceOfficerName);
    expect(saved.address).toBe(SELLER.address);
    expect(saved.email).toBe(SELLER.email);
    expect(saved.phone).toBe(SELLER.phone);
    expect(saved.supportHours).toBe("Mon-Sat");
    expect(saved.codCharge).toBe(50);
  });

  it("only an admin can change them", async () => {
    expect((await request(app).put("/api/settings").send({ proprietorName: "X" })).status).toBe(401);

    const customer = await createUser();
    const asCustomer = await putSettings(signToken(customer), { proprietorName: "X" });
    expect(asCustomer.status).toBe(403);

    expect(await SiteSettings.findOne({ proprietorName: "X" })).toBeNull();
  });
});

describe("order confirmation email: seller block", () => {
  it("builds the English and Hindi block from settings", () => {
    const en = buildSellerEmailBlock(SELLER, false);
    expect(en).toContain("Sold by: Mittal Collections (Proprietor: Test Proprietor), Test Address, Ghaziabad");
    expect(en).toContain("Customer Support / Grievance Contact: support@example.com · +91-9000000000");

    const hi = buildSellerEmailBlock(SELLER, true);
    expect(hi).toContain("विक्रेता: Mittal Collections (प्रोपराइटर: Test Proprietor), Test Address, Ghaziabad");
    expect(hi).toContain("ग्राहक सहायता / शिकायत संपर्क: support@example.com · +91-9000000000");
  });

  it("leaves out lines whose fields are empty, and is empty when nothing is set", () => {
    expect(buildSellerEmailBlock({}, false)).toBe("");
    expect(buildSellerEmailBlock(null, true)).toBe("");
    expect(buildSellerEmailBlock({ proprietorName: "  ", address: "A", email: "" }, false)).toBe("");

    const contactOnly = buildSellerEmailBlock({ email: "support@example.com" }, false);
    expect(contactOnly).toContain("Customer Support: support@example.com");
    expect(contactOnly).not.toMatch(/Sold by|Grievance|undefined|null|·/);

    const sellerOnly = buildSellerEmailBlock({ proprietorName: "Test Proprietor" }, false);
    expect(sellerOnly).toContain("Sold by: Mittal Collections (Proprietor: Test Proprietor)</p>");
    expect(sellerOnly).not.toMatch(/Customer Support|undefined|null|, </);
  });

  it("escapes HTML in admin-entered values", () => {
    const html = buildSellerEmailBlock({ proprietorName: "<b>x</b>" }, false);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;");
  });

  it("returns an empty block when the settings read fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(SiteSettings, "findOne").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    expect(await loadSellerEmailBlock(false)).toBe("");
  });

  describe("on a placed order", () => {
    const shippingAddress = {
      fullName: "Test User",
      mobile: "9000000000",
      address: "123 Test Street",
      city: "Ghaziabad",
      state: "Uttar Pradesh",
      pincode: "201012",
    };

    beforeEach(() => {
      sendEmail.mockReset().mockResolvedValue(undefined);
    });

    const placeCodOrder = async () => {
      const user = await createUser();
      const product = await createProduct({ price: 999, stock: 5 });
      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${signToken(user)}`)
        .send({
          orderItems: [{ product: product._id.toString(), name: product.name, image: product.image, price: product.price, quantity: 1 }],
          shippingAddress,
          paymentMethod: "COD",
        });
      expect(res.status).toBe(201);
      const confirmation = sendEmail.mock.calls.find(([arg]) => /order is confirmed/.test(arg.subject));
      expect(confirmation).toBeDefined();
      return { html: confirmation[0].html, order: res.body.order };
    };

    it("includes the seller block when settings are filled, keeping the existing content", async () => {
      await SiteSettings.create({ ...SELLER, codCharge: 50 });
      const { html, order } = await placeCodOrder();

      expect(html).toContain(`Order ID: ${order._id}`);
      expect(html).toContain("Payment method: COD");
      expect(html).toContain("View your order");
      expect(html).toContain("Sold by: Mittal Collections (Proprietor: Test Proprietor)");
      expect(html).toContain("support@example.com");
    });

    it("omits the block when the seller settings are empty", async () => {
      await SiteSettings.create({ codCharge: 50 });
      const { html } = await placeCodOrder();

      expect(html).toContain("View your order");
      expect(html).not.toMatch(/Sold by|Customer Support/);
      // Nothing is appended after the order link (the test env has no
      // CLIENT_URL, so only the text after the link is checked).
      expect(html.split("View your order</a></p>")[1].trim()).toBe("");
    });

    it("still sends the email when the seller settings read fails", async () => {
      await SiteSettings.create({ ...SELLER, codCharge: 50 });
      vi.spyOn(console, "error").mockImplementation(() => {});
      const realFindOne = SiteSettings.findOne.bind(SiteSettings);
      vi.spyOn(SiteSettings, "findOne").mockImplementation((...args) => {
        const query = realFindOne(...args);
        const realSelect = query.select.bind(query);
        query.select = (fields) => {
          if (String(fields).includes("proprietorName")) throw new Error("db down");
          return realSelect(fields);
        };
        return query;
      });

      const { html } = await placeCodOrder();
      expect(html).toContain("View your order");
      expect(html).not.toMatch(/Sold by|Customer Support/);
    });
  });
});
