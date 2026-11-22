import { describe, it, expect, vi } from "vitest";
import request from "supertest";

// The upload itself stays in memory (multer.memoryStorage); only the
// Cloudinary push in imageOptimizer is replaced, so no network call is made.
vi.mock("../middleware/imageOptimizer.js", () => ({
  default: (req, _res, next) => {
    if (req.file) req.file.path = "https://example.com/uploaded.jpg";
    next();
  },
}));

import "./setup.js";
import app from "../app.js";
import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";
import Article from "../models/Article.js";
import { createUser, signToken, createCategory } from "./helpers.js";

// PR-3 (admin audit SEO-01): renaming a category, subcategory or article
// must not change its URL slug. Indexed URLs, home banners, footer links
// and the client's hardcoded /category/... links all point at the slug.

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const adminToken = async () => signToken(await createUser({ role: "admin" }));

const createSubcategory = (category, overrides = {}) =>
  Subcategory.create({
    category: category._id,
    groupLabel: "Size",
    name: "Double Bed",
    slug: "double-bed",
    ...overrides,
  });

const createArticle = (overrides = {}) =>
  Article.create({
    title: "How to Choose a Bedsheet",
    slug: "how-to-choose-a-bedsheet",
    excerpt: "A short guide.",
    content: "<p>Thread count, fabric and size.</p>",
    isPublished: true,
    ...overrides,
  });

describe("PR-3: category rename keeps the slug", () => {
  it("renaming changes the name but not the slug, in the DB and in the public list", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Comforters", slug: "comforters" });

    const res = await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Comforters & Quilts");

    expect(res.status).toBe(200);
    const after = await Category.findById(category._id);
    expect(after.name).toBe("Comforters & Quilts");
    expect(after.slug).toBe("comforters");

    const list = await request(app).get("/api/categories");
    const listed = list.body.categories.find((c) => String(c._id) === String(category._id));
    expect(listed.slug).toBe("comforters");
    expect(listed.name).toBe("Comforters & Quilts");
  });

  it("changing only the Hindi name never touches the slug", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Dohars", slug: "dohars" });

    const res = await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("nameHi", "दोहर");

    expect(res.status).toBe(200);
    const after = await Category.findById(category._id);
    expect(after.nameHi).toBe("दोहर");
    expect(after.slug).toBe("dohars");
  });

  it("a slug sent in the body is ignored (no indirect way to change it)", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Curtains", slug: "curtains" });

    await request(app)
      .put(`/api/categories/${category._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Curtains")
      .field("slug", "hacked-slug")
      .field("seoTitle", "Curtains Online");

    expect((await Category.findById(category._id)).slug).toBe("curtains");
  });

  it("a NEW category still gets its slug from its name", async () => {
    const token = await adminToken();

    const res = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Table Runners")
      .attach("image", PNG, { filename: "runner.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect((await Category.findOne({ name: "Table Runners" })).slug).toBe("table-runners");
  });
});

describe("PR-3: subcategory rename keeps the slug", () => {
  it("renaming changes the name but not the slug, in the DB and in the public list", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Bedsheets", slug: "bedsheets" });
    const sub = await createSubcategory(category);

    const res = await request(app)
      .put(`/api/subcategories/${sub._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Double Bed (90 x 100)");

    expect(res.status).toBe(200);
    const after = await Subcategory.findById(sub._id);
    expect(after.name).toBe("Double Bed (90 x 100)");
    expect(after.slug).toBe("double-bed");

    const list = await request(app).get("/api/subcategories");
    const listed = (list.body.subcategories || []).find((s) => String(s._id) === String(sub._id));
    expect(listed.slug).toBe("double-bed");
  });

  it("changing only the Hindi name or a slug in the body never touches the slug", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Bedsheets", slug: "bedsheets" });
    const sub = await createSubcategory(category);

    await request(app)
      .put(`/api/subcategories/${sub._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("nameHi", "डबल बेड")
      .field("slug", "hacked-slug");

    const after = await Subcategory.findById(sub._id);
    expect(after.nameHi).toBe("डबल बेड");
    expect(after.slug).toBe("double-bed");
  });

  it("a NEW subcategory still gets its slug from its name", async () => {
    const token = await adminToken();
    const category = await createCategory({ name: "Bedsheets", slug: "bedsheets" });

    const res = await request(app)
      .post("/api/subcategories")
      .set("Authorization", `Bearer ${token}`)
      .field("category", category._id.toString())
      .field("groupLabel", "Size")
      .field("name", "King Size");

    expect(res.status).toBe(201);
    expect((await Subcategory.findOne({ name: "King Size" })).slug).toBe("king-size");
  });
});

describe("PR-3: article retitle keeps the slug", () => {
  it("retitling changes the title but the old URL keeps working", async () => {
    const token = await adminToken();
    const article = await createArticle();

    const res = await request(app)
      .put(`/api/articles/${article._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Bedsheet Buying Guide 2026" });

    expect(res.status).toBe(200);
    const after = await Article.findById(article._id);
    expect(after.title).toBe("Bedsheet Buying Guide 2026");
    expect(after.slug).toBe("how-to-choose-a-bedsheet");

    const byOldSlug = await request(app).get("/api/articles/slug/how-to-choose-a-bedsheet");
    expect(byOldSlug.status).toBe(200);
    expect(byOldSlug.body.article.title).toBe("Bedsheet Buying Guide 2026");
  });

  it("changing only the Hindi title or a slug in the body never touches the slug", async () => {
    const token = await adminToken();
    const article = await createArticle();

    await request(app)
      .put(`/api/articles/${article._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ titleHi: "बेडशीट कैसे चुनें", slug: "hacked-slug" });

    const after = await Article.findById(article._id);
    expect(after.titleHi).toBe("बेडशीट कैसे चुनें");
    expect(after.slug).toBe("how-to-choose-a-bedsheet");
  });

  it("a NEW article still gets its slug from its title", async () => {
    const token = await adminToken();

    const res = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Cotton vs Microfiber", content: "<p>Which one to pick.</p>" });

    expect(res.status).toBe(201);
    expect((await Article.findOne({ title: "Cotton vs Microfiber" })).slug).toBe("cotton-vs-microfiber");
  });
});
