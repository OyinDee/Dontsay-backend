const mongoose = require("mongoose");
const userInfoSchema = mongoose.Schema({
    username:           { type: String, required: true, unique: true },
    password:           { type: String, required: true },
    recoveryEmail:      { type: String, default: null },
    profileImage:       { type: String, default: null },   // Cloudinary URL
    bio:                { type: String, default: '' },
    allowAnonymousChat: { type: Boolean, default: false }, // opt-in to receive anon messages
    acceptMessages:     { type: Boolean, default: true },  // global message toggle
    isOnline:           { type: Boolean, default: false },
    lastSeen:           { type: Date, default: null },
}, { timestamps: true });

const userInfoModel = mongoose.model("user", userInfoSchema);
module.exports = { userInfoModel };