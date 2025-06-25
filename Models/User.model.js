const mongoose = require("mongoose");
const userInfoSchema = mongoose.Schema({
    username: {type: String, required: true},
    password: {type: String, required: true},
    recoveryEmail: {type: String, required: false},
});
const userInfoModel = mongoose.model("user", userInfoSchema);
module.exports={userInfoModel};