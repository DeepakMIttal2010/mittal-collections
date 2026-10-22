import { describe, it, expect, vi, beforeEach } from "vitest";
import { Writable } from "node:stream";
import sharp from "sharp";

// Round 29: a 4-photo product upload ran the 512 MB instance out of
// memory (every photo decoded in parallel), a tiny PNG that decodes huge
// could do the same from a customer review, and a failed file left the
// already-uploaded ones orphaned in Cloudinary.
const state = vi.hoisted(() => ({ active: 0, maxActive: 0, uploads: 0, failOn: null, destroyed: [] }));

vi.mock("../config/cloudinary.js", () => ({
  default: {
    uploader: {
      upload_stream: (options, cb) =>
        new Writable({
          write(_chunk, _enc, next) {
            next();
          },
          final(done) {
            state.active += 1;
            state.maxActive = Math.max(state.maxActive, state.active);
            const n = ++state.uploads;
            setTimeout(() => {
              state.active -= 1;
              if (n === state.failOn) cb(new Error("cloudinary down"));
              else cb(null, { secure_url: `https://res.cloudinary.com/x/image/upload/v1/mittal-collections/photo-${n}.jpg` });
              done();
            }, 20);
          },
        }),
      destroy: async (publicId) => {
        state.destroyed.push(publicId);
        return { result: "ok" };
      },
    },
  },
}));

const { default: imageOptimizer } = await import("../middleware/imageOptimizer.js");

const jpeg = (w = 64, h = 64) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).jpeg().toBuffer();

const run = async (files, body = {}) => {
  const req = { body: { name: "Test Product", ...body }, files: { images: files } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  let nextCalled = false;
  await imageOptimizer(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
};

const file = async (w, h) => ({ buffer: await jpeg(w, h), mimetype: "image/jpeg", originalname: "p.jpg" });

describe("imageOptimizer", () => {
  beforeEach(() => {
    Object.assign(state, { active: 0, maxActive: 0, uploads: 0, failOn: null, destroyed: [] });
  });

  it("uploads every photo, one at a time", async () => {
    const files = await Promise.all([file(), file(), file(), file()]);
    const { nextCalled } = await run(files);

    expect(nextCalled).toBe(true);
    expect(state.uploads).toBe(4);
    expect(state.maxActive).toBe(1);
    expect(files.map((f) => f.path)).toEqual([1, 2, 3, 4].map((n) => `https://res.cloudinary.com/x/image/upload/v1/mittal-collections/photo-${n}.jpg`));
  });

  it("removes the photos already uploaded when a later one fails", async () => {
    state.failOn = 3;
    const files = await Promise.all([file(), file(), file(), file()]);
    const { res, nextCalled } = await run(files);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(500);
    expect(state.uploads).toBe(3); // the 4th is never started
    expect(state.destroyed.sort()).toEqual(["mittal-collections/photo-1", "mittal-collections/photo-2"]);
  });

  it("rejects an image that would decode to more than 60 megapixels, before uploading anything", async () => {
    // 8000 x 8000 = 64 MP, but a single-colour image compresses to a tiny file
    const bomb = {
      buffer: await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#fff" } }).png().toBuffer(),
      mimetype: "image/png",
      originalname: "bomb.png",
    };

    for (const body of [{}, { optimizeImages: "false" }]) {
      state.uploads = 0;
      const { res, nextCalled } = await run([bomb], body);
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toMatch(/too large/i);
      expect(state.uploads).toBe(0);
    }
  });
});
