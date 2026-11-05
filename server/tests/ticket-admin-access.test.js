import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("../config/mailer.js", () => ({ sendEmail }));

import "./setup.js";
import app from "../app.js";
import Ticket from "../models/Ticket.js";
import Role from "../models/Role.js";
import { createUser, signToken } from "./helpers.js";

// The admin panel's ticket page now sends the admin's own token (see
// client/src/services/ticketService.js getTicketByIdAdmin /
// addTicketMessageAdmin). This pins what the server does with each kind
// of login, so the admin side keeps working with just that token.

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(undefined);
});

const customerTicket = async () => {
  const customer = await createUser();
  const ticket = await Ticket.create({
    user: customer._id,
    subject: "Curtain colour question",
    messages: [{ sender: "customer", senderName: customer.name, message: "Is the maroon darker in person?" }],
  });
  return { customer, ticket };
};

const as = (user) => ({
  get: (path) => request(app).get(path).set("Authorization", `Bearer ${signToken(user)}`),
  post: (path, body) => request(app).post(path).set("Authorization", `Bearer ${signToken(user)}`).send(body),
});

describe("Ticket detail and replies by login type", () => {
  it("an admin with only their admin login can open a customer's ticket", async () => {
    const { ticket } = await customerTicket();
    const admin = await createUser({ role: "admin" });

    const res = await as(admin).get(`/api/tickets/${ticket._id}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket._id).toBe(String(ticket._id));
  });

  it("an admin's reply is recorded as the admin's", async () => {
    const { ticket } = await customerTicket();
    const admin = await createUser({ role: "admin", name: "Support Team" });

    const res = await as(admin).post(`/api/tickets/${ticket._id}/messages`, { message: "Yes, slightly darker." });

    expect(res.status).toBe(200);
    const last = (await Ticket.findById(ticket._id)).messages.at(-1);
    expect(last.sender).toBe("admin");
    expect(last.senderName).toBe("Support Team");
  });

  it("the customer's own reply is recorded as the customer's", async () => {
    const { customer, ticket } = await customerTicket();

    const res = await as(customer).post(`/api/tickets/${ticket._id}/messages`, { message: "Thanks, ordering it." });

    expect(res.status).toBe(200);
    expect((await Ticket.findById(ticket._id)).messages.at(-1).sender).toBe("customer");
  });

  it("another customer can neither open nor reply to the ticket", async () => {
    const { ticket } = await customerTicket();
    const stranger = await createUser();

    expect((await as(stranger).get(`/api/tickets/${ticket._id}`)).status).toBe(403);
    expect((await as(stranger).post(`/api/tickets/${ticket._id}/messages`, { message: "Hello" })).status).toBe(403);
    expect((await Ticket.findById(ticket._id)).messages).toHaveLength(1);
  });

  it("a staff account without the tickets permission is refused", async () => {
    const { ticket } = await customerTicket();
    const role = await Role.create({ name: "Orders only", permissions: ["orders"] });
    const staff = await createUser({ role: "admin", adminRole: role._id });

    expect((await as(staff).get(`/api/tickets/${ticket._id}`)).status).toBe(403);
    expect((await as(staff).post(`/api/tickets/${ticket._id}/messages`, { message: "Hi" })).status).toBe(403);
  });

  it("no login at all is refused", async () => {
    const { ticket } = await customerTicket();

    expect((await request(app).get(`/api/tickets/${ticket._id}`)).status).toBe(401);
  });
});
