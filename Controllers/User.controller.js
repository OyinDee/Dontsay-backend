const { userInfoModel } = require("../Models/User.model");
const { messagesModel } = require("../Models/Messages.model");
const bcryptjs = require("bcryptjs");
const cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});



const create = async (request, response) => {
  const username = request.body.username;

  try {
    const existingUser = await userInfoModel.findOne({ username });
    if (existingUser) {
      console.log("username not available");
      return response.status(200).send({ message: "username not available", stat: false });
    }

    const token = jwt.sign({ username }, process.env.JWT_SECRET);
    console.log("new user added", token);

    const form = new userInfoModel(request.body);
    const result = await form.save();

    console.log(result);
    response.status(200).send({ message: "created successfully", token, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send({ stat: false, message: err.message });
  }
};

const login = async (request, response) => {
  const { username, password } = request.body;

  try {
    const user = await userInfoModel.findOne({ username });
    if (!user) {
      return response.status(200).send({ message: "user not found", stat: false });
    }

    const passwordMatch = password === user.password;
    if (!passwordMatch) {
      return response.status(200).send({ message: "incorrect password", stat: false });
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
      return response.status(200).send({ message: "nothing", stat: true, username });
    }

    console.log(messages);
    response.status(200).send({ message: messages, username, stat: true });
  } catch (err) {
    console.log(err.message);
    response.status(500).send("An error occurred");
  }
};

const sendMessage = async (request, response) => {
  const { img, message, username } = request.body;

  try {
    let imageURL = null;
    if (img) {
      const uploadResult = await cloudinary.uploader.upload(img);
      imageURL = uploadResult.secure_url;
    }

    const userExists = await userInfoModel.findOne({ username });
    if (!userExists) {
      return response.status(200).send({ message: "user not found", stat: false });
    }

    const newMessage = new messagesModel({
      message,
      username,
      imageURL,
    });

    const result = await newMessage.save();
    console.log(result);

    response.status(200).send({ stat: true, message: "Sent" });
  } catch (err) {
    console.log(err.message);
    response.status(400).send({ status: false, message: err.message });
  }
};

module.exports = { getMessages, sendMessage, create, login };
