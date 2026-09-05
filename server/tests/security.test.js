import { describe, it, expect } from "vitest";
import request from "supertest";

import app from "../app.js";

// These hit /api/health (no DB access) and unmatched /api/auth/* paths
// (the rate limiter runs before route matching, so no DB is needed
// there either) — this file doesn't import ./setup.js at all.

describe("CORS", () => {
  it("allows a request from the storefront's own origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });

  it("does not grant CORS access to an arbitrary origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil-clone.example.com");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows a request with no Origin header at all (server-to-server calls)", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
  });
});

describe("Security headers (helmet)", () => {
  it("sets standard protective headers", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("keeps Cross-Origin-Resource-Policy cross-origin so the frontend can load /uploads images", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});

describe("Auth rate limiting", () => {
  it("blocks further /api/auth/* requests after the configured limit (20 per window)", async () => {
    let lastStatus;

    for (let i = 0; i < 21; i += 1) {
      const res = await request(app).get("/api/auth/__rate_limit_probe__");
      lastStatus = res.status;
    }

    // The 21st request in the same window must be rejected by the
    // limiter itself (429), not just 404 from the unmatched route.
    expect(lastStatus).toBe(429);
  }, 20000);
});
