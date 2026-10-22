const { createApp } = require("../app");
const { signToken } = require("./helpers");
const ioc = require("socket.io-client");

jest.mock("../Models/User.model");
jest.mock("../Models/Messages.model");
jest.mock("../Models/AnonThread.model");
jest.mock("../Models/AnonMessage.model");
jest.mock("../Models/ForgotPasswordCodes.model");

const { userInfoModel } = require("../Models/User.model");
const { anonThreadModel } = require("../Models/AnonThread.model");

let app, server, io, port;

beforeAll((done) => {
  ({ app, server, io } = createApp());
  server.listen(0, () => {
    port = server.address().port;
    done();
  });
});

afterAll((done) => {
  io.close();
  server.close(done);
});

beforeEach(() => jest.clearAllMocks());

const connect = () =>
  ioc(`http://localhost:${port}`, {
    transports: ["websocket"],
    autoConnect: false,
  });

const waitFor = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Timeout waiting for "${event}"`)),
      timeoutMs
    );
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });

// ── authenticate ──────────────────────────────────────────────
describe("socket authenticate", () => {
  it("marks the user online and emits presence", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    const socket = connect();
    socket.connect();
    await waitFor(socket, "connect");

    socket.emit("authenticate", { token: signToken("sock_alice") });

    const presence = await waitFor(socket, "presence");
    expect(presence.username).toBe("sock_alice");
    expect(presence.isOnline).toBe(true);

    socket.disconnect();
  });

  it("broadcasts presence to all connected clients", (done) => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    const observer = connect();
    const actor = connect();

    observer.connect();
    observer.on("connect", () => {
      observer.on("presence", ({ username, isOnline }) => {
        if (username === "sock_bob") {
          expect(isOnline).toBe(true);
          observer.disconnect();
          actor.disconnect();
          done();
        }
      });
      actor.connect();
      actor.on("connect", () => {
        actor.emit("authenticate", { token: signToken("sock_bob") });
      });
    });
  });

  it("disconnects sockets with invalid tokens", (done) => {
    const socket = connect();
    socket.connect();
    socket.on("connect", () => {
      socket.emit("authenticate", { token: "not.a.real.token" });
    });
    socket.on("disconnect", () => done());
  });
});

// ── disconnect ────────────────────────────────────────────────
describe("socket disconnect", () => {
  it("marks the user offline when they disconnect", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});

    const socket = connect();
    socket.connect();
    await waitFor(socket, "connect");

    socket.emit("authenticate", { token: signToken("sock_charlie") });
    await waitFor(socket, "presence"); // online

    socket.disconnect();
    await new Promise((r) => setTimeout(r, 200));

    // Second call should be isOnline: false
    const calls = userInfoModel.findOneAndUpdate.mock.calls;
    const offlineCall = calls.find((c) => c[1].isOnline === false);
    expect(offlineCall).toBeDefined();
    expect(offlineCall[0]).toEqual({ username: "sock_charlie" });
  });
});

// ── typing forwarding ─────────────────────────────────────────
describe("socket typing", () => {
  it("forwards typing event to the recipient", async () => {
    userInfoModel.findOneAndUpdate.mockResolvedValue({});
    anonThreadModel.findById.mockResolvedValue({
      _id: "t1",
      recipientUsername: "sock_recip",
      senderIdentity: "sock_sender",
      senderAlias: "Ghost#0001",
    });

    const recipSocket = connect();
    recipSocket.connect();
    await waitFor(recipSocket, "connect");
    recipSocket.emit("authenticate", { token: signToken("sock_recip") });
    await waitFor(recipSocket, "presence");

    const senderSocket = connect();
    senderSocket.connect();
    await waitFor(senderSocket, "connect");
    senderSocket.emit("authenticate", { token: signToken("sock_sender") });
    await waitFor(senderSocket, "presence");

    const typingPromise = waitFor(recipSocket, "typing");
    senderSocket.emit("typing", { threadId: "t1" });
    const ev = await typingPromise;

    expect(ev.threadId).toBe("t1");
    expect(ev.alias).toBeDefined();

    recipSocket.disconnect();
    senderSocket.disconnect();
  });
});
