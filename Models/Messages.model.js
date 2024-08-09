const mongoose = require("mongoose");
const messagesSchema = mongoose.Schema({
    message: {type: String, required: true},
    username: {type: String, required: true},
    imageURL: String,
    time: String
});
const messagesModel = mongoose.model("messages", messagesSchema);
module.exports={messagesModel};
