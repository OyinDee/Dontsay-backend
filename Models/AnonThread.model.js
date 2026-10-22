const mongoose = require("mongoose");

/**
 * Represents a single anonymous conversation pair.
 * The recipient only ever sees senderAlias — senderIdentity is never
 * exposed through any API response destined for the recipient.
 */
const anonThreadSchema = new mongoose.Schema({
    recipientUsername: { type: String, required: true },
    senderIdentity:    { type: String, default: null },   // real username, set after claim
    senderAlias:       { type: String, required: true },  // e.g. "SilentFox#4821"
    senderBccEmail:    { type: String, default: null },   // optional — for notifying unclaimed senders
    // legacy field kept for backward compatibility
    bccEmail:          { type: String, default: null },
    claimed:           { type: Boolean, default: false }, // true once sender links account
    claimToken:        { type: String, default: null },   // one-time JWT cleared after claim
    status: {
        type: String,
        enum: ["pending_sender_account", "active", "closed"],
        default: "pending_sender_account",
    },
}, { timestamps: true });

const anonThreadModel = mongoose.model("anonthread", anonThreadSchema);
module.exports = { anonThreadModel };
