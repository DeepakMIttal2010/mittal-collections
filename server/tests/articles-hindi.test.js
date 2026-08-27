import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import Article from "../models/Article.js";
import { createUser, signToken } from "./helpers.js";

const enPayload = {
  title: "How to Choose the Right Curtains",
  excerpt: "A short guide",
  content: "<p>Full English content</p>",
};

describe("Article Hindi fields", () => {
  it("saves titleHi/excerptHi/contentHi when the admin provides them", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const res = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...enPayload,
        titleHi: "सही पर्दे कैसे चुनें",
        excerptHi: "एक संक्षिप्त गाइड",
        contentHi: "<p>पूरी हिंदी सामग्री</p>",
      });

    expect(res.status).toBe(201);
    expect(res.body.article.titleHi).toBe("सही पर्दे कैसे चुनें");
    expect(res.body.article.excerptHi).toBe("एक संक्षिप्त गाइड");
    expect(res.body.article.contentHi).toBe("<p>पूरी हिंदी सामग्री</p>");
  });

  it("defaults Hindi fields to empty strings when not provided, and leaves the article otherwise unaffected", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const res = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${token}`)
      .send(enPayload);

    expect(res.status).toBe(201);
    expect(res.body.article.titleHi).toBe("");
    expect(res.body.article.excerptHi).toBe("");
    expect(res.body.article.contentHi).toBe("");
    expect(res.body.article.title).toBe(enPayload.title);
  });

  it("updates Hindi fields via PUT without disturbing the English ones", async () => {
    const admin = await createUser({ role: "admin" });
    const token = signToken(admin);

    const created = await Article.create({
      title: enPayload.title,
      slug: "how-to-choose-the-right-curtains",
      excerpt: enPayload.excerpt,
      content: enPayload.content,
    });

    const res = await request(app)
      .put(`/api/articles/${created._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ titleHi: "सही पर्दे कैसे चुनें", excerptHi: "एक संक्षिप्त गाइड" });

    expect(res.status).toBe(200);
    expect(res.body.article.titleHi).toBe("सही पर्दे कैसे चुनें");
    expect(res.body.article.excerptHi).toBe("एक संक्षिप्त गाइड");
    expect(res.body.article.title).toBe(enPayload.title); // unaffected
    expect(res.body.article.content).toBe(enPayload.content); // unaffected
  });

  it("includes titleHi/excerptHi in the public article list", async () => {
    await Article.create({
      title: enPayload.title,
      slug: "how-to-choose-the-right-curtains",
      excerpt: enPayload.excerpt,
      content: enPayload.content,
      titleHi: "सही पर्दे कैसे चुनें",
      excerptHi: "एक संक्षिप्त गाइड",
      isActive: true,
    });

    const res = await request(app).get("/api/articles");

    expect(res.status).toBe(200);
    expect(res.body.articles[0].titleHi).toBe("सही पर्दे कैसे चुनें");
    expect(res.body.articles[0].excerptHi).toBe("एक संक्षिप्त गाइड");
  });

  it("includes the full contentHi on the single-article-by-slug endpoint", async () => {
    await Article.create({
      title: enPayload.title,
      slug: "how-to-choose-the-right-curtains",
      excerpt: enPayload.excerpt,
      content: enPayload.content,
      titleHi: "सही पर्दे कैसे चुनें",
      contentHi: "<p>पूरी हिंदी सामग्री</p>",
      isActive: true,
    });

    const res = await request(app).get(
      "/api/articles/slug/how-to-choose-the-right-curtains",
    );

    expect(res.status).toBe(200);
    expect(res.body.article.contentHi).toBe("<p>पूरी हिंदी सामग्री</p>");
  });
});
