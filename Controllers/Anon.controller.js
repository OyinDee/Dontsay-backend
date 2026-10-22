const jwt = require("jsonwebtoken");
const { anonThreadModel } = require("../Models/AnonThread.model");
const { anonMessageModel } = require("../Models/AnonMessage.model");
const { userInfoModel } = require("../Models/User.model");
require("dotenv").config();

// ─── GET /anon/threads ────────────────────────────────────────────────────────
// Returns all threads where the logged-in user is recipient OR claimed sender.

const getThreads = async (req, res) => {
  try {
    const { username } = req.user;

    const threads = await anonThreadModel.find({
      $or: [
        { recipientUsername: username },
        { senderIdentity: username },
      ],
    }).sort({ updatedAt: -1 });

    // For each thread, find unreadCount and lastMessage
    const results = await Promise.all(
      threads.map(async (t) => {
        // Determine which senderRole this user is NOT (i.e. messages sent TO them)
        const isRecipient = t.recipientUsername === username;
        const theirRole = isRecipient ? "sender" : "recipient";

        const unreadCount = await anonMessageModel.countDocuments({
          threadId: t._id,
          senderRole: theirRole,
          read: false,
        });

        const lastMsg = await anonMessageModel
          .findOne({ threadId: t._id })
          .sort({ createdAt: -1 });

        return {
          _id: t._id,
          senderAlias: t.senderAlias,
          status: t.status,
          unreadCount,
          lastMessage: lastMsg
            ? { content: lastMsg.content, createdAt: lastMsg.createdAt }
            : null,
        };
      })
    );

    res.status(200).send({ threads: results });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── GET /anon/thread/:threadId ───────────────────────────────────────────────

const getThread = async (req, res) => {
  try {
    const { username } = req.user;
    const { threadId } = req.params;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    // Only participants may view
    const isRecipient = thread.recipientUsername === username;
    const isSender = thread.senderIdentity === username;
    if (!isRecipient && !isSender) {
      return res.status(403).send({ message: "Forbidden", stat: false });
    }

    const messages = await anonMessageModel
      .find({ threadId })
      .sort({ createdAt: 1 });

    const shapedMessages = messages.map((m) => ({
      _id: m._id,
      senderRole: m.senderRole,
      content: m.content,
      title: m.title || null,
      imageURL: m.imageURL || null,
      read: m.read,
      expiresAt: m.expiresAt || null,
      createdAt: m.createdAt,
    }));

    res.status(200).send({
      thread: {
        _id: thread._id,
        senderAlias: thread.senderAlias,
        status: thread.status,
        recipientUsername: thread.recipientUsername,
      },
      messages: shapedMessages,
    });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /anon/reply (recipient → sender) ────────────────────────────────────

const replyThread = async (req, res) => {
  try {
    const { username } = req.user;
    const { threadId, content, title, expiresIn } = req.body;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.recipientUsername !== username) {
      return res.status(403).send({ message: "Only the recipient can use this endpoint", stat: false });
    }
    if (thread.status === "closed") {
      return res.status(400).send({ message: "Thread is closed", stat: false });
    }

    let expiresAt = null;
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const msg = await anonMessageModel.create({
      threadId,
      fromAlias: username, // recipient's username used as alias for themselves
      senderRole: "recipient",
      content,
      title: title || null,
      expiresAt,
    });

    // Emit to sender's room if they have claimed the thread
    const io = req.app.get("io");
    if (io && thread.senderIdentity) {
      io.to(thread.senderIdentity).emit("new_anon_message", {
        threadId,
        message: {
          _id: msg._id,
          senderRole: msg.senderRole,
          content: msg.content,
          title: msg.title,
          imageURL: msg.imageURL,
          read: msg.read,
          expiresAt: msg.expiresAt,
          createdAt: msg.createdAt,
        },
      });
    }

    res.status(200).send({ stat: true });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /anon/send (sender → recipient, after claim) ────────────────────────

const sendAnonMessage = async (req, res) => {
  try {
    const { username } = req.user;
    const { threadId, content, title, expiresIn } = req.body;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.senderIdentity !== username) {
      return res.status(403).send({ message: "Only the claimed sender can use this endpoint", stat: false });
    }
    if (thread.status === "closed") {
      return res.status(400).send({ message: "Thread is closed", stat: false });
    }

    let expiresAt = null;
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const msg = await anonMessageModel.create({
      threadId,
      fromAlias: thread.senderAlias,
      senderRole: "sender",
      content,
      title: title || null,
      expiresAt,
    });

    // Emit to recipient's room
    const io = req.app.get("io");
    if (io) {
      io.to(thread.recipientUsername).emit("new_anon_message", {
        threadId,
        message: {
          _id: msg._id,
          senderRole: msg.senderRole,
          content: msg.content,
          title: msg.title,
          imageURL: msg.imageURL,
          read: msg.read,
          expiresAt: msg.expiresAt,
          createdAt: msg.createdAt,
        },
      });
    }

    res.status(200).send({ stat: true });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /anon/claim-thread ──────────────────────────────────────────────────

const claimThread = async (req, res) => {
  try {
    const { username } = req.user;
    const { threadId } = req.body;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.claimed) {
      // Already claimed — just make sure it's this user
      if (thread.senderIdentity !== username) {
        return res.status(403).send({ message: "Thread already claimed by another user", stat: false });
      }
      return res.status(200).send({ stat: true, message: "Thread claimed" });
    }

    // Link account
    thread.senderIdentity = username;
    thread.claimed = true;
    thread.status = "active";
    thread.claimToken = null; // invalidate the one-time token
    await thread.save();

    res.status(200).send({ stat: true, message: "Thread claimed" });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

module.exports = {
  getThreads,
  getThread,
  replyThread,
  sendAnonMessage,
  claimThread,
};
