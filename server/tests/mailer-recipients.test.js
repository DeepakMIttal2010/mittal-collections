import { afterEach, describe, expect, it, vi } from "vitest";

import { parseEmailList, sendEmail } from "../config/mailer.js";

// sendEmail posts to Brevo with fetch; capture the JSON body instead.
const captureSend = async (args) => {
  const fetchMock = vi.fn(async () => ({ ok: true, text: async () => "" }));
  vi.stubGlobal("fetch", fetchMock);
  await sendEmail({ subject: "s", html: "<p>x</p>", ...args });
  return JSON.parse(fetchMock.mock.calls[0][1].body);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseEmailList", () => {
  it("splits comma/semicolon lists, trims, drops blanks and duplicates", () => {
    expect(parseEmailList(" a@x.com, b@y.com ;; A@X.com ,")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("accepts arrays, single addresses and empty values", () => {
    expect(parseEmailList(["a@x.com", "b@y.com, c@z.com"])).toEqual(["a@x.com", "b@y.com", "c@z.com"]);
    expect(parseEmailList("only@x.com")).toEqual(["only@x.com"]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList("")).toEqual([]);
  });
});

describe("sendEmail recipients", () => {
  it("sends an admin alert to every address in ADMIN_NOTIFICATION_EMAIL-style lists", async () => {
    const body = await captureSend({ to: "geetika@example.com, deepak@example.com" });
    expect(body.to).toEqual([{ email: "geetika@example.com" }, { email: "deepak@example.com" }]);
    expect(body.bcc).toBeUndefined();
  });

  it("keeps a customer email to one recipient and BCCs every admin", async () => {
    const body = await captureSend({ to: "customer@example.com", bcc: "geetika@example.com; deepak@example.com" });
    expect(body.to).toEqual([{ email: "customer@example.com" }]);
    expect(body.bcc).toEqual([{ email: "geetika@example.com" }, { email: "deepak@example.com" }]);
  });

  it("never repeats a 'to' address as a BCC", async () => {
    const body = await captureSend({ to: "deepak@example.com", bcc: "Deepak@example.com, geetika@example.com" });
    expect(body.to).toEqual([{ email: "deepak@example.com" }]);
    expect(body.bcc).toEqual([{ email: "geetika@example.com" }]);
  });

  it("omits bcc entirely when none is given", async () => {
    const body = await captureSend({ to: "customer@example.com", bcc: undefined });
    expect(body).not.toHaveProperty("bcc");
  });

  it("refuses to send with no recipient at all", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(sendEmail({ to: " , ", subject: "s", html: "x" })).rejects.toThrow("no recipient");
    expect(fetch).not.toHaveBeenCalled();
  });
});
