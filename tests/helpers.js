/**
 * Shared test helpers.
 */
const jwt = require("jsonwebtoken");

// Ensure a stable secret for all tests
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Sign a JWT directly (used by mock model factories to return tokens
 * without going through bcrypt/argon2 hashing).
 */
const signToken = (username) => jwt.sign({ username }, JWT_SECRET);

/**
 * Return a Bearer auth header object for supertest.
 */
const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

module.exports = { signToken, authHeader };
