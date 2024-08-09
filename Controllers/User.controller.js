const { userInfoModel } = require("../Models/User.model");
const { messagesModel } = require("../Models/Messages.model");
const bcryptjs = require("bcryptjs");
var cloudinary = require("cloudinary").v2;
const jwt = require("jsonwebtoken");
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const create = (request, response) => {
  const username = request.body.username;

  userInfoModel
    .find({ username: username })
    .then((result) => {
      if (result.length !== 0) {
        console.log(result);
        console.log("username not available");
        response.status(200).send({ message: "username not available", stat: false });
      } else {
        jwt.sign({ username }, process.env.JWT_SECRET, (err, token) => {
          if (err) {
            console.log(err.message);
            response.status(500).send({ stat: false, message: err.message });
          } else {
            console.log(token);
            console.log("new user added");

            const form = new userInfoModel(request.body);
            form.save()
              .then((result) => {
                response.status(200).send({ message: "created successfully", token, stat: true });
                console.log(result);
              })
              .catch((err) => {
                response.status(200).send({ stat: false, message: err.message });
              });
          }
        });
      }
    })
    .catch((err) => {
      console.log(err.message);
      response.status(500).send({ stat: false, message: err.message });
    });
};

const login = (request, response) => {
  const username = request.body.username;

  userInfoModel
    .findOne({ username: username })
    .then((result) => {
      if (result) {
        if (request.body.password === result.password) {
          console.log(result);
          console.log("yes");

          jwt.sign({ username }, process.env.JWT_SECRET, (err, token) => {
            if (err) {
              console.log(err.message);
              response.status(500).send({ stat: false, message: err.message });
            } else {
              console.log(token);
              response.status(200).send({ message: "logged in", token, stat: true });
            }
          });
        } else {
          console.log(result);
          console.log("no");
          response.status(200).send({ message: "incorrect password", stat: false });
        }
      } else {
        response.status(200).send({ message: "user not found", stat: false });
      }
    })
    .catch((err) => {
      console.log(err.message);
      response.status(500).send({ stat: false, message: err.message });
    });
};

const getMessages = (request, response) => {
  console.log(request.body.token);
  const user = jwt.decode(request.body.token);

  if (user) {
    const username = user.username;
    console.log(username);

    messagesModel
      .find({ username: username })
      .then((result) => {
        if (result.length === 0) {
          console.log("nothing");
          response.status(200).send({ message: "nothing", stat: true, username: username });
        } else {
          console.log(result);
          response.status(200).send({ message: result, username: username, stat: true });
        }
      })
      .catch((err) => {
        console.log(err.message);
        response.status(500).send("An error occurred");
      });
  } else {
    console.log("error");
    response.status(400).send("session expired, login again");
  }
};

const sendMessage = (request, response) => {
  if (request.body.img) {
    cloudinary.uploader
      .upload(`${request.body.img}`)
      .then((result) => {
        const everything = {
          message: request.body.message,
          username: request.body.username,
          imageURL: result.secure_url,
        };

        const form = new messagesModel(everything);

        userInfoModel
          .findOne({ username: request.body.username })
          .then((result) => {
            if (result) {
              form.save()
                .then((result) => {
                  response.status(200).send({ stat: true, message: "Sent" });
                  console.log(result);
                })
                .catch((err) => {
                  console.log(err.message);
                  response.status(400).send({ status: false, message: err.message });
                });
            } else {
              response.status(200).send({ message: "user not found", stat: false });
            }
          })
          .catch((err) => {
            console.log(err.message);
            response.status(500).send({ stat: false, message: err.message });
          });
      })
      .catch((err) => {
        console.log(err.message);
        response.status(400).send({ message: "error", stat: false });
      });
  } else {
    userInfoModel
      .findOne({ username: request.body.username })
      .then((result) => {
        console.log("got it");

        if (result) {
          console.log("searching...");

          const form = new messagesModel(request.body);
          form.save()
            .then((result) => {
              response.status(200).send({ stat: true, message: "Sent" });
              console.log(result);
            })
            .catch((err) => {
              console.log(err.message);
              response.status(400).send({ status: false, message: err.message });
            });
        } else {
          response.status(200).send({ stat: false, message: "user not found" });
        }
      })
      .catch((err) => {
        console.log(err.message);
        response.status(500).send({ stat: false, message: err.message });
      });
  }
};

module.exports = { getMessages, sendMessage, create, login };
