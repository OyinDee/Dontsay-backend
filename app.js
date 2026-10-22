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

const getAllowedOrigins = () => {
  const configuredOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : [
        process.env.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "https://wispah.vercel.app",
      ];

  return configuredOrigins
    .filter((entry) => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeOrigin = (origin) => {
  if (!origin) return "";

  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, "");
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  const allowedOrigins = getAllowedOrigins().map(normalizeOrigin);

  return allowedOrigins.some(
    (allowedOrigin) =>
      allowedOrigin === "*" ||
      allowedOrigin === normalizedOrigin ||
      normalizedOrigin.startsWith(`${allowedOrigin}/`)
  );
};

function createApp() {
  const app = express();
  const allowedOrigins = getAllowedOrigins();

  app.use(bodyParser.json({ limit: "50mb", extended: true }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
    })
  );
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`Origin ${origin} is not allowed by Socket.IO CORS`));
      },
      methods: ["GET", "POST", "OPTIONS"],
      credentials: true,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
    },
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

  // Claim links belong to the frontend. Redirect there so links from older
  // emails (which pointed at the API host) still work.
  app.get("/claim", (req, res) => {
    const query = req.originalUrl.split("?")[1];
    const frontend = process.env.FRONTEND_URL || "https://wispah.vercel.app";
    res.redirect(`${frontend}/claim${query ? `?${query}` : ""}`);
  });

  return { app, server, io };
}

module.exports = { createApp };
