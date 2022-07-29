const mongoose = require("mongoose");
const userInfoSchema = mongoose.Schema({
    email: String,
    username: String,
    phoneNumber: String,
    password:String
});
const userInfoModel = mongoose.model("user", userInfoSchema);
module.exports={userInfoModel};