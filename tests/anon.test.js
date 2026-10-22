/**
 * Anonymous chat routes:
 *   GET  /anon/threads
 *   GET  /anon/thread/:threadId
 *   POST /anon/reply
 *   POST /anon/send
 *   POST /anon/claim-thread
 */
const request = require("supertest");
const { createApp } = require("../app");
const { signToken, authHeader } = require("./helpers");

jest.mock("../Models/User.model");
jest.mock("../Models/Messages.model");
jest.mock("../Models/AnonThread.model");
jest.mock("../Models/AnonMessage.model");
jest.mock("../Models/ForgotPasswordCodes.model");

const { anonThreadModel } = require("../Models/AnonThread.model");
const { anonMessageModel } = require("../Models/AnonMessage.model");

let app, server;

beforeAll(() => {
  ({ app, server } = createApp());
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => jest.clearAllMocks());

// ── Fixtures ──────────────────────────────────────────────────

const THREAD_ID = "thread001";
const RECIPIENT = "recip";
const SENDER = "senduser";

const mockThread = (overrides = {}) => ({
  _id: THREAD_ID,
  recipientUsername: RECIPIENT,
  senderIdentity: null,
  senderAlias: "SilentFox#4821",
  status: "pending_sender_account",
  claimed: false,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

const mockAnonMsg = (overrides = {}) => ({
  _id: "amsg001",
  threadId: THREAD_ID,
  senderRole: "sender",
  content: "hey",
  title: null,
  imageURL: null,
  read: false,
  expiresAt: null,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ── GET /anon/threads ─────────────────────────────────────────
describe("GET /anon/threads", () => {
  const token = signToken(RECIPIENT);

  it("returns threads where user is recipient", async () => {
    anonThreadModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockThread()]),
    });
    anonMessageModel.countDocuments.mockResolvedValue(2);
    anonMessageModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockAnonMsg()),
    });

    const res = await request(app)
      .get("/anon/threads")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.threads)).toBe(true);
    expect(res.body.threads.length).toBe(1);
  });

  it("thread shape has all required fields", async () => {
    anonThreadModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockThread()]),
    });
    anonMessageModel.countDocuments.mockResolvedValue(1);
    anonMessageModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(mockAnonMsg()),
    });

    const res = await request(app)
      .get("/anon/threads")
      .set(authHeader(token));

    const t = res.body.threads[0];
    expect(t).toHaveProperty("_id");
    expect(t).toHaveProperty("senderAlias");
    expect(t).toHaveProperty("status");
    expect(t).toHaveProperty("unreadCount");
    expect(t).toHaveProperty("lastMessage");
    expect(t.unreadCount).toBe(1);
    expect(t.lastMessage.content).toBe("hey");
  });

  it("returns empty array when no threads exist", async () => {
    anonThreadModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([]),
    });

    const res = await request(app)
      .get("/anon/threads")
      .set(authHeader(token));

    expect(res.body.threads).toEqual([]);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app).get("/anon/threads");
    expect(res.status).toBe(401);
  });
});

// ── GET /anon/thread/:threadId ────────────────────────────────
describe("GET /anon/thread/:threadId", () => {
  const token = signToken(RECIPIENT);

  it("returns thread and message list for a participant", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread());
    anonMessageModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockAnonMsg()]),
    });

    const res = await request(app)
      .get(`/anon/thread/${THREAD_ID}`)
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.thread._id).toBe(THREAD_ID);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages[0]).toHaveProperty("senderRole");
    expect(res.body.messages[0]).toHaveProperty("content");
  });

  it("returns 403 for a non-participant", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread()); // recipient is RECIPIENT

    const outsider = signToken("outsider");
    const res = await request(app)
      .get(`/anon/thread/${THREAD_ID}`)
      .set(authHeader(outsider));

    expect(res.status).toBe(403);
  });

  it("returns 404 for a non-existent thread", async () => {
    anonThreadModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .get(`/anon/thread/${THREAD_ID}`)
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });
});

// ── POST /anon/reply ──────────────────────────────────────────
describe("POST /anon/reply", () => {
  const token = signToken(RECIPIENT);

  it("recipient can reply and message is saved with senderRole=recipient", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ status: "active" })
    );
    const created = mockAnonMsg({ senderRole: "recipient", content: "Got it!" });
    anonMessageModel.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "Got it!" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(anonMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "recipient", content: "Got it!" })
    );
  });

  it("computes expiresAt when expiresIn is provided", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread({ status: "active" }));
    anonMessageModel.create.mockResolvedValue(mockAnonMsg());

    const before = Date.now();
    await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "Timed reply", expiresIn: 3600 });

    const createCall = anonMessageModel.create.mock.calls[0][0];
    expect(createCall.expiresAt.getTime()).toBeGreaterThan(before + 3599 * 1000);
  });

  it("returns 403 when caller is not the recipient", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread());

    const notRecipient = signToken("someoneelse");
    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(notRecipient))
      .send({ threadId: THREAD_ID, content: "nope" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown thread", async () => {
    anonThreadModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: "bad", content: "hi" });

    expect(res.status).toBe(404);
  });
});

// ── POST /anon/send ───────────────────────────────────────────
describe("POST /anon/send", () => {
  const token = signToken(SENDER);

  it("claimed sender can send a message with senderRole=sender", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ senderIdentity: SENDER, claimed: true, status: "active" })
    );
    const created = mockAnonMsg({ senderRole: "sender", content: "one more thing" });
    anonMessageModel.create.mockResolvedValue(created);

    const res = await request(app)
      .post("/anon/send")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "one more thing" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(anonMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: "sender", content: "one more thing" })
    );
  });

  it("returns 403 when caller is not the claimed sender", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ senderIdentity: "realowner", claimed: true, status: "active" })
    );

    const res = await request(app)
      .post("/anon/send")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "sneaky" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown thread", async () => {
    anonThreadModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/anon/send")
      .set(authHeader(token))
      .send({ threadId: "bad", content: "hi" });

    expect(res.status).toBe(404);
  });
});

// ── POST /anon/claim-thread ───────────────────────────────────
describe("POST /anon/claim-thread", () => {
  const token = signToken(SENDER);

  it("claims an unclaimed thread and sets it to active", async () => {
    const thread = mockThread(); // claimed: false
    anonThreadModel.findById.mockResolvedValue(thread);

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(res.body.message).toMatch(/claimed/i);
    expect(thread.senderIdentity).toBe(SENDER);
    expect(thread.claimed).toBe(true);
    expect(thread.status).toBe("active");
    expect(thread.save).toHaveBeenCalled();
  });

  it("is idempotent — same user claiming again returns 200", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: SENDER, status: "active" })
    );

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
  });

  it("returns 403 when a different user tries to claim an already-claimed thread", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: "realowner", status: "active" })
    );

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token)) // SENDER != realowner
      .send({ threadId: THREAD_ID });

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown thread", async () => {
    anonThreadModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: "nope" });

    expect(res.status).toBe(404);
  });
});
