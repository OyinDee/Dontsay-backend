/**
 * Anonymous chat routes:
 *   GET  /anon/threads
 *   GET  /anon/thread/:threadId
 *   POST /anon/reply
 *   POST /anon/send
 *   POST /anon/claim-thread
 */
const request = require("supertest");
const jwt = require("jsonwebtoken");

const mockSendAnonReplyMail = jest.fn().mockResolvedValue({ success: true });

jest.mock("../Models/User.model");
jest.mock("../Models/Messages.model");
jest.mock("../Models/AnonThread.model");
jest.mock("../Models/AnonMessage.model");
jest.mock("../Models/ForgotPasswordCodes.model");
jest.mock("../Services/Mailer.Services", () =>
  jest.fn().mockImplementation(() => ({
    sendAnonClaimMail: jest.fn().mockResolvedValue({ success: true }),
    sendAnonReplyMail: mockSendAnonReplyMail,
    sendForgotPasswordMail: jest.fn().mockResolvedValue({ success: true }),
  }))
);

const { createApp } = require("../app");
const { signToken, authHeader } = require("./helpers");

const { anonThreadModel } = require("../Models/AnonThread.model");
const { anonMessageModel } = require("../Models/AnonMessage.model");
const { messagesModel } = require("../Models/Messages.model");
const { userInfoModel } = require("../Models/User.model");

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
const CLAIM_TOKEN = jwt.sign({ threadId: THREAD_ID }, process.env.JWT_SECRET, { expiresIn: "1h" });

