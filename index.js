require("dotenv").config();
const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const PORT = process.env.PORT || 3000;

// ─── Controllers ──────────────────────────────────────────────────────────────
const {
  login,
  getMessages,
  sendMessage,
  create,
  sendForgotPasswordMail,
  resetPassword,
  setRecoveryEmail,
  authenticate,
  getUserProfile,
  updateSettings,
  markMessagesRead,
  deleteMessage,
} = require("./Controllers/User.controller");

const {
  getThreads,
  getThread,
  replyThread,
  sendAnonMessage,
  claimThread,
} = require("./Controllers/Anon.controller");

// ─── Models (for Socket.IO presence updates) ──────────────────────────────────
const { userInfoModel } = require("./Models/User.model");
const { anonThreadModel } = require("./Models/AnonThread.model");

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(bodyParser.json({ limit: "50mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
app.use(cors());
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ─── HTTP + Socket.IO server ──────────────────────────────────────────────────
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Make io accessible inside route handlers via req.app.get("io")
app.set("io", io);

// ─── MongoDB ──────────────────────────────────────────────────────────────────
mongoose.Query.prototype.timeout = 20000;
mongoose
  .connect(process.env.URI)
  .then(() => console.log("MONGODB has connected"))
  .catch((err) => console.log("Error in mongodb connection", err));

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // 1. Client emits authenticate { token }
  socket.on("authenticate", async ({ token }) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { username } = decoded;

      socket.username = username;
      socket.join(username); // join personal room
      console.log(`${username} authenticated via socket`);

      // Mark online
      await userInfoModel.findOneAndUpdate(
        { username },
        { isOnline: true, lastSeen: new Date() }
      );

      // Broadcast presence
      io.emit("presence", { username, isOnline: true, lastSeen: new Date() });
    } catch (err) {
      console.error("Socket auth error:", err.message);
      socket.disconnect(true);
    }
  });

  // 2. Typing event — forward to the other participant
  socket.on("typing", async ({ threadId }) => {
    try {
      if (!socket.username) return;

      const thread = await anonThreadModel.findById(threadId);
      if (!thread) return;

      // Determine the other party's room
      const otherRoom =
        thread.recipientUsername === socket.username
          ? thread.senderIdentity
          : thread.recipientUsername;

      if (otherRoom) {
        io.to(otherRoom).emit("typing", {
          threadId,
          alias:
            thread.recipientUsername === socket.username
              ? socket.username
              : thread.senderAlias,
        });
      }
    } catch (err) {
      console.error("Socket typing error:", err.message);
    }
  });

  // 3. Disconnect — mark offline, update lastSeen
  socket.on("disconnect", async () => {
    if (!socket.username) return;
    const lastSeen = new Date();
    try {
      await userInfoModel.findOneAndUpdate(
        { username: socket.username },
        { isOnline: false, lastSeen }
      );
      io.emit("presence", {
        username: socket.username,
        isOnline: false,
        lastSeen,
      });
      console.log(`${socket.username} disconnected`);
    } catch (err) {
      console.error("Disconnect update error:", err.message);
    }
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Existing — must not break
app.post("/user/create", create);
app.post("/user/login", login);
app.post("/get", getMessages);
app.post("/send", sendMessage);
app.post("/user/forgot-password", sendForgotPasswordMail);
app.post("/user/reset-password", resetPassword);
app.post("/user/set-recovery-email", authenticate, setRecoveryEmail);

// New user / settings
app.get("/user/:username/profile", getUserProfile);
app.post("/user/update-settings", authenticate, updateSettings);

// Message management
app.post("/message/mark-read", authenticate, markMessagesRead);
app.delete("/message/:id", authenticate, deleteMessage);

// Anon chat
app.get("/anon/threads", authenticate, getThreads);
app.get("/anon/thread/:threadId", authenticate, getThread);
app.post("/anon/reply", authenticate, replyThread);
app.post("/anon/send", authenticate, sendAnonMessage);
app.post("/anon/claim-thread", authenticate, claimThread);

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`app listening on PORT ${PORT}`);
});
