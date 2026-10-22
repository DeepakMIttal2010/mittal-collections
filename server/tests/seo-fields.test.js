import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Subcategory from "../models/Subcategory.js";
import Category from "../models/Category.js";
import { createUser, signToken, createCategory } from "./helpers.js";

// Hand-written search copy for landing pages (SEO title, meta
// description, "About" text) -- editable by an admin, served publicly.
describe("category / subcategory SEO copy", () => {
  const adminAuth = async () => ({ Authorization: `Bearer ${signToken(await createUser({ role: "admin" }))}` });

  it("an admin can set it on a subcategory; the public list returns it; empty clears it", async () => {
    const auth = await adminAuth();
    const category = await createCategory({ name: "Comforters", slug: "comforters" });
    const sub = await Subcategory.create({ category: category._id, groupLabel: "By Brand", name: "Tulip", slug: "tulip" });

    const res = await request(app)
      .put(`/api/subcategories/${sub._id}`)
      .set(auth)
      .field("seoTitle", "Tulip Comforter – Single & Double Bed, AC Reversible")
      .field("seoDescriptionHi", "ट्यूलिप कम्फर्टर सिंगल और डबल बेड")
      .field("aboutText", "First paragraph.\n\nSecond paragraph.");
    expect(res.status).toBe(200);

    const pub = await request(app).get("/api/subcategories");
    const tulip = pub.body.subcategories.find((s) => s.slug === "tulip");
    expect(tulip.seoTitle).toBe("Tulip Comforter – Single & Double Bed, AC Reversible");
    expect(tulip.seoDescriptionHi).toBe("ट्यूलिप कम्फर्टर सिंगल और डबल बेड");
    expect(tulip.aboutText).toBe("First paragraph.\n\nSecond paragraph.");
    // untouched fields stay as they were
    expect(tulip.name).toBe("Tulip");

    await request(app).put(`/api/subcategories/${sub._id}`).set(auth).field("seoTitle", "").expect(200);
    const fresh = await Subcategory.findById(sub._id);
    expect(fresh.seoTitle).toBe("");
    expect(fresh.aboutText).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("an admin can set it on a category, and a customer cannot", async () => {
    const category = await createCategory({ name: "Curtains", slug: "curtains" });

    const customer = await createUser();
    const denied = await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", `Bearer ${signToken(customer)}`)
      .field("seoTitle", "hacked");
    expect([401, 403]).toContain(denied.status);

    const ok = await request(app)
      .put(`/api/categories/${category._id}`)
      .set(await adminAuth())
      .field("seoTitle", "Curtains Online – Satin, Velvet & Eyelet Curtains")
      .field("aboutTextHi", "पर्दों के बारे में।");
    expect(ok.status).toBe(200);

    const fresh = await Category.findById(category._id);
    expect(fresh.seoTitle).toBe("Curtains Online – Satin, Velvet & Eyelet Curtains");
    expect(fresh.aboutTextHi).toBe("पर्दों के बारे में।");
  });
});
