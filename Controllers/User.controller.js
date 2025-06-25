const { userInfoModel } = require("../Models/User.model");
const { messagesModel } = require("../Models/Messages.model");
const bcryptjs = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
const MailerService = require("../Services/Mailer.Services");
const { generateForgotPasswordCode } = require("../Utils/CodeGenerator.utils");
const {
  forgotPasswordCodesModel,
} = require("../Models/ForgotPasswordCodes.model");
const argon2 = require("argon2");
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const mailerService = new MailerService();

const create = async (request, response) => {
  const username = request.body.username;
  const password = request.body.password;
  const recoveryEmail = request.body.recoveryEmail;

  try {
    const existingUser = await userInfoModel.findOne({ username });
    if (existingUser) {
      console.log("username not available");
      return response
        .status(200)
        .send({ message: "username not available", stat: false });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET);
    console.log("new user added", token);

    const hashedPassword = await argon2.hash(password);

    const userPayload = {
      username,
      password: hashedPassword,
      recoveryEmail,
    };

    const form = new userInfoModel(userPayload);
    const result = await form.save();

    console.log(result);
    response
      .status(200)
      .send({ message: "created successfully", token, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send({ stat: false, message: err.message });
  }
};

// Set or update recovery email
const setRecoveryEmail = async (req, res) => {
  const { username, recoveryEmail } = req.body;
  if (!username || !recoveryEmail) {
    return res.status(400).send({ message: "username and recoveryEmail required" });
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

const login = async (request, response) => {
  const { username, password } = request.body;

  try {
    const user = await userInfoModel.findOne({ username });
    if (!user) {
      return response
        .status(200)
        .send({ message: "user not found", stat: false });
    }

    const passwordMatch = await argon2.verify(user.password, password);
    if (!passwordMatch) {
      return response
        .status(200)
        .send({ message: "incorrect password", stat: false });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET);
    console.log("logged in", token);

    response.status(200).send({ message: "logged in", token, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send({ stat: false, message: err.message });
  }
};

const getMessages = async (request, response) => {
  const token = request.body.token;
  const user = jwt.decode(token);

  if (!user) {
    return response.status(400).send("session expired, login again");
  }

  const username = user.username;
  console.log(username);

  try {
    const messages = await messagesModel.find({ username });
    if (messages.length === 0) {
      return response
        .status(200)
        .send({ message: "nothing", stat: true, username });
    }

    console.log(messages);
    response.status(200).send({ message: messages, username, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send("An error occurred");
  }
};

const sendMessage = async (request, response) => {
  const { img, message, username, time } = request.body;

  try {
    let imageURL = null;
    if (img) {
      const uploadResult = await cloudinary.uploader.upload(img);
      imageURL = uploadResult.secure_url;
    }

    const userExists = await userInfoModel.findOne({ username });
    if (!userExists) {
      return response
        .status(200)
        .send({ message: "user not found", stat: false });
    }

    const newMessage = new messagesModel({
      message,
      username,
      imageURL,
      time,
    });

    const result = await newMessage.save();
    console.log(result);

    response.status(200).send({ stat: true, message: "Sent" });
  } catch (err) {
    console.log(err.message);
    response.status(400).send({ status: false, message: err.message });
  }
};

const sendForgotPasswordMail = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).send({ message: "username required" });
    const existingUser = await userInfoModel.findOne({ username });
    if (!existingUser)
      return res.status(404).send({ message: "User not found" });

    // Use recoveryEmail if set, else error
    const email = existingUser.recoveryEmail;
    if (!email) return res.status(400).send({ message: "No recovery email set for this user" });

    const code = generateForgotPasswordCode();
    const existingCode = await forgotPasswordCodesModel.findOne({
      email,
      username,
    });
    if (existingCode) return res.status(400).send({ message: "Code already sent" });

    const newUserCode = {
      email,
      username,
      code,
    };

    const createUserCode = await forgotPasswordCodesModel.create(newUserCode);
    if (!createUserCode)
      return res
        .status(500)
        .send({ message: "An error occurred. Try again later" });

    try {
      const sendMail = await mailerService.sendForgotPasswordMail(
        email,
        code,
        username
      );
      if (!sendMail)
        return res
          .status(500)
          .send({ message: "An error occurred. Try again later" });
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

const resetPassword = async (req, res) => {
  try {
    const { code, newPassword, username } = req.body;

    const existingUser = await userInfoModel.findOne({ username });
    if (!existingUser) return res.status(404).send({ message: "User not found" });

    const verifyCode = await forgotPasswordCodesModel.findOne({
      code,
      username,
    });
    if (!verifyCode) return res.status(400).send({ message: "Invalid code" });

    const hashedPassword = await argon2.hash(newPassword);
    const updatePassword = await userInfoModel.updateOne(
      { username },
      { password: hashedPassword }
    );
    return res.status(200).send({ message: "Password updated successfully", stat:true });
  } catch (error) {
    console.log(err.message);
    response.status(500).send({ message: "Internal server error", stat:false });
  }
};

//

module.exports = {
  getMessages,
  sendMessage,
  create,
  login,
  sendForgotPasswordMail,
  resetPassword,
  setRecoveryEmail
};
