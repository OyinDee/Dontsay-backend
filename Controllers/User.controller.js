const { userInfoModel } = require("../Models/User.model");
const { messagesModel } = require("../Models/Messages.model");
const { uploadToCloudinary } = require("../Utils/Cloudinary.utils");
const bcryptjs = require("bcryptjs");
const jwt = require("jsonwebtoken");
const MailerService = require("../Services/Mailer.Services");
const { generateForgotPasswordCode } = require("../Utils/CodeGenerator.utils");
const { forgotPasswordCodesModel } = require("../Models/ForgotPasswordCodes.model");
const argon2 = require("argon2");
require("dotenv").config();

const mailerService = new MailerService();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─── Auth middleware ───────────────────────────────────────────────────────────

const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"] || req.headers["Authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).send({ message: "No token provided" });
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).send({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// ─── Create user ──────────────────────────────────────────────────────────────

const create = async (request, response) => {
  const { username, password, recoveryEmail } = request.body;

  try {
    const existingUser = await userInfoModel.findOne({ username });
    if (existingUser) {
      return response.status(200).send({ message: "username not available", stat: false });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET);
    const hashedPassword = await argon2.hash(password);

    const form = new userInfoModel({ username, password: hashedPassword, recoveryEmail });
    const result = await form.save();

    console.log(result);
    response.status(200).send({ message: "created successfully", token, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send({ stat: false, message: err.message });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

const login = async (request, response) => {
  const { username, password } = request.body;

  try {
    const users = await userInfoModel.find({
      username: { $regex: `^${escapeRegex(username)}$`, $options: "i" },
    });
    if (users.length === 0) {
      return response.status(200).send({ message: "user not found", stat: false });
    }

    let matchedUser = null;
    for (const user of users) {
      if (await argon2.verify(user.password, password)) {
        matchedUser = user;
        break;
      }
    }
    if (!matchedUser) {
      return response.status(200).send({ message: "incorrect password", stat: false });
    }

    const token = jwt.sign({ username: matchedUser.username }, process.env.JWT_SECRET);
    response.status(200).send({ message: "logged in", token, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send({ stat: false, message: err.message });
  }
};

// ─── Get messages (POST /get) ─────────────────────────────────────────────────
// Keeps the original body-token approach working. Also supports Bearer token.

const getMessages = async (request, response) => {
  // Support both body token (legacy) and Bearer header
  let username;
  const authHeader = request.headers["authorization"] || request.headers["Authorization"];
  const headerToken = authHeader && authHeader.split(" ")[1];

  if (headerToken) {
    try {
      const decoded = jwt.verify(headerToken, process.env.JWT_SECRET);
      username = decoded.username;
    } catch {
      return response.status(400).send("session expired, login again");
    }
  } else {
    const bodyToken = request.body.token;
    const decoded = jwt.decode(bodyToken);
    if (!decoded) return response.status(400).send("session expired, login again");
    username = decoded.username;
  }

  console.log(username);

  try {
    const [messages, userRecord] = await Promise.all([
      messagesModel.find({ username }),
      userInfoModel.findOne({ username }),
    ]);

    const settings = userRecord
      ? {
          profileImage: userRecord.profileImage || null,
          bio: userRecord.bio || null,
          allowAnonymousChat: userRecord.allowAnonymousChat,
          acceptMessages: userRecord.acceptMessages,
          isOnline: userRecord.isOnline,
          lastSeen: userRecord.lastSeen,
        }
      : null;

    if (messages.length === 0) {
      return response.status(200).send({ message: "nothing", stat: true, username, settings });
    }

    // Shape each message to the spec
    const shaped = messages.map((m) => ({
      _id: m._id,
      message: m.message,
      title: m.title || null,
      imageURL: m.imageURL || null,
      time: m.time,
      expiresAt: m.expiresAt || null,
      read: m.read,
      threadId: m.threadId || null,
      canReply: Boolean(m.bccEmail),
    }));

    response.status(200).send({ message: shaped, username, stat: true, settings });
  } catch (err) {
    console.log(err.message);
    response.status(500).send("An error occurred");
  }
};

// ─── Send message (POST /send) ────────────────────────────────────────────────

const sendMessage = async (request, response) => {
  const { img, message, username, time, title, expiresIn, bccEmail } = request.body;

  try {
    // Check recipient exists
    const userExists = await userInfoModel.findOne({ username });
    if (!userExists) {
      return response.status(200).send({ message: "user not found", stat: false });
    }

    // Guard: acceptMessages
    if (userExists.acceptMessages === false) {
      return response.status(200).send({
        stat: false,
        message: "This user isn't accepting messages right now.",
      });
    }

    // Upload image if provided
    const imageURL = await uploadToCloudinary(img);

    // Compute expiresAt
    let expiresAt = null;
    if (expiresIn && Number(expiresIn) > 0) {
      expiresAt = new Date(Date.now() + Number(expiresIn) * 1000);
    }

    const newMessage = new messagesModel({
      message,
      username,
      imageURL,
      time: time || Date.now(),
      title: title || null,
      expiresAt,
      // Only stored when the recipient allows anonymous chat. Used when the
      // recipient chooses to reply — no conversation is created here.
      bccEmail: userExists.allowAnonymousChat ? (bccEmail || null) : null,
    });

    const saved = await newMessage.save();

    // Emit real-time event (io attached to app by index.js)
    const io = request.app.get("io");
    if (io) {
      const shaped = {
        _id: saved._id,
        message: saved.message,
        title: saved.title || null,
        imageURL: saved.imageURL || null,
        time: saved.time,
        expiresAt: saved.expiresAt || null,
        read: saved.read,
        threadId: saved.threadId || null,
        canReply: Boolean(saved.bccEmail),
      };
      io.to(username).emit("new_wispa", shaped);
    }

    const resp = { stat: true, message: "Sent" };
    return response.status(200).send(resp);
  } catch (err) {
    console.log(err.message);
    response.status(400).send({ status: false, message: err.message });
  }
};

// ─── Forgot password ──────────────────────────────────────────────────────────

const sendForgotPasswordMail = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).send({ message: "username required" });

    const existingUser = await userInfoModel.findOne({ username });
    if (!existingUser) return res.status(404).send({ message: "User not found" });

    const email = existingUser.recoveryEmail;
    if (!email) return res.status(400).send({ message: "No recovery email set for this user" });

    await forgotPasswordCodesModel.deleteMany({ email, username });

    const code = generateForgotPasswordCode();
    const createUserCode = await forgotPasswordCodesModel.create({ email, username, code });
    if (!createUserCode) return res.status(500).send({ message: "An error occurred. Try again later" });

    try {
      const sendMail = await mailerService.sendForgotPasswordMail(email, code, username);
      if (!sendMail) return res.status(500).send({ message: "An error occurred. Try again later" });
      return res.status(200).send({ ...sendMail });
    } catch (mailError) {
      console.error("Mail sending error:", mailError);
      return res.status(500).send({ message: "Failed to send email", stat: false });
    }
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).send({ message: "Internal server error", stat: false });
  }
};

// ─── Reset password ───────────────────────────────────────────────────────────

const resetPassword = async (req, res) => {
  try {
    const { code, newPassword, username } = req.body;

    const existingUser = await userInfoModel.findOne({ username });
    if (!existingUser) return res.status(404).send({ message: "User not found" });

    const verifyCode = await forgotPasswordCodesModel.findOne({ code, username });
    if (!verifyCode) return res.status(400).send({ message: "Invalid code" });

    const hashedPassword = await argon2.hash(newPassword);
    await userInfoModel.updateOne({ username }, { password: hashedPassword });

    // Clean up used code
    await forgotPasswordCodesModel.deleteOne({ _id: verifyCode._id });

    return res.status(200).send({ message: "Password updated successfully", stat: true });
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: "Internal server error", stat: false });
  }
};

// ─── Set recovery email ───────────────────────────────────────────────────────

const setRecoveryEmail = async (req, res) => {
  const { username, recoveryEmail } = req.body;
  if (!username || !recoveryEmail) {
    return res.status(400).send({ message: "username and recoveryEmail required" });
  }
  if (!req.user || req.user.username !== username) {
    return res.status(403).send({ message: "Forbidden: You can only set your own recovery email" });
  }
  try {
    const user = await userInfoModel.findOneAndUpdate(
      { username },
      { recoveryEmail },
      { new: true }
    );
    if (!user) return res.status(404).send({ message: "User not found" });
    res.status(200).send({ message: "Recovery email set", stat: true });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── GET /user/:username/profile ──────────────────────────────────────────────

const getUserProfile = async (req, res) => {
  try {
    const { username } = req.params;
    const user = await userInfoModel.findOne({ username });
    if (!user) return res.status(404).send({ message: "User not found", stat: false });

    res.status(200).send({
      username: user.username,
      profileImage: user.profileImage || null,
      bio: user.bio || null,
      acceptMessages: user.acceptMessages,
      allowAnonymousChat: user.allowAnonymousChat,
      isOnline: user.isOnline,
      lastSeen: user.lastSeen,
    });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /user/update-settings ───────────────────────────────────────────────

const updateSettings = async (req, res) => {
  try {
    const { username } = req.user;
    const { bio, allowAnonymousChat, acceptMessages, profileImage } = req.body;

    const update = {};
    if (bio !== undefined) update.bio = bio.slice(0, 160);
    if (allowAnonymousChat !== undefined) update.allowAnonymousChat = allowAnonymousChat;
    if (acceptMessages !== undefined) update.acceptMessages = acceptMessages;

    if (profileImage && profileImage.startsWith("data:")) {
      const url = await uploadToCloudinary(profileImage);
      if (url) update.profileImage = url;
    }

    await userInfoModel.findOneAndUpdate({ username }, update, { new: true });
    res.status(200).send({ stat: true, message: "Settings updated" });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── POST /message/mark-read ──────────────────────────────────────────────────

const markMessagesRead = async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).send({ message: "messageIds array required", stat: false });
    }
    const { username } = req.user;
    await messagesModel.updateMany(
      { _id: { $in: messageIds }, username },
      { read: true, readAt: new Date() }
    );
    res.status(200).send({ stat: true });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

// ─── DELETE /message/:id ──────────────────────────────────────────────────────

const deleteMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.user;
    const result = await messagesModel.findOneAndDelete({ _id: id, username });
    if (!result) return res.status(404).send({ message: "Message not found", stat: false });
    res.status(200).send({ stat: true });
  } catch (err) {
    res.status(500).send({ message: err.message, stat: false });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  create,
  login,
  sendForgotPasswordMail,
  resetPassword,
  setRecoveryEmail,
  authenticate,
  getUserProfile,
  updateSettings,
  markMessagesRead,
  deleteMessage,
};