const mockThread = (overrides = {}) => ({
  _id: THREAD_ID,
  recipientUsername: RECIPIENT,
  senderIdentity: null,
  senderAlias: "SilentFox#4821",
  senderBccEmail: null,
  bccEmail: null,
  claimToken: null,
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
    expect(t.isRecipient).toBe(true);
    expect(t.unreadCount).toBe(1);
    expect(t.lastMessage.content).toBe("hey");
  });

  it("identifies a claimed sender as the sender when listing threads", async () => {
    anonThreadModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        mockThread({ claimed: true, senderIdentity: SENDER, status: "active" }),
      ]),
    });
    anonMessageModel.countDocuments.mockResolvedValue(0);
    anonMessageModel.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app)
      .get("/anon/threads")
      .set(authHeader(signToken(SENDER)));

    expect(res.status).toBe(200);
    expect(res.body.threads[0].isRecipient).toBe(false);
    expect(anonMessageModel.countDocuments).toHaveBeenCalledWith({
      threadId: THREAD_ID,
      senderRole: "recipient",
      read: false,
    });
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
    anonMessageModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
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
    expect(anonMessageModel.updateMany).toHaveBeenCalledWith(
      { threadId: THREAD_ID, senderRole: "sender", read: false },
      { $set: { read: true, readAt: expect.any(Date) } }
    );
  });

  it("marks recipient replies as read when the claimed sender opens the thread", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: SENDER, status: "active" })
    );
    anonMessageModel.updateMany.mockResolvedValue({ modifiedCount: 1 });
    anonMessageModel.find.mockReturnValue({
      sort: jest.fn().mockResolvedValue([mockAnonMsg({ senderRole: "recipient" })]),
    });

    const res = await request(app)
      .get(`/anon/thread/${THREAD_ID}`)
      .set(authHeader(signToken(SENDER)));

    expect(res.status).toBe(200);
    expect(anonMessageModel.updateMany).toHaveBeenCalledWith(
      { threadId: THREAD_ID, senderRole: "recipient", read: false },
      { $set: { read: true, readAt: expect.any(Date) } }
    );
  });

  it("returns 403 for a non-participant", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread()); // recipient is RECIPIENT

    const outsider = signToken("outsider");
    const res = await request(app)
      .get(`/anon/thread/${THREAD_ID}`)
      .set(authHeader(outsider));

    expect(res.status).toBe(403);
    expect(anonMessageModel.updateMany).not.toHaveBeenCalled();
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

  it("emails the original sender when an anonymous reply is posted", async () => {
    const thread = mockThread({
      senderBccEmail: "sender@example.com",
      status: "active",
    });
    anonThreadModel.findById.mockResolvedValue(thread);
    anonMessageModel.create.mockResolvedValue(
      mockAnonMsg({ senderRole: "recipient", content: "Got it!" })
    );

    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "Got it!" });

    expect(res.status).toBe(200);
    expect(mockSendAnonReplyMail).toHaveBeenCalledWith(
      "sender@example.com",
      "SilentFox#4821",
      RECIPIENT,
      "Got it!",
      expect.stringContaining("https://wispah.vercel.app/claim?token=")
    );
    const claimLink = mockSendAnonReplyMail.mock.calls[0][4];
    const claimUrl = new URL(claimLink);
    const claimPayload = jwt.verify(claimUrl.searchParams.get("token"), process.env.JWT_SECRET);
    expect(claimUrl.searchParams.get("threadId")).toBe(THREAD_ID);
    expect(claimPayload.threadId).toBe(THREAD_ID);
    expect(claimPayload.bccEmail).toBeUndefined();
    expect(thread.claimToken).toBe(claimUrl.searchParams.get("token"));
    expect(thread.save).toHaveBeenCalled();
  });

  it("finds the sender email on the original inbox message when it is missing from the thread", async () => {
    anonThreadModel.findById.mockResolvedValue(mockThread({ status: "active" }));
    anonMessageModel.create.mockResolvedValue(
      mockAnonMsg({ senderRole: "recipient", content: "Got it!" })
    );
    messagesModel.findOne.mockResolvedValue({ bccEmail: "sender@example.com" });

    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "Got it!" });

    expect(res.status).toBe(200);
    expect(messagesModel.findOne).toHaveBeenCalledWith({ threadId: THREAD_ID });
    expect(mockSendAnonReplyMail).toHaveBeenCalledWith(
      "sender@example.com",
      "SilentFox#4821",
      RECIPIENT,
      "Got it!",
      expect.stringContaining("https://wispah.vercel.app/claim?token=")
    );
  });

  it("uses the claimed sender's recovery email if no message email is available", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ senderIdentity: SENDER, status: "active" })
    );
    anonMessageModel.create.mockResolvedValue(
      mockAnonMsg({ senderRole: "recipient", content: "Got it!" })
    );
    messagesModel.findOne.mockResolvedValue(null);
    userInfoModel.findOne.mockResolvedValue({ recoveryEmail: "account@example.com" });

    const res = await request(app)
      .post("/anon/reply")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, content: "Got it!" });

    expect(res.status).toBe(200);
    expect(userInfoModel.findOne).toHaveBeenCalledWith({ username: SENDER });
    expect(mockSendAnonReplyMail).toHaveBeenCalledWith(
      "account@example.com",
      "SilentFox#4821",
      RECIPIENT,
      "Got it!",
      expect.stringContaining("wispah.vercel.app")
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
describe("POST /anon/thread/from-message", () => {
  const token = signToken(RECIPIENT);

  const mockInboxMessage = (overrides = {}) => ({
    _id: "msg001",
    username: RECIPIENT,
    message: "hey there",
    title: null,
    imageURL: null,
    time: new Date("2026-01-01T00:00:00Z"),
    expiresAt: null,
    threadId: null,
    bccEmail: "sender@example.com",
    save: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

  beforeEach(() => {
    userInfoModel.findOne.mockResolvedValue({
      username: RECIPIENT,
      allowAnonymousChat: true,
    });
    anonThreadModel.create.mockResolvedValue({
      _id: { toString: () => THREAD_ID },
      senderAlias: "SilentFox#4821",
      status: "pending_sender_account",
      save: jest.fn().mockResolvedValue(true),
    });
    anonMessageModel.create.mockResolvedValue({});
  });

  it("creates a thread with the original message as its first message", async () => {
    const inboxMsg = mockInboxMessage();
    messagesModel.findById.mockResolvedValue(inboxMsg);

    const res = await request(app)
      .post("/anon/thread/from-message")
      .set(authHeader(token))
      .send({ messageId: "msg001" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(res.body.threadId).toBe(THREAD_ID);
    expect(anonMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: expect.anything(),
        senderRole: "sender",
        content: "hey there",
      })
    );
    expect(inboxMsg.threadId).toBeDefined();
    expect(inboxMsg.save).toHaveBeenCalled();
  });

  it("does not assign the sender a username before they claim", async () => {
    messagesModel.findById.mockResolvedValue(mockInboxMessage());

    await request(app)
      .post("/anon/thread/from-message")
      .set(authHeader(token))
      .send({ messageId: "msg001" });

    expect(anonThreadModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        senderIdentity: null,
        claimed: false,
        status: "pending_sender_account",
      })
    );
  });

  it("is idempotent — reopens an existing thread instead of duplicating it", async () => {
    messagesModel.findById.mockResolvedValue(
      mockInboxMessage({ threadId: THREAD_ID })
    );
    anonThreadModel.findById.mockResolvedValue(mockThread());

    const res = await request(app)
      .post("/anon/thread/from-message")
      .set(authHeader(token))
      .send({ messageId: "msg001" });

    expect(res.status).toBe(200);
    expect(res.body.threadId).toBe(THREAD_ID);
    expect(anonThreadModel.create).not.toHaveBeenCalled();
    expect(anonMessageModel.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the message belongs to someone else", async () => {
    messagesModel.findById.mockResolvedValue(
      mockInboxMessage({ username: "someoneelse" })
    );

    const res = await request(app)
      .post("/anon/thread/from-message")
      .set(authHeader(token))
      .send({ messageId: "msg001" });

    expect(res.status).toBe(403);
    expect(anonThreadModel.create).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown message", async () => {
    messagesModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/anon/thread/from-message")
      .set(authHeader(token))
      .send({ messageId: "nope" });

    expect(res.status).toBe(404);
  });
});

describe("POST /anon/claim-thread", () => {
  const token = signToken(SENDER);

  it("claims an unclaimed thread and sets it to active", async () => {
    const thread = mockThread({ claimToken: CLAIM_TOKEN }); // claimed: false
    anonThreadModel.findById.mockResolvedValue(thread);
    anonThreadModel.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      Object.assign(thread, update.$set);
      return thread;
    });

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, token: CLAIM_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(res.body.message).toMatch(/claimed/i);
    expect(anonThreadModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: THREAD_ID,
        claimed: false,
        claimToken: CLAIM_TOKEN,
        recipientUsername: { $ne: SENDER },
      },
      {
        $set: {
          senderIdentity: SENDER,
          claimed: true,
          status: "active",
          claimToken: null,
        },
      },
      { new: true, runValidators: true }
    );
  });

  it("prevents the anonymous box owner from claiming their own thread", async () => {
    const thread = mockThread({ recipientUsername: RECIPIENT.toUpperCase(), claimToken: CLAIM_TOKEN });
    anonThreadModel.findById.mockResolvedValue(thread);

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(signToken(RECIPIENT)))
      .send({ threadId: THREAD_ID, token: CLAIM_TOKEN });

    expect(res.status).toBe(403);
    expect(res.body.stat).toBe(false);
    expect(thread.senderIdentity).toBeNull();
    expect(thread.claimed).toBe(false);
    expect(thread.save).not.toHaveBeenCalled();
  });

  it("is idempotent — same user claiming again returns 200", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: SENDER, status: "active" })
    );

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, token: CLAIM_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
  });

  it("rejects an invalid token even when the thread is already claimed", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: SENDER, status: "active" })
    );

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, token: "invalid" });

    expect(res.status).toBe(403);
    expect(res.body.stat).toBe(false);
  });

  it("returns 403 when a different user tries to claim an already-claimed thread", async () => {
    anonThreadModel.findById.mockResolvedValue(
      mockThread({ claimed: true, senderIdentity: "realowner", status: "active" })
    );

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token)) // SENDER != realowner
      .send({ threadId: THREAD_ID, token: CLAIM_TOKEN });

    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown thread", async () => {
    anonThreadModel.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: "nope", token: CLAIM_TOKEN });

    expect(res.status).toBe(404);
  });

  it("rejects a missing claim token", async () => {
    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID });

    expect(res.status).toBe(400);
    expect(anonThreadModel.findById).not.toHaveBeenCalled();
  });

  it("rejects a token that does not match the thread", async () => {
    const thread = mockThread({ claimToken: CLAIM_TOKEN });
    anonThreadModel.findById.mockResolvedValue(thread);
    const wrongToken = jwt.sign({ threadId: "different-thread" }, process.env.JWT_SECRET);

    const res = await request(app)
      .post("/anon/claim-thread")
      .set(authHeader(token))
      .send({ threadId: THREAD_ID, token: wrongToken });

    expect(res.status).toBe(403);
    expect(anonThreadModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

// ── GET /claim (redirect to the frontend) ─────────────────────
describe("GET /claim", () => {
  it("redirects claim links to the frontend app", async () => {
    const res = await request(app).get("/claim?token=abc&threadId=t1");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(
      "https://wispah.vercel.app/claim?token=abc&threadId=t1"
    );
  });
});
