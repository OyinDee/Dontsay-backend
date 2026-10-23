# API Documentation

## Base URL

All endpoints are relative to your deployed server URL (e.g., `https://your-domain.com/`).

---

## Endpoints

### 1. Create User
- **URL:** `/user/create`
- **Method:** POST
- **Body:**
  - `username` (string, required)
  - `password` (string, required)
- **Response:**
  - `message`: Status message
  - `token`: JWT token (on success)
  - `stat`: Boolean (true if successful)

---

### 2. User Login
- **URL:** `/user/login`
- **Method:** POST
- **Body:**
  - `username` (string, required)
  - `password` (string, required)
- **Response:**
  - `message`: Status message
  - `token`: JWT token (on success)
  - `stat`: Boolean (true if successful)

---

### 3. Get User Messages
- **URL:** `/get`
- **Method:** POST
- **Body:**
  - `token` (string, required; JWT token)
- **Response:**
  - `message`: Array of messages or status
  - `username`: Username
  - `stat`: Boolean

---

### 4. Send Message
- **URL:** `/send`
- **Method:** POST
- **Body:**
  - `img` (string, optional; base64 image)
  - `message` (string, required)
  - `username` (string, required)
  - `time` (string, required)
- **Response:**
  - `stat`: Boolean
  - `message`: Status message

---

### 5. Forgot Password (Send Code)
- **URL:** `/user/forgot-password`
- **Method:** POST
- **Body:**
  - `email` (string, required)
  - `username` (string, required)
- **Response:**
  - `message`: Status message

---

### 6. Reset Password
- **URL:** `/user/reset-password`
- **Method:** POST
- **Body:**
  - `code` (string, required; code sent to email)
  - `newPassword` (string, required)
  - `username` (string, required)
- **Response:**
  - `message`: Status message
  - `stat`: Boolean

### Anonymous Threads

These endpoints require the authenticated user's JWT in the `Authorization`
header.

#### `GET /anon/threads`

Returns the user's threads with an `unreadCount` for each thread.

#### `GET /anon/thread/:threadId`

Returns the thread and its messages. After verifying the caller is a
participant, the endpoint marks unread messages from the other participant as
read, so the unread count is cleared when the thread is next fetched.

#### `POST /anon/claim-thread`

Body:

```json
{
  "threadId": "abc123",
  "token": "claim-link-jwt"
}
```

The Authorization JWT identifies the account. The claim-link token must be
valid, unexpired, match the thread ID, and match the thread's stored one-time
claim token. The token is consumed when the thread is linked to the account.
The account email does not need to match the notification email.
Success response: `{ "stat": true, "message": "Thread claimed" }`.

---

## Notes
- All endpoints expect and return JSON.
- JWT tokens are used for authentication where required.
- Error responses will include a `message` and may include `stat: false`.
