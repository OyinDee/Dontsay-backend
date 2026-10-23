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
    content: {
        type: String,
        default: "",
        validate: {
            validator: function (content) {
                return Boolean(
                    (typeof content === "string" && content.trim()) ||
                    this.imageURL ||
                    this.voiceURL
                );
            },
            message: "An anonymous message must include text, an image, or a voice note",
        },
    },
    title:      { type: String, default: null },
    imageURL:   { type: String, default: null },
    voiceURL:   { type: String, default: null },
    voiceDuration: { type: Number, default: null, min: 0, max: 120 },
    read:       { type: Boolean, default: false },
    readAt:     { type: Date, default: null },
    expiresAt:  { type: Date, default: null },       // TTL — null means never expires
}, { timestamps: true });

// Sparse TTL index — same pattern as regular messages
anonMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

const anonMessageModel = mongoose.model("anonmessage", anonMessageSchema);
module.exports = { anonMessageModel };
