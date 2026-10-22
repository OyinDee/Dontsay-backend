require("dotenv").config();
const mongoose = require("mongoose");
const { createApp } = require("./app");

const PORT = process.env.PORT || 3000;

// Retry policy. Keep the whole budget inside a serverless invocation:
// worst case is approx (MAX_ATTEMPTS * SELECTION_TIMEOUT) + sum of delays.
const MAX_ATTEMPTS = Number(process.env.DB_MAX_ATTEMPTS || 3);
const BASE_DELAY_MS = Number(process.env.DB_BASE_DELAY_MS || 250);
const MAX_DELAY_MS = Number(process.env.DB_MAX_DELAY_MS || 5000);
const SELECTION_TIMEOUT_MS = Number(process.env.DB_SELECTION_TIMEOUT_MS || 3000);

// Cached on globalThis so warm serverless invocations reuse one connection
// instead of opening a new pool per invocation.
const cache = (globalThis.__mongoCache ||= { promise: null });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isAuthError = (err) =>
  /authentication|bad auth|credentials/i.test(`${err.name} ${err.message}`);

function backoff(attempt) {
  const base = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  // Jitter keeps parallel cold starts from retrying in lockstep.
  return Math.round(base * (0.75 + Math.random() * 0.5));
}

/**
 * Connect with exponential backoff. Single-flight: concurrent callers share
 * one attempt, so a `disconnected` event can never stack retry loops on top
 * of the startup loop.
 *
 * Resolves true when connected, false when this round gave up. Never throws,
 * so callers decide how to respond.
 */
function connectDb() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(true);
  if (cache.promise) return cache.promise;

  cache.promise = (async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await mongoose.connect(process.env.URI, {
          serverSelectionTimeoutMS: SELECTION_TIMEOUT_MS,
          socketTimeoutMS: 45000,
        });
        console.log(`MONGODB connected (attempt ${attempt})`);
        return true;
      } catch (err) {
        console.error(
          `MongoDB connection error (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`
        );

        // Bad credentials will not fix themselves in a few hundred ms; stop
        // burning the invocation budget.
        if (isAuthError(err)) {
          console.error("Non-retryable MongoDB auth error — check URI and credentials.");
          return false;
        }

        if (attempt === MAX_ATTEMPTS) {
          console.error("Max attempts reached — DB unavailable for this invocation.");
          return false;
        }

        const delay = backoff(attempt);
        console.log(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
    return false;
  })().finally(() => {
    cache.promise = null;
  });

  return cache.promise;
}

// Runtime drops: reconnect, with a capped delay, using the same single-flight
// guard so repeated events cannot spawn parallel loops.
// A *failed* connect() also emits "disconnected", so only treat the event as a
// drop if we were actually connected. Otherwise a dead DB becomes an infinite
// reconnect loop that burns CPU and log quota.
let wasConnected = false;
mongoose.connection.on("connected", () => {
  wasConnected = true;
});
mongoose.connection.on("disconnected", () => {
  if (!wasConnected) return; // startup failures are handled by connectDb()
  wasConnected = false;
  console.warn("MongoDB disconnected — reconnecting...");
  connectDb();
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB runtime error:", err.message);
});

const { app, server } = createApp();

// On Vercel the platform owns the HTTP server; listening there does nothing.
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`app listening on PORT ${PORT}`);
  });
}

// Start the connection in parallel with the first request rather than making
// every cold start wait for Mongo before the function is ready.
connectDb();

module.exports = { app, server, connectDb };
