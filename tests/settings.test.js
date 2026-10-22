/**
 * Settings & profile routes:
 *   GET  /user/:username/profile
 *   POST /user/update-settings
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
const { uploadToCloudinary } = require("../Utils/Cloudinary.utils");

let app, server;

beforeAll(() => {
  ({ app, server } = createApp());
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => jest.clearAllMocks());

const mockUser = (overrides = {}) => ({
  username: "profuser",
  profileImage: null,
  bio: null,
  acceptMessages: true,
  allowAnonymousChat: false,
  isOnline: false,
  lastSeen: null,
  ...overrides,
});

// ── GET /user/:username/profile ───────────────────────────────
describe("GET /user/:username/profile", () => {
  it("returns a public profile for an existing user", async () => {
    userInfoModel.findOne.mockResolvedValue(mockUser());

    const res = await request(app).get("/user/profuser/profile");

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("profuser");
    expect(res.body).toHaveProperty("profileImage");
    expect(res.body).toHaveProperty("bio");
    expect(res.body).toHaveProperty("acceptMessages");
    expect(res.body).toHaveProperty("allowAnonymousChat");
    expect(res.body).toHaveProperty("isOnline");
    expect(res.body).toHaveProperty("lastSeen");
  });

  it("does not include password, recoveryEmail, or any private fields", async () => {
    userInfoModel.findOne.mockResolvedValue(
      mockUser({ password: "secret", recoveryEmail: "priv@example.com" })
    );

    const res = await request(app).get("/user/profuser/profile");

    expect(res.body).not.toHaveProperty("password");
    expect(res.body).not.toHaveProperty("recoveryEmail");
  });

  it("returns 404 for a non-existent user", async () => {
    userInfoModel.findOne.mockResolvedValue(null);

    const res = await request(app).get("/user/nobody/profile");

    expect(res.status).toBe(404);
  });

  it("requires no authentication", async () => {
    userInfoModel.findOne.mockResolvedValue(mockUser());

    // No auth header — must still succeed
    const res = await request(app).get("/user/profuser/profile");

    expect(res.status).toBe(200);
  });
});

// ── POST /user/update-settings ────────────────────────────────
describe("POST /user/update-settings", () => {
  const token = signToken("settingsuser");

  it("updates bio successfully", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({ username: "settingsuser" });

    const res = await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ bio: "Hello world" });

    expect(res.status).toBe(200);
    expect(res.body.stat).toBe(true);
    expect(userInfoModel.findOneAndUpdate).toHaveBeenCalledWith(
      { username: "settingsuser" },
      expect.objectContaining({ bio: "Hello world" }),
      { new: true }
    );
  });

  it("truncates bio to 160 characters", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    const longBio = "x".repeat(200);
    await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ bio: longBio });

    const updateCall = userInfoModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.bio.length).toBe(160);
  });

  it("toggles acceptMessages off", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ acceptMessages: false });

    const updateCall = userInfoModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.acceptMessages).toBe(false);
  });

  it("toggles allowAnonymousChat on", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ allowAnonymousChat: true });

    const updateCall = userInfoModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.allowAnonymousChat).toBe(true);
  });

  it("uploads a base64 profileImage to Cloudinary and stores the URL", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ profileImage: "data:image/png;base64,iVBORw0KGgo=" });

    expect(uploadToCloudinary).toHaveBeenCalledWith("data:image/png;base64,iVBORw0KGgo=");

    const updateCall = userInfoModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.profileImage).toMatch(/cloudinary/);
  });

  it("ignores profileImage when it is not a data URI", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    await request(app)
      .post("/user/update-settings")
      .set(authHeader(token))
      .send({ profileImage: "https://already-a-url.com/img.jpg" });

    const updateCall = userInfoModel.findOneAndUpdate.mock.calls[0][1];
    expect(updateCall.profileImage).toBeUndefined();
    expect(uploadToCloudinary).not.toHaveBeenCalled();
  });

  it("returns 401 without a token", async () => {
    const res = await request(app)
      .post("/user/update-settings")
      .send({ bio: "no token" });

    expect(res.status).toBe(401);
  });
});
