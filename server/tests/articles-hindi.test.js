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

describe("POST /api/articles/hindi-bulk-sync", () => {
  it("rejects a request without the correct secret", async () => {
    const res = await request(app)
      .post("/api/articles/hindi-bulk-sync")
      .send({ updates: [] });

    expect(res.status).toBe(401);
  });

  it("updates Hindi fields on existing articles by slug, and reports slugs that don't exist", async () => {
    await Article.create({
      title: enPayload.title,
      slug: "how-to-choose-the-right-curtains",
      excerpt: enPayload.excerpt,
      content: enPayload.content,
    });

    const res = await request(app)
      .post(`/api/articles/hindi-bulk-sync?secret=${process.env.CRON_SECRET}`)
      .send({
        updates: [
          {
            slug: "how-to-choose-the-right-curtains",
            titleHi: "सही पर्दे कैसे चुनें",
            excerptHi: "एक संक्षिप्त गाइड",
            contentHi: "<p>पूरी हिंदी सामग्री</p>",
          },
          { slug: "this-slug-does-not-exist", titleHi: "कुछ भी" },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.notFound).toEqual(["this-slug-does-not-exist"]);

    const saved = await Article.findOne({
      slug: "how-to-choose-the-right-curtains",
    });
    expect(saved.titleHi).toBe("सही पर्दे कैसे चुनें");
    expect(saved.title).toBe(enPayload.title); // untouched
  });

  it("creates a brand-new bilingual article, and skips one that already exists by slug", async () => {
    await Article.create({
      title: "Existing Article",
      slug: "existing-article",
      content: "<p>already here</p>",
    });

    const res = await request(app)
      .post(`/api/articles/hindi-bulk-sync?secret=${process.env.CRON_SECRET}`)
      .send({
        creates: [
          {
            title: "White Towels Turning Dull?",
            excerpt: "Keep them bright.",
            content: "<p>English content</p>",
            titleHi: "सफेद तौलिये फीके पड़ रहे हैं?",
            excerptHi: "उन्हें चमकदार रखें।",
            contentHi: "<p>हिंदी सामग्री</p>",
          },
          {
            title: "Existing Article", // same slug as the one already seeded
            content: "<p>duplicate attempt</p>",
          },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    expect(res.body.skippedExisting).toEqual(["existing-article"]);

    const created = await Article.findOne({
      slug: "white-towels-turning-dull",
    });
    expect(created.titleHi).toBe("सफेद तौलिये फीके पड़ रहे हैं?");
    expect(created.isActive).toBe(true);

    // The pre-existing article's content must not have been overwritten
    // by the skipped duplicate create attempt.
    const untouched = await Article.findOne({ slug: "existing-article" });
    expect(untouched.content).toBe("<p>already here</p>");
  });
});
