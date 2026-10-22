# Deploying the API on Render (free tier)

## Why it "dies down"

Render's free web services spin down after **15 minutes without inbound
traffic**. The process is stopped, not crashed. The next request pays a cold
start (roughly 30-60 s), and anything in memory is gone: Socket.IO rooms,
timers, the Mongoose connection.

The process cannot wake itself. Once it is stopped there is no code running to
send a request, so an in-app `setInterval` keep-alive does nothing. The ping has
to come from outside.

## The workaround: an external pinger

One request every 5-10 minutes is enough to keep the instance up permanently.

### Option A - uptime monitor (most reliable)

1. Deploy the service (see below) and note the URL, e.g.
   `https://wispa-api.onrender.com`.
2. Create a free monitor at UptimeRobot or cron-job.org:
   - URL: `https://wispa-api.onrender.com/health`
   - Interval: 5 minutes
   - Timeout: 60 s (cold starts are slow)
   - Alert only after the second consecutive failure, so a slow cold start does
     not page you.
3. Confirm `/health` returns `200` with `{"ok":true,...}`.

### Option B - GitHub Actions

`.github/workflows/keepalive.yml` is included. Set a repository variable
`WISPA_HEALTH_URL` to the full health URL (Settings > Secrets and variables >
Actions > Variables). It runs every 10 minutes and retries three times.

Limits: GitHub's scheduler often runs 5-15 minutes late, which is uncomfortably
close to Render's 15-minute window, and scheduled workflows stop after 60 days
of repo inactivity. Treat this as a backup to Option A, not a replacement. It
also bills Actions minutes: a private repo at 144 runs/day can exceed the free
2,000 minutes/month, while public repos are free.

## Free-tier math

Render gives 750 instance-hours per month. One service kept awake 24/7 uses
about 730. That leaves essentially nothing, so:

- keep exactly one free web service running;
- expect a suspension at month end if you deploy extra free services;
- if you need more, upgrade that one service to Starter instead of adding
  services.

## Deploy steps

1. Push the repo (with `render.yaml`) to GitHub.
2. Render > New > Blueprint, select the repo. `render.yaml` sets:
   - build `npm ci`, start `node index.js`
   - health check path `/health`
   - Node 22
3. Fill the secret env vars in the dashboard: `URI`, `JWT_SECRET`, `EMAIL`,
   `PASSWORD`, `CLOUD_NAME`, `API_KEY`, `API_SECRET`.
4. **Fix the Atlas allowlist.** In Atlas > Network Access add `0.0.0.0/0`
   (or the fixed egress IPs on a paid Render plan). Until this is done every
   connection fails with `MongoServerSelectionError` no matter how many times
   `index.js` retries.
5. Point the frontend at Render: set `API` in `src/lib/api.js` to the Render
   URL. `src/lib/socket.js` reuses that constant, so sockets follow
   automatically.

## What a spin-down costs you

- First request after idling takes 30-60 s. The frontend already renders
  loading states, so it looks slow rather than broken.
- Socket.IO clients disconnect and reconnect. Presence flags can go stale
  (`isOnline`) until the next connect/disconnect event; a connected socket
  counts as traffic, so an open app keeps the service awake by itself.
- The Mongo connection is re-established by the retry loop in `index.js`, so no
  code change is needed.

## If you would rather not keep it awake

Move the API to an always-on host (Render Starter at ~$7/month, Railway, Fly)
or split the realtime layer out. Cold starts are only fixable by paying for a
plan that does not idle, or by keeping traffic flowing as above.
