/**
 * Auth routes: POST /user/create  POST /user/login
 * authenticate middleware
 */
const request = require("supertest");
const { createApp } = require("../app");
const { signToken, authHeader } = require("./helpers");

// ── Mock models ───────────────────────────────────────────────
jest.mock("../Models/User.model");
jest.mock("../Models/Messages.model");
jest.mock("../Models/AnonThread.model");
jest.mock("../Models/AnonMessage.model");
jest.mock("../Models/ForgotPasswordCodes.model");

const { userInfoModel } = require("../Models/User.model");

// ── argon2: skip real hashing in tests ───────────────────────
jest.mock("argon2", () => ({
  hash: jest.fn().mockResolvedValue("hashed_password"),
  verify: jest.fn().mockResolvedValue(true),
}));

let app, server;

beforeAll(() => {
  ({ app, server } = createApp());
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────
describe("POST /user/create", () => {
  it("creates a new user and returns a token", async () => {
    userInfoModel.findOne.mockResolvedValue(null); // no existing user
    userInfoModel.prototype.save = jest.fn().mockResolvedValue({});

    const res = await request(app)
      .post("/user/create")
      .send({ username: "alice", password: "secure123" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects duplicate usernames", async () => {
    userInfoModel.findOne.mockResolvedValue({ username: "bob" }); // already exists

    const res = await request(app)
      .post("/user/create")
      .send({ username: "bob", password: "pw" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(false);
    expect(res.body.message).toMatch(/not available/i);
  });

  it("returns 500 on a database error", async () => {
    userInfoModel.findOne.mockRejectedValue(new Error("DB exploded"));

    const res = await request(app)
      .post("/user/create")
      .send({ username: "carol", password: "pw" });

    expect(res.status).toBe(500);
    expect(res.body.stat).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe("POST /user/login", () => {
  it("logs in with correct credentials", async () => {
    userInfoModel.findOne.mockResolvedValue({
      username: "dave",
      password: "hashed_password",
    });

    const res = await request(app)
      .post("/user/login")
      .send({ username: "dave", password: "correctpw" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(typeof res.body.token).toBe("string");
  });

  it("rejects wrong password", async () => {
    const argon2 = require("argon2");
    argon2.verify.mockResolvedValueOnce(false); // bad password this call only

    userInfoModel.findOne.mockResolvedValue({
      username: "dave",
      password: "hashed_password",
    });

    const res = await request(app)
      .post("/user/login")
      .send({ username: "dave", password: "wrong" });

    expect(res.body.stat).toBe(false);
    expect(res.body.message).toMatch(/incorrect password/i);
  });

  it("rejects unknown username", async () => {
    userInfoModel.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post("/user/login")
      .send({ username: "nobody", password: "pw" });

    expect(res.body.stat).toBe(false);
    expect(res.body.message).toMatch(/not found/i);
  });
});

// ─────────────────────────────────────────────────────────────
describe("authenticate middleware", () => {
  it("returns 401 with no token", async () => {
    const res = await request(app)
      .post("/user/update-settings")
      .send({});

    expect(res.status).toBe(401);
  });

  it("returns 403 with an invalid token", async () => {
    const res = await request(app)
      .post("/user/update-settings")
      .set("Authorization", "Bearer not.a.real.token")
      .send({});

    expect(res.status).toBe(403);
  });

  it("accepts a valid Bearer token", async () => {
    // update-settings needs findOneAndUpdate to not crash
    userInfoModel.findOneAndUpdate.mockResolvedValue({ username: "alice" });

    const res = await request(app)
      .post("/user/update-settings")
      .set(authHeader(signToken("alice")))
      .send({ bio: "hello" });

    expect(res.status).toBe(200);
  });
});
