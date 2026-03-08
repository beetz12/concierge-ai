---
name: railway-deployment
description: Diagnose and fix Railway deployment failures - 502 errors, port mismatches, health checks, database connections
---

# Railway Deployment Debugging Skill

Diagnose and fix Railway deployment failures including 502 errors, port configuration issues, health check failures, and database connection problems.

## When to Use

- Railway deployment shows 502 Bad Gateway errors
- Health checks pass but external traffic fails
- Server starts successfully in logs but requests timeout
- Database connection errors (especially with Neon or Supabase)
- Application works locally but fails on Railway

## Quick Diagnosis

| Error Pattern | Root Cause | Fix |
|---------------|------------|-----|
| 502 + server running on port X | Public networking port mismatch | Change public networking port to match injected PORT |
| 502 + health check passes | Port mismatch between proxy and app | Verify public networking port matches `$PORT` |
| `ECONNREFUSED` to database | Missing compute ID in Neon URL | Add `-pooler` or `.c-XXXXX` to hostname |
| `SCRAM authentication failed` | Wrong database credentials | Check DATABASE_URL in Railway variables |
| Health check timeout | App not binding to 0.0.0.0 | Add `-H 0.0.0.0` or `host: '0.0.0.0'` |
| `NODE_ENV: development` in prod | ENV set after build | Set `ENV NODE_ENV=production` before build step |

---

## Issue #1: Public Networking Port Mismatch (Most Common 502 Cause)

**Error:** 502 Bad Gateway, but logs show server running correctly and health checks passing

**Symptoms:**
```
🚀 Server ready and listening on port 8080
[Health] /healthz endpoint hit  ← Health check works!
# But external curl returns 502
```

**Cause:** Railway's Public Networking is configured to route traffic to a different port than the app is listening on.

**Diagnosis:**
1. Check Railway logs for actual PORT: `PORT environment variable: 8080`
2. Check Public Networking settings: Dashboard → Service → Settings → Public Networking
3. If these don't match, that's the problem!

**Fix:**
1. Go to Railway Dashboard → Your Service → **Settings**
2. Find **Public Networking** section
3. Change the port to match the PORT shown in logs (e.g., 8080)
4. Save - no redeploy needed!

**Why this happens:** When creating a public domain, you can manually specify a port. If you enter 3000 or 4000 but Railway injects PORT=8080, the proxy sends traffic to the wrong port.

---

## Issue #2: Railway PORT Environment Variable

**Key Concept:** Railway dynamically injects the `PORT` environment variable. Your app MUST listen on this port.

**Correct Pattern:**
```typescript
// Always use process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

**Dockerfile Pattern:**
```dockerfile
# Let Railway inject PORT, provide default for local dev
ENV PORT=3000
EXPOSE 3000

# Use shell form to expand $PORT
CMD ["sh", "-c", "node server.js"]
# OR for frameworks with port flags
CMD ["sh", "-c", "npx motia start -p $PORT -H 0.0.0.0"]
```

**Warning:** Don't hardcode ports! Railway's injected PORT can be any value (commonly 8080, 3000, etc.)

---

## Issue #3: Host Binding (0.0.0.0 vs localhost)

**Error:** Health check timeout, connection refused

**Cause:** App binding to `localhost` or `127.0.0.1` instead of `0.0.0.0`

**Fix:**
```typescript
// WRONG - only accessible from within container
server.listen(PORT, 'localhost');
server.listen(PORT, '127.0.0.1');

// CORRECT - accessible from Railway's proxy
server.listen(PORT, '0.0.0.0');
```

**Framework-specific:**
```bash
# Motia
npx motia start -p $PORT -H 0.0.0.0

# Next.js
next start -p $PORT -H 0.0.0.0

