import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Article from "../models/Article.js";
import { createCategory } from "./helpers.js";

const make = (overrides) =>
  Article.create({ title: "Guide", excerpt: "e", content: "<p>c</p>", isActive: true, ...overrides });

describe("GET /api/articles?category=", () => {
  it("returns only that category's active articles", async () => {
    const curtains = await createCategory({ name: "Curtains", slug: "curtains" });
    const towels = await createCategory({ name: "Towels", slug: "towels" });
    await make({ title: "Curtain guide", slug: "curtain-guide", category: curtains._id });
    await make({ title: "Hidden curtain guide", slug: "hidden-curtain-guide", category: curtains._id, isActive: false });
    await make({ title: "Towel guide", slug: "towel-guide", category: towels._id });
    await make({ title: "General guide", slug: "general-guide" });

    const res = await request(app).get(`/api/articles?category=${curtains._id}`);

    expect(res.status).toBe(200);
    expect(res.body.articles.map((a) => a.slug)).toEqual(["curtain-guide"]);
    // Returned so a client can tell filtered results from an older server
    // that ignores the parameter.
    expect(res.body.articles[0].category).toBe(String(curtains._id));
  });

  it("still returns every active article without the parameter", async () => {
    const curtains = await createCategory({ name: "Curtains", slug: "curtains" });
    await make({ title: "Curtain guide", slug: "curtain-guide", category: curtains._id });
    await make({ title: "General guide", slug: "general-guide" });

    const res = await request(app).get("/api/articles");

    expect(res.status).toBe(200);
    expect(res.body.articles).toHaveLength(2);
  });

  it("answers a malformed category with an empty list, not a 500", async () => {
    await make({ title: "General guide", slug: "general-guide" });

    const res = await request(app).get("/api/articles?category=not-an-id");

    expect(res.status).toBe(200);
    expect(res.body.articles).toEqual([]);
  });

  it("never turns an operator-shaped parameter into a Mongo operator", async () => {
    const curtains = await createCategory({ name: "Curtains", slug: "curtains" });
    await make({ title: "Curtain guide", slug: "curtain-guide", category: curtains._id });
    await make({ title: "General guide", slug: "general-guide" });

    // Express 5's query parser keeps "category[$ne]" as a plain key, so it
    // is not `category` at all -- the list comes back unfiltered rather
    // than as {category: {$ne: ...}}.
    const res = await request(app).get(`/api/articles?category[$ne]=${curtains._id}`);

    expect(res.status).toBe(200);
    expect(res.body.articles.map((a) => a.slug).sort()).toEqual(["curtain-guide", "general-guide"]);
  });
});
