const { model, Schema } = require("mongoose");

const forgotPasswordCodesSchema = new Schema({
    email: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    username: {type: String, required: true, unique: true},
    createdAt: { type: Date, default: Date.now, expires: 600 }
}, {timestamps: true});

const forgotPasswordCodesModel = model("forgot_password_codes", forgotPasswordCodesSchema);
module.exports={forgotPasswordCodesModel};