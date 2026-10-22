# Wispa Backend — What the Frontend Expects

The frontend is fully built. Your job is to make the backend match it.
Read every existing file in this repo first, then update and extend it so
every call the frontend makes succeeds. Do not change anything the frontend
already sends or receives — only add to it.

---

## Base URL

Everything points at:  https://wispain.vercel.app

Auth is sent as a Bearer token on every authenticated call:
  Authorization: Bearer <JWT>

The existing POST /get still sends { token } in the body — keep that working too.

---

## 1. Existing endpoints — changes needed

### POST /send

The frontend now sends extra optional fields alongside the existing ones:

  {
    "username":  "oyindee",
    "message":   "...",
    "img":       "<base64 or null>",
    "time":      "2026-10-22T08:00:00Z",
    "title":     "optional title string",
    "expiresIn": 3600,
    "bccEmail":  "sender@example.com"
  }

title
  Store it on the message. Return it when fetching messages.

expiresIn
  Number of seconds until the message auto-deletes.
  If provided, store an expiresAt timestamp and ensure the message is removed
  after that duration. Return expiresAt (ISO string) on the message object.

bccEmail
  Only relevant when the recipient has allowAnonymousChat = true.
  If they do and a bccEmail is provided:
    - Create an anonymous thread (see section 4 below).
    - Return threadId in the response:
        { "stat": true, "message": "Sent", "threadId": "abc123" }
  If allowAnonymousChat is off or no bccEmail was given, ignore it.

acceptMessages guard
  If the recipient has acceptMessages = false, reject:
    { "stat": false, "message": "This user isn't accepting messages right now." }


### POST /get

No changes to what the frontend sends. Add these fields to each message object:

  {
    "_id":       "...",
    "message":   "...",
    "title":     "optional string or null",
    "imageURL":  "...",
    "time":      "...",
    "expiresAt": "ISO string or null",
    "read":      false
  }

Also add a top-level settings object:

  {
    "username": "oyindee",
    "stat":     true,
    "message":  [...],
    "settings": {
      "profileImage":      "https://... or null",
      "bio":               "string or null",
      "allowAnonymousChat": false,
      "acceptMessages":    true,
      "isOnline":          true,
      "lastSeen":          "ISO string"
    }
  }

---

## 2. New endpoints

### GET /user/:username/profile
No auth required. Called by the send page before showing the form.

Response:
  {
    "username":           "oyindee",
    "profileImage":       "https://... or null",
    "bio":                "string or null",
    "acceptMessages":     true,
    "allowAnonymousChat": false,
    "isOnline":           false,
    "lastSeen":           "ISO string"
  }


### POST /user/update-settings
Auth required. Called when user saves the Settings tab.

Body (all fields optional):
  {
    "bio":                "up to 160 chars",
    "allowAnonymousChat": true,
    "acceptMessages":     true,
    "profileImage":       "<base64 data URI — only if changed>"
  }

If profileImage is a base64 data URI, upload it to Cloudinary and store the URL.
Response: { "stat": true, "message": "Settings updated" }


### GET /anon/threads
Auth required. Called when the user opens the Anon Chat tab.

Response:
  {
    "threads": [
      {
        "_id":         "abc123",
        "senderAlias": "Ghost#4821",
        "status":      "active",
        "unreadCount": 2,
        "lastMessage": {
          "content":   "hey",
          "createdAt": "..."
        }
      }
    ]
  }

Return threads where the logged-in user is the recipient OR the sender
(once they've claimed the thread).
status is one of: "pending_sender_account" | "active" | "closed"


### GET /anon/thread/:threadId
Auth required. Called when the user taps a thread.

Response:
  {
    "thread": {
      "_id":               "abc123",
      "senderAlias":       "Ghost#4821",
      "status":            "active",
      "recipientUsername": "oyindee"
    },
    "messages": [
      {
        "_id":        "...",
        "senderRole": "sender",
        "content":    "...",
        "title":      "optional or null",
        "imageURL":   null,
        "read":       true,
        "expiresAt":  null,
        "createdAt":  "..."
      }
    ]
  }


### POST /anon/reply
Auth required — recipient only.

Body:
  {
    "threadId":  "abc123",
    "content":   "thanks for the message",
    "title":     "optional",
    "expiresIn": null
  }

Save the message with senderRole: "recipient".
Push new_anon_message socket event to the sender's room.
Response: { "stat": true }


### POST /anon/send
Auth required — sender only (after claiming thread).

Body:
  {
    "threadId":  "abc123",
    "content":   "one more thing",
    "title":     "optional",
    "expiresIn": 86400
  }

Save the message with senderRole: "sender".
Push new_anon_message socket event to the recipient's room.
Response: { "stat": true }


### POST /anon/claim-thread
Auth required. Called when a sender creates an account and wants to link to their thread.

Body:
  { "threadId": "abc123" }

The JWT identifies the user. Link their account to the thread.
Set thread status to "active".
Response: { "stat": true, "message": "Thread claimed" }


### POST /message/mark-read
Auth required. Called when messages are viewed.

Body:
  { "messageIds": ["id1", "id2"] }

Mark those messages as read.
Response: { "stat": true }


### DELETE /message/:id
Auth required. Deletes a message from the inbox (recipient only).
Response: { "stat": true }

---

## 3. Real-time — Socket.IO

Add Socket.IO to the Express server. The frontend connects automatically on login.

Connection flow:
  1. Client connects.
  2. Client emits  authenticate  with { token: "<JWT>" }.
  3. Server verifies JWT, joins socket to a room named after the username,
     marks user isOnline = true, updates lastSeen.
  4. On disconnect: isOnline = false, lastSeen = now, broadcast presence event.

Events the frontend LISTENS for:

  new_wispa           — message object (same shape as /get)
                        Emit when a new wispa arrives for this user via POST /send.

  new_anon_message    — { threadId, message }
                        Emit when a new anon thread message lands for this user.

  typing              — { threadId, alias }
                        Forwarded from sender when they emit the typing event.

  message_expired     — { messageId }
                        Emit when a timed message is deleted (TTL fired).

  presence            — { username, isOnline, lastSeen }
                        Emit when any user's online status changes.

Events the frontend EMITS:

  authenticate        — { token }
                        Verify JWT, join room, mark online.

  typing              — { threadId }
                        Forward to the other participant in the thread.

---

## 4. Anonymous threads — the concept

When POST /send receives a bccEmail and the recipient has allowAnonymousChat on:

  1. Generate a random alias e.g. "Ghost#4821".
  2. Create a thread record storing:
       - recipientUsername
       - senderAlias
       - senderBccEmail
       - status: "pending_sender_account"
  3. Return threadId in the /send response.
  4. Email the bccEmail address: tell them their message was delivered and that
     creating a Wispa account lets them receive the reply anonymously.
     Include the threadId so they can call /anon/claim-thread after signing up.

The inbox owner sees the thread in their Anon Chat tab.
They only ever see the alias — never the real email or identity.

Once the sender creates an account they call POST /anon/claim-thread to link
their account to the thread. After that both sides can message via
/anon/reply and /anon/send.

---

## 5. User fields to add

The existing user record needs these additional fields (defaults shown):

  profileImage        String (Cloudinary URL)   — default null
  bio                 String max 160 chars       — default null
  allowAnonymousChat  Boolean                    — default false
  acceptMessages      Boolean                    — default true
  lastSeen            Date                       — default now
  isOnline            Boolean                    — default false

---

## 6. Message fields to add

The existing message record needs:

  title      String optional
  expiresAt  Date or null — messages should auto-delete when reached
  read       Boolean      — default false

---

## 7. What must NOT break

  POST /user/create
  POST /user/login
  POST /user/forgot-password
  POST /user/reset-password
  POST /user/set-recovery-email
  POST /get  (body-based token still works)
  Cloudinary config (already in place — reuse for profile images)
  MailerService (already in place — reuse for bccEmail notification)
  vercel.json
