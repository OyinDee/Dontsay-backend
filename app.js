/**
 * app.js — Express app + Socket.IO server factory.
 * Exported so tests can import without binding to a port.
 * index.js calls createApp() then server.listen().
 */
require("dotenv").config();
const mongoose = require("mongoose");

// Reduce the default buffering timeout so hung DB operations fail fast
// instead of silently waiting for 10s+ on every request during an outage.
mongoose.set("bufferTimeoutMS", 8000);
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const cors = require("cors");

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
  startThreadFromMessage,
  claimThread,
} = require("./Controllers/Anon.controller");

const { userInfoModel } = require("./Models/User.model");
const { anonThreadModel } = require("./Models/AnonThread.model");

function createApp() {
  const app = express();

  app.use(bodyParser.json({ limit: "50mb", extended: true }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
  app.use(cors());
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  app.set("io", io);

  // ── Health check ───────────────────────────────────────────
  // Used by Render's health check and by the uptime monitor that keeps the
  // free instance awake. Deliberately does not touch Mongo so it answers
  // instantly and stays 200 while the DB is reconnecting.
  app.get("/health", (req, res) => {
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    res.status(200).json({
      ok: true,
      uptime: Math.round(process.uptime()),
      db: states[mongoose.connection.readyState] || "unknown",
    });
  });

  // ── Socket.IO ──────────────────────────────────────────────
  io.on("connection", (socket) => {
    socket.on("authenticate", async ({ token }) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { username } = decoded;
        socket.username = username;
        socket.join(username);
        await userInfoModel.findOneAndUpdate(
          { username },
          { isOnline: true, lastSeen: new Date() }
        );
        io.emit("presence", { username, isOnline: true, lastSeen: new Date() });
      } catch (err) {
        socket.disconnect(true);
      }
    });

    socket.on("typing", async ({ threadId }) => {
      try {
        if (!socket.username) return;
        const thread = await anonThreadModel.findById(threadId);
        if (!thread) return;
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
      } catch {}
    });

    socket.on("disconnect", async () => {
      if (!socket.username) return;
      const lastSeen = new Date();
      try {
        await userInfoModel.findOneAndUpdate(
          { username: socket.username },
          { isOnline: false, lastSeen }
        );
        io.emit("presence", { username: socket.username, isOnline: false, lastSeen });
      } catch {}
    });
  });

  // ── Routes ─────────────────────────────────────────────────
  app.post("/user/create", create);
  app.post("/user/login", login);
  app.post("/get", getMessages);
  app.post("/send", sendMessage);
  app.post("/user/forgot-password", sendForgotPasswordMail);
  app.post("/user/reset-password", resetPassword);
  app.post("/user/set-recovery-email", authenticate, setRecoveryEmail);

  app.get("/user/:username/profile", getUserProfile);
  app.post("/user/update-settings", authenticate, updateSettings);

  app.post("/message/mark-read", authenticate, markMessagesRead);
  app.delete("/message/:id", authenticate, deleteMessage);

  app.get("/anon/threads", authenticate, getThreads);
  app.get("/anon/thread/:threadId", authenticate, getThread);
  app.post("/anon/reply", authenticate, replyThread);
  app.post("/anon/send", authenticate, sendAnonMessage);
  app.post("/anon/thread/from-message", authenticate, startThreadFromMessage);
  app.post("/anon/claim-thread", authenticate, claimThread);

  return { app, server, io };
}

module.exports = { createApp };
