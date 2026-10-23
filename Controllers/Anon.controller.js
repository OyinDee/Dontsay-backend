const jwt = require("jsonwebtoken");
const { anonThreadModel } = require("../Models/AnonThread.model");
const { anonMessageModel } = require("../Models/AnonMessage.model");
const { messagesModel } = require("../Models/Messages.model");
const { userInfoModel } = require("../Models/User.model");
const { uploadToCloudinary, uploadAudioToCloudinary } = require("../Utils/Cloudinary.utils");
const { generateAlias } = require("../Utils/AliasGenerator.utils");
const MailerService = require("../Services/Mailer.Services");
require("dotenv").config();

const mailerService = new MailerService();

const FRONTEND_URL = process.env.FRONTEND_URL || "https://wispah.vercel.app";

const getDataUrlBytes = (value, mediaType) => {
  if (typeof value !== "string") return null;
  const match = value.match(new RegExp(`^data:${mediaType}/[\\w.+-]+;base64,([A-Za-z0-9+/]*={0,2})$`));
  return match ? Buffer.byteLength(match[1], "base64") : null;
};

// ─── GET /anon/threads ───────────────────────  ─────────────────────────────────
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
          peerName: isRecipient ? t.senderAlias : t.recipientUsername,
          status: t.status,
          isRecipient,
          unreadCount,
          lastMessage: lastMsg
            ? {
                content: lastMsg.content,
                imageURL: lastMsg.imageURL || null,
                voiceURL: lastMsg.voiceURL || null,
                createdAt: lastMsg.createdAt,
              }
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

    await anonMessageModel.updateMany(
      {
        threadId,
        senderRole: isRecipient ? "sender" : "recipient",
        read: false,
      },
      { $set: { read: true, readAt: new Date() } }
    );

    const messages = await anonMessageModel
      .find({ threadId })
      .sort({ createdAt: 1 });

    const shapedMessages = messages.map((m) => ({
      _id: m._id,
      senderRole: m.senderRole,
      content: m.content,
      title: m.title || null,
      imageURL: m.imageURL || null,
      voiceURL: m.voiceURL || null,
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
    const { threadId, content, title, expiresIn, image, voiceNote } = req.body;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.recipientUsername !== username) {
      return res.status(403).send({ message: "Only the recipient can use this endpoint", stat: false });
    }
    if (thread.status === "closed") {
      return res.status(400).send({ message: "Thread is closed", stat: false });
    }
    const text = typeof content === "string" ? content.trim() : "";
    if (!text && !image && !voiceNote) {
      return res.status(400).send({ message: "A message, image, or voice note is required", stat: false });
    }
    const imageBytes = image ? getDataUrlBytes(image, "image") : null;
    if (image && imageBytes === null) {
      return res.status(400).send({ message: "Image must be a base64 image data URL", stat: false });
    }
    if (imageBytes === 0 || imageBytes > 8 * 1024 * 1024) {
      return res.status(413).send({ message: "Images must be 8 MB or smaller", stat: false });
    }
    const voiceBytes = voiceNote ? getDataUrlBytes(voiceNote, "audio") : null;
    if (voiceNote && voiceBytes === null) {
      return res.status(400).send({ message: "Voice note must be a base64 audio data URL", stat: false });
    }
    if (voiceBytes === 0 || voiceBytes > 10 * 1024 * 1024) {
      return res.status(413).send({ message: "Voice notes must be 10 MB or smaller", stat: false });
    }

    let expiresAt = null;
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const imageURL = image ? await uploadToCloudinary(image) : null;
    const voiceURL = voiceNote ? await uploadAudioToCloudinary(voiceNote) : null;
    const msg = await anonMessageModel.create({
      threadId,
      fromAlias: username, // recipient's username used as alias for themselves
      senderRole: "recipient",
      content: text,
      title: title || null,
      imageURL,
      voiceURL,
      expiresAt,
    });

    let senderEmail = thread.senderBccEmail || thread.bccEmail;
    let emailSource = senderEmail ? "thread" : null;

    if (!senderEmail) {
      try {
        const originalMessage = await messagesModel.findOne({ threadId: thread._id });
        senderEmail = originalMessage && originalMessage.bccEmail;
        if (senderEmail) emailSource = "original_message";
      } catch (lookupErr) {
        console.error("Anon reply sender email lookup failed", {
          threadId: thread._id.toString(),
          source: "original_message",
          error: lookupErr.message,
        });
      }
    }

    if (!senderEmail && thread.senderIdentity) {
      try {
        const sender = await userInfoModel.findOne({ username: thread.senderIdentity });
        senderEmail = sender && sender.recoveryEmail;
        if (senderEmail) emailSource = "sender_account";
      } catch (lookupErr) {
        console.error("Anon reply sender email lookup failed", {
          threadId: thread._id.toString(),
          source: "sender_account",
          error: lookupErr.message,
        });
      }
    }

    if (senderEmail) {
      try {
        let appLink = FRONTEND_URL;
        if (!thread.claimed) {
          const claimToken = jwt.sign(
            { threadId: thread._id.toString() },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
          );
          thread.claimToken = claimToken;
          await thread.save();

          const claimParams = new URLSearchParams({
            token: claimToken,
            threadId: thread._id.toString(),
          });
          appLink = `${FRONTEND_URL.replace(/\/+$/, "")}/claim?${claimParams}`;
        }

        await mailerService.sendAnonReplyMail(
          senderEmail,
          thread.senderAlias,
          username,
          text || (imageURL && voiceURL
            ? "Sent an image and a voice note."
            : imageURL ? "Sent an image." : voiceURL ? "Sent a voice note." : text),
          appLink
        );
        console.info("Anon reply email sent", {
          threadId: thread._id.toString(),
          source: emailSource,
        });
      } catch (mailErr) {
        console.error("Anon reply email failed", {
          threadId: thread._id.toString(),
          error: mailErr.message,
        });
      }
    } else {
      console.warn("Anon reply email skipped: no sender email on thread", {
        threadId: thread._id.toString(),
      });
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
          voiceURL: msg.voiceURL,
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
        voiceURL: msg.voiceURL || null,
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
    const { threadId, content, title, expiresIn, image, voiceNote } = req.body;

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.senderIdentity !== username) {
      return res.status(403).send({ message: "Only the claimed sender can use this endpoint", stat: false });
    }
    if (thread.status === "closed") {
      return res.status(400).send({ message: "Thread is closed", stat: false });
    }
    const text = typeof content === "string" ? content.trim() : "";
    if (!text && !image && !voiceNote) {
      return res.status(400).send({ message: "A message, image, or voice note is required", stat: false });
    }
    const imageBytes = image ? getDataUrlBytes(image, "image") : null;
    if (image && imageBytes === null) {
      return res.status(400).send({ message: "Image must be a base64 image data URL", stat: false });
    }
    if (imageBytes === 0 || imageBytes > 8 * 1024 * 1024) {
      return res.status(413).send({ message: "Images must be 8 MB or smaller", stat: false });
    }
    const voiceBytes = voiceNote ? getDataUrlBytes(voiceNote, "audio") : null;
    if (voiceNote && voiceBytes === null) {
      return res.status(400).send({ message: "Voice note must be a base64 audio data URL", stat: false });
    }
    if (voiceBytes === 0 || voiceBytes > 10 * 1024 * 1024) {
      return res.status(413).send({ message: "Voice notes must be 10 MB or smaller", stat: false });
    }

    let expiresAt = null;
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const imageURL = image ? await uploadToCloudinary(image) : null;
    const voiceURL = voiceNote ? await uploadAudioToCloudinary(voiceNote) : null;
    const msg = await anonMessageModel.create({
      threadId,
      fromAlias: thread.senderAlias,
      senderRole: "sender",
      content: text,
      title: title || null,
      imageURL,
      voiceURL,
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
          voiceURL: msg.voiceURL,
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
        voiceURL: msg.voiceURL || null,
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
      voiceURL: message.voiceURL || null,
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
    const { threadId, token } = req.body;

    if (!threadId || !token) {
      return res.status(400).send({
        message: "Thread ID and claim token are required",
        stat: false,
      });
    }

    const thread = await anonThreadModel.findById(threadId);
    if (!thread) return res.status(404).send({ message: "Thread not found", stat: false });

    if (thread.recipientUsername.toLowerCase() === username.toLowerCase()) {
      return res.status(403).send({
        message: "The anonymous box owner cannot claim this thread",
        stat: false,
      });
    }

    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(403).send({ message: "Invalid or expired claim token", stat: false });
    }

    if (claims.threadId !== thread._id.toString()) {
      return res.status(403).send({ message: "Invalid or expired claim token", stat: false });
    }

    if (thread.claimed) {
      if (thread.senderIdentity?.toLowerCase() !== username.toLowerCase()) {
        return res.status(403).send({ message: "Thread already claimed by another user", stat: false });
      }
      return res.status(200).send({ stat: true, message: "Thread claimed" });
    }

    if (thread.claimToken !== token) {
      return res.status(403).send({ message: "Invalid or expired claim token", stat: false });
    }

    const claimedThread = await anonThreadModel.findOneAndUpdate(
      {
        _id: thread._id,
        claimed: false,
        claimToken: token,
        recipientUsername: { $ne: username },
      },
      {
        $set: {
          senderIdentity: username,
          claimed: true,
          status: "active",
          claimToken: null,
        },
      },
      { new: true, runValidators: true }
    );

    if (!claimedThread) {
      const currentThread = await anonThreadModel.findById(threadId);
      if (currentThread?.claimed && currentThread.senderIdentity?.toLowerCase() === username.toLowerCase()) {
        return res.status(200).send({ stat: true, message: "Thread claimed" });
      }
      return res.status(403).send({ message: "Thread has already been claimed", stat: false });
    }

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
