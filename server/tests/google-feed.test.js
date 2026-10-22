import { describe, it, expect } from "vitest";
import request from "supertest";

import "./setup.js";
import app from "../app.js";
import { createProduct } from "./helpers.js";

const items = (xml) => xml.split("<item>").slice(1);
const tag = (item, name) => (item.match(new RegExp(`<${name}>([^<]*)</${name}>`)) || [])[1];

describe("Google Shopping feed: sized products", () => {
  it("emits one item per size, each linking to a URL that opens that size", async () => {
    const product = await createProduct({
      name: "Teal Satin Curtain",
      price: 404,
      stock: 10,
      variants: [
        { size: "7x4 Ft", price: 404, oldPrice: 800, stock: 5 },
        { size: "9x4 Ft", price: 468, oldPrice: 900, stock: 5 },
      ],
    });

    const res = await request(app).get("/api/feed/google.xml");
    expect(res.status).toBe(200);

    const mine = items(res.text).filter((i) => tag(i, "g:item_group_id") === String(product._id));
    expect(mine).toHaveLength(2);

    const links = mine.map((i) => tag(i, "link"));
    expect(links[0]).toMatch(/\?size=7x4%20Ft$/);
    expect(links[1]).toMatch(/\?size=9x4%20Ft$/);
    expect(tag(mine[1], "g:sale_price")).toBe("468.00 INR");
    expect(new Set(mine.map((i) => tag(i, "g:id"))).size).toBe(2);
  });

  it("keeps g:id unique when two sizes slugify the same or not at all", async () => {
    const product = await createProduct({
      name: "Odd Sizes Curtain",
      price: 100,
      stock: 3,
      variants: [
        { size: "7.5x4", price: 100, stock: 1 },
        { size: "7-5x4", price: 110, stock: 1 },
        { size: "!!", price: 120, stock: 1 },
      ],
    });

    const res = await request(app).get("/api/feed/google.xml");
    const ids = items(res.text)
      .filter((i) => tag(i, "g:item_group_id") === String(product._id))
      .map((i) => tag(i, "g:id"));

    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((id) => !id.endsWith("-"))).toBe(true);
  });
});
