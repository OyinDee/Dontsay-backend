const mongoose = require("mongoose");

const messagesSchema = mongoose.Schema({
    message:   { type: String, required: true },
    username:  { type: String, required: true },  // recipient username
    title:     { type: String, default: '' },      // optional subject line
    imageURL:  { type: String, default: null },
    time:      { type: Date, default: Date.now },
    read:      { type: Boolean, default: false },
    readAt:    { type: Date, default: null },
    expiresAt: { type: Date, default: null },      // TTL — null means never expires
    // Sender's email — kept only so the recipient can reach them if they
    // choose to reply. Never exposed in API responses.
    bccEmail:  { type: String, default: null },
    // Set when the recipient starts an anonymous conversation from this message.
    threadId:  { type: mongoose.Schema.Types.ObjectId, ref: "anonthread", default: null },
}, { timestamps: true });

// Sparse TTL index: MongoDB auto-deletes docs where expiresAt <= now
// sparse: true means docs where expiresAt is null are ignored
messagesSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

const messagesModel = mongoose.model("messages", messagesSchema);
module.exports = { messagesModel };
