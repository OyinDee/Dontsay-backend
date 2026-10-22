/**
 * Message routes:
 *   POST /send
 *   POST /get
 *   POST /message/mark-read
 *   DELETE /message/:id
 */
const request = require("supertest");
const { createApp } = require("../app");
const { signToken, authHeader } = require("./helpers");

jest.mock("../Models/User.model");
jest.mock("../Models/Messages.model");
jest.mock("../Models/AnonThread.model");
jest.mock("../Models/AnonMessage.model");
jest.mock("../Models/ForgotPasswordCodes.model");

const { userInfoModel } = require("../Models/User.model");
const { messagesModel } = require("../Models/Messages.model");
const { anonThreadModel } = require("../Models/AnonThread.model");

let app, server;

beforeAll(() => {
  ({ app, server } = createApp());
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => jest.clearAllMocks());

// ── Reusable fixtures ─────────────────────────────────────────

const mockUser = (overrides = {}) => ({
  username: "recipient",
  acceptMessages: true,
  allowAnonymousChat: false,
  profileImage: null,
  bio: null,
  isOnline: false,
  lastSeen: null,
  ...overrides,
});

const mockMessage = (overrides = {}) => ({
  _id: "msg001",
  message: "hello",
  title: null,
  imageURL: null,
  time: new Date().toISOString(),
  expiresAt: null,
  read: false,
  ...overrides,
});

// ── POST /send ────────────────────────────────────────────────
describe("POST /send", () => {
  it("sends a basic message successfully", async () => {
    userInfoModel.findOne.mockResolvedValue(mockUser());
    messagesModel.prototype.save = jest.fn().mockResolvedValue(mockMessage());

    const res = await request(app)
      .post("/send")
      .send({ username: "recipient", message: "hello there" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(res.body.message).toBe("Sent");
  });

  it("returns user not found for unknown recipient", async () => {
    userInfoModel.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/send")
      .send({ username: "ghost", message: "hi" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("blocks send when acceptMessages is false", async () => {
    userInfoModel.findOne.mockResolvedValue(
      mockUser({ acceptMessages: false })
    );

    const res = await request(app)
      .post("/send")
      .send({ username: "recipient", message: "still trying" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(false);
    expect(res.body.message).toMatch(/isn't accepting/i);
  });

  it("stores title and computes expiresAt from expiresIn", async () => {
    userInfoModel.findOne.mockResolvedValue(mockUser());
    messagesModel.prototype.save = jest.fn().mockResolvedValue({});

    const before = Date.now();
    await request(app)
      .post("/send")
      .send({
        username: "recipient",
        message: "timed",
        title: "Top secret",
        expiresIn: 3600,
      });

    // The constructor was called with the correct fields
    const ctorArg = messagesModel.mock.calls[0][0];
    expect(ctorArg.title).toBe("Top secret");
    expect(ctorArg.expiresAt).toBeDefined();
    expect(new Date(ctorArg.expiresAt).getTime()).toBeGreaterThan(before + 3599 * 1000);
  });

  it("creates anon thread when bccEmail provided and allowAnonymousChat is on", async () => {
    userInfoModel.findOne.mockResolvedValue(
      mockUser({ allowAnonymousChat: true })
    );
    messagesModel.prototype.save = jest.fn().mockResolvedValue(mockMessage());
    anonThreadModel.create = jest.fn().mockResolvedValue({
      _id: { toString: () => "thread001" },
      recipientUsername: "recipient",
      senderAlias: "SilentFox#4821",
      status: "pending_sender_account",
    });

    const res = await request(app)
      .post("/send")
      .send({
        username: "recipient",
        message: "anon hello",
        bccEmail: "sender@example.com",
      });

    expect(res.body.stat).toBe(true);
    expect(res.body.threadId).toBe("thread001");
    expect(anonThreadModel.create).toHaveBeenCalledTimes(1);
  });

  it("does NOT create anon thread when allowAnonymousChat is off", async () => {
    userInfoModel.findOne.mockResolvedValue(mockUser({ allowAnonymousChat: false }));
    messagesModel.prototype.save = jest.fn().mockResolvedValue(mockMessage());
    anonThreadModel.create = jest.fn();

    const res = await request(app)
      .post("/send")
      .send({
        username: "recipient",
        message: "try",
        bccEmail: "sender@example.com",
      });

    expect(res.body.stat).toBe(true);
    expect(res.body.threadId).toBeUndefined();
    expect(anonThreadModel.create).not.toHaveBeenCalled();
  });
});

// ── POST /get ─────────────────────────────────────────────────
describe("POST /get", () => {
  const token = signToken("getuser");

  it("returns empty inbox with a settings object", async () => {
    messagesModel.find.mockResolvedValue([]);
    userInfoModel.findOne.mockResolvedValue(mockUser({ username: "getuser" }));

    const res = await request(app)
      .post("/get")
      .send({ token });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(res.body.message).toBe("nothing");
    expect(res.body.settings).toBeDefined();
    expect(typeof res.body.settings.acceptMessages).toBe("boolean");
  });

  it("returns messages with correct shape", async () => {
    const msg = mockMessage({ title: "T1", _id: "abc" });
    messagesModel.find.mockResolvedValue([msg]);
    userInfoModel.findOne.mockResolvedValue(mockUser({ username: "getuser" }));

    const res = await request(app)
      .post("/get")
      .send({ token });

    const m = res.body.message[0];
    expect(m).toHaveProperty("_id");
    expect(m).toHaveProperty("message");
    expect(m).toHaveProperty("title");
    expect(m).toHaveProperty("imageURL");
    expect(m).toHaveProperty("time");
    expect(m).toHaveProperty("expiresAt");
    expect(m).toHaveProperty("read");
    expect(m.read).toBe(false);
  });

  it("also works with Bearer header instead of body token", async () => {
    messagesModel.find.mockResolvedValue([]);
    userInfoModel.findOne.mockResolvedValue(mockUser({ username: "getuser" }));

    const res = await request(app)
      .post("/get")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
  });

  it("returns 400 for an invalid body token", async () => {
    const res = await request(app)
      .post("/get")
      .send({ token: "bad.garbage" });

    expect(res.status).toBe(400);
  });
});

// ── POST /message/mark-read ───────────────────────────────────
describe("POST /message/mark-read", () => {
  const token = signToken("markuser");

  it("marks messages as read and returns stat:true", async () => {
    messagesModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const res = await request(app)
      .post("/message/mark-read")
      .set(authHeader(token))
      .send({ messageIds: ["id1", "id2"] });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(messagesModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ["id1", "id2"] }, username: "markuser" },
      { read: true, readAt: expect.any(Date) }
    );
  });

  it("returns 400 when messageIds is missing", async () => {
    const res = await request(app)
      .post("/message/mark-read")
      .set(authHeader(token))
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 400 when messageIds is not an array", async () => {
    const res = await request(app)
      .post("/message/mark-read")
      .set(authHeader(token))
      .send({ messageIds: "id1" });

    expect(res.status).toBe(400);
  });
});

// ── DELETE /message/:id ───────────────────────────────────────
describe("DELETE /message/:id", () => {
  const token = signToken("deleteuser");

  it("deletes a message the user owns", async () => {
    messagesModel.findOneAndDelete.mockResolvedValue({ _id: "msg001" });

    const res = await request(app)
      .delete("/message/msg001")
      .set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(messagesModel.findOneAndDelete).toHaveBeenCalledWith({
      _id: "msg001",
      username: "deleteuser",
    });
  });

  it("returns 404 when message not found or owned by another user", async () => {
    messagesModel.findOneAndDelete.mockResolvedValue(null);

    const res = await request(app)
      .delete("/message/notmine")
      .set(authHeader(token));

    expect(res.status).toBe(404);
  });
});
