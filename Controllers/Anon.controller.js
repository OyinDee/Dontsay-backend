const jwt = require("jsonwebtoken");
const { anonThreadModel } = require("../Models/AnonThread.model");
const { anonMessageModel } = require("../Models/AnonMessage.model");
const { messagesModel } = require("../Models/Messages.model");
const { userInfoModel } = require("../Models/User.model");
const { generateAlias } = require("../Utils/AliasGenerator.utils");
const MailerService = require("../Services/Mailer.Services");
require("dotenv").config();

const mailerService = new MailerService();

const FRONTEND_URL = process.env.FRONTEND_URL || "https://wispah.vercel.app";

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

    const senderEmail = thread.senderBccEmail || thread.bccEmail;
    if (senderEmail) {
      try {
        await mailerService.sendAnonReplyMail(
          senderEmail,
          thread.senderAlias,
          username,
          content,
          FRONTEND_URL
        );
      } catch (mailErr) {
        console.error("Anon reply email failed:", mailErr.message);
      }
    }

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

    res.status(200).send({
      stat: true,
      message: {
        _id: msg._id,
        senderRole: msg.senderRole,
        content: msg.content,
        title: msg.title || null,
        imageURL: msg.imageURL || null,
        read: msg.read,
        expiresAt: msg.expiresAt || null,
        createdAt: msg.createdAt,
      },
    });
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

    res.status(200).send({
      stat: true,
      message: {
        _id: msg._id,
        senderRole: msg.senderRole,
        content: msg.content,
        title: msg.title || null,
        imageURL: msg.imageURL || null,
        read: msg.read,
        expiresAt: msg.expiresAt || null,
        createdAt: msg.createdAt,
      },
    });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /anon/thread/from-message ───────────────────────────────────────────
// The recipient explicitly chooses to reply to an inbox message. Only now is a
// conversation created, and the original anonymous message becomes its first
// entry. The sender is never assigned a username here — they must claim the
// thread themselves (via the emailed link) before their account is linked.

const startThreadFromMessage = async (req, res) => {
  try {
    const { username } = req.user;
    const { messageId } = req.body;

    const message = await messagesModel.findById(messageId);
    if (!message) return res.status(404).send({ message: "Message not found", stat: false });
    if (message.username.toLowerCase() !== username.toLowerCase()) {
      return res.status(403).send({ message: "Forbidden", stat: false });
    }

    // Idempotent — clicking Reply again opens the existing conversation.
    if (message.threadId) {
      const existing = await anonThreadModel.findById(message.threadId);
      if (existing) {
        return res.status(200).send({
          stat: true,
          threadId: existing._id.toString(),
          senderAlias: existing.senderAlias,
          status: existing.status,
        });
      }
    }

    const user = await userInfoModel.findOne({ username });
    if (user && user.allowAnonymousChat === false) {
      return res.status(403).send({
        message: "Anonymous replies are turned off for this account",
        stat: false,
      });
    }

    const alias = generateAlias();
    const thread = await anonThreadModel.create({
      recipientUsername: username,
      senderAlias: alias,
      senderBccEmail: message.bccEmail || null,
      bccEmail: message.bccEmail || null,
      status: "pending_sender_account",
      senderIdentity: null,
      claimed: false,
      claimToken: null,
    });

    // The anonymous message that started it all is the first message.
    await anonMessageModel.create({
      threadId: thread._id,
      fromAlias: alias,
      senderRole: "sender",
      content: message.message,
      title: message.title || null,
      imageURL: message.imageURL || null,
      expiresAt: message.expiresAt || null,
      createdAt: message.time || message.createdAt,
    });

    if (message.bccEmail) {
      const claimToken = jwt.sign(
        { threadId: thread._id.toString(), bccEmail: message.bccEmail },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );
      thread.claimToken = claimToken;
      await thread.save();

      const claimLink = `${FRONTEND_URL}/claim?token=${claimToken}&threadId=${thread._id}`;
      try {
        await mailerService.sendAnonClaimMail(message.bccEmail, alias, username, claimLink);
      } catch (mailErr) {
        console.error("Anon claim email failed:", mailErr.message);
      }
    }

    message.threadId = thread._id;
    await message.save();

    return res.status(200).send({
      stat: true,
      threadId: thread._id.toString(),
      senderAlias: alias,
      status: thread.status,
    });
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
  startThreadFromMessage,
  claimThread,
};
