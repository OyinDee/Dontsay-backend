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

---

## Notes
- All endpoints expect and return JSON.
- JWT tokens are used for authentication where required.
- Error responses will include a `message` and may include `stat: false`.