# Express (in code)
app.listen(PORT, '0.0.0.0')
```

---

## Issue #4: Neon PostgreSQL Connection Errors

**Error:** `ECONNREFUSED`, `connection terminated unexpectedly`, or `SCRAM authentication failed`

**Cause:** Neon requires specific hostname format with compute ID.

**Fix - Ensure DATABASE_URL includes compute ID:**
```
# WRONG - missing compute endpoint
postgresql://user:pass@ep-cool-name.us-east-2.aws.neon.tech/db

# CORRECT - with compute ID segment
postgresql://user:pass@ep-cool-name.c-XXXXX.us-east-2.aws.neon.tech/db

# For pooled connections (recommended for serverless)
postgresql://user:pass@ep-cool-name-pooler.us-east-2.aws.neon.tech/db?sslmode=require
```

**Find your compute ID:** Neon Dashboard → Connection Details → Copy the full connection string

---

## Issue #5: Health Check Configuration

**railway.json pattern:**
```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

**Implement a failsafe health endpoint:**
```typescript
// Register EARLY in your app initialization
app.get('/healthz', (_req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      port: process.env.PORT
    });
  } catch (error) {
    // Still return 200 for Railway
    res.status(200).send('OK');
  }
});
```

---

## Issue #6: NODE_ENV Not Set Correctly

**Error:** Logs show `NODE_ENV: development` despite Dockerfile setting production

**Cause:** ENV set after build step, so build-time code sees wrong value

**Fix - Set ENV before build:**
```dockerfile
# Set environment BEFORE build
ENV NODE_ENV=production
ENV PORT=3000

# Now build (will see NODE_ENV=production)
RUN npm run build

# Then start
CMD ["npm", "start"]
```

---

## Issue #7: Dockerfile vs railway.json Confusion

**What's used when:**
- `railway.json` **build section**: Used even with Dockerfile builder for watchPatterns
- `railway.json` **deploy section**: Always used (healthcheckPath, restartPolicy)
- `railway.json` **startCommand**: IGNORED when using Dockerfile (CMD in Dockerfile wins)
- **Dockerfile**: Build and runtime commands

**Correct railway.json for Dockerfile projects:**
```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile",
    "watchPatterns": ["src/**", "package.json", "Dockerfile"]
  },
  "deploy": {
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 300
  }
}
```

---

## Diagnostic Minimal Server

When debugging, bypass your framework entirely:

**server-test.js:**
```javascript
const http = require('http');
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    message: 'Minimal test server working!',
    port: PORT,
    path: req.url
  }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Minimal server on http://0.0.0.0:${PORT}`);
});
```

**Dockerfile for testing:**
```dockerfile
CMD ["node", "server-test.js"]
```

**Interpretation:**
- If minimal server works → Issue is framework-specific
- If minimal server fails → Issue is Railway networking/port config

---

## Debugging Checklist

### Before Deploying
- [ ] `process.env.PORT` used (not hardcoded port)
- [ ] Server binds to `0.0.0.0` not `localhost`
- [ ] Health endpoint at `/healthz` returns 200
- [ ] DATABASE_URL has correct Neon/Supabase format
- [ ] `NODE_ENV=production` set before build step

### After 502 Error
- [ ] Check logs: What port is server listening on?
- [ ] Check Public Networking: What port is configured?
- [ ] **These must match!**
- [ ] Health check passing in logs?
- [ ] Try minimal test server to isolate issue

### Railway Dashboard Checks
1. **Deployments** → View build logs for errors
2. **Deployments** → View runtime logs for port info
3. **Settings** → Public Networking → Verify port
4. **Variables** → Check DATABASE_URL, PORT (if set)

---

## Common Fixes Summary

| Symptom | First Thing to Check |
|---------|---------------------|
| 502 errors | Public Networking port matches $PORT |
| Health timeout | App binding to 0.0.0.0 |
| DB connection fails | DATABASE_URL format (compute ID) |
| Works locally, fails on Railway | PORT and host binding |
| Dev mode in production | NODE_ENV set before build |
