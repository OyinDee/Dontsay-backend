const mongoose = require("mongoose");

/**
 * Individual message within an AnonThread.
 * senderRole: "sender"    → sent by the anonymous sender toward the recipient
 * senderRole: "recipient" → the recipient replying back
 */
const anonMessageSchema = new mongoose.Schema({
    threadId:   { type: mongoose.Schema.Types.ObjectId, ref: "anonthread", required: true },
    fromAlias:  { type: String, required: true },   // alias shown to the other party
    senderRole: { type: String, enum: ["sender", "recipient"], required: true },
    content:    { type: String, required: true },
    title:      { type: String, default: null },
    imageURL:   { type: String, default: null },
    read:       { type: Boolean, default: false },
    readAt:     { type: Date, default: null },
    expiresAt:  { type: Date, default: null },       // TTL — null means never expires
}, { timestamps: true });

// Sparse TTL index — same pattern as regular messages
anonMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

const anonMessageModel = mongoose.model("anonmessage", anonMessageSchema);
module.exports = { anonMessageModel };
