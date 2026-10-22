# Deploying the API on Render (free tier)

## Why it "dies down"

Render's free web services stop after **15 minutes without inbound traffic**.
The process is stopped, not crashed. The next request pays a cold start (roughly
30-60 s), and anything in memory is gone: Socket.IO rooms, timers, the Mongoose
connection.

## Two-layer keep-alive

**Layer 1 - the app pings itself.** Render exposes `RENDER_EXTERNAL_URL` to every
web service, and `index.js` uses it to call `GET /health` every 10 minutes. That
request leaves the container, passes through Render's proxy and comes back in,
so it counts as inbound traffic and resets the idle timer. Set
`KEEPALIVE_INTERVAL_MS` to change the interval (default 600000).

Two things this cannot do:

- It cannot wake a stopped process. Once Render stops the service, no code is
  running, so nothing sends the ping. The service stays down until a real
  request arrives. That is what layer 2 is for.
- A request to `127.0.0.1` does not count. Render measures traffic at its proxy,
  so the ping must use the public URL. `RENDER_EXTERNAL_URL` is exactly that.

**Layer 2 - an external monitor as the recovery net.** If the service restarts
(deploy, crash, OOM) or ever does idle out, an outside request is the only thing
that brings it back. Set up a free UptimeRobot or cron-job.org monitor:

- URL: `https://<your-service>.onrender.com/health`
- Interval: 5 minutes
- Timeout: 60 s (cold starts are slow)
- Alert after 2 consecutive failures, so one slow start does not page you

## Optional: GitHub Actions pinger

`.github/workflows/keepalive.yml` runs every 10 minutes and retries three times.
Set a repository variable `WISPA_HEALTH_URL` to the full health URL (Settings >
Secrets and variables > Actions > Variables).

Limits: GitHub's scheduler often runs 5-15 minutes late, uncomfortably close to
Render's 15-minute window, and scheduled workflows stop after 60 days of repo
inactivity. Keep layer 1 and layer 2 in place; treat this as a third line.

## Free-tier math

Render gives 750 instance-hours per month. One service kept awake 24/7 uses
about 730. So keep exactly one free web service running and expect a suspension
near month end if you add more.

## Deploy steps

1. Push the repo (with `render.yaml`) to GitHub.
2. Render > New > Blueprint, select the repo. `render.yaml` sets build
   `npm ci`, start `node index.js`, health check `/health`, Node 22.
3. Fill the secret env vars in the dashboard: `URI`, `JWT_SECRET`, `EMAIL`,
   `PASSWORD`, `CLOUD_NAME`, `API_KEY`, `API_SECRET`.
4. **Fix the Atlas allowlist.** In Atlas > Network Access add `0.0.0.0/0`
   (or the fixed egress IPs on a paid Render plan). Until then every connection
   fails with `MongoServerSelectionError` no matter how many times `index.js`
   retries.
5. Point the frontend at Render: set `API` in `src/lib/api.js` to the Render
   URL. `src/lib/socket.js` reuses that constant, so sockets follow
   automatically.

## What a spin-down costs you

- First request after idling takes 30-60 s. The frontend already renders
  loading states, so it looks slow rather than broken.
- Socket.IO clients disconnect and reconnect. Presence flags can go stale
  (`isOnline`) until the next connect/disconnect event. A connected socket
  counts as traffic, so an open app keeps the service awake by itself.
- The Mongo connection is re-established by the retry loop in `index.js`, so no
  code change is needed.

## If you would rather not keep it awake

Move the API to an always-on host (Render Starter at about $7/month, Railway,
Fly), or split the realtime layer out. Cold starts only go away by paying for a
plan that does not idle, or by keeping traffic flowing as above.
