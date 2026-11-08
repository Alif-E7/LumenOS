# LumenOS Production Deployment Guide

LumenOS is structured as a streamlined monorepo deployed across two complementary cloud platforms:
- **Frontend**: Hosted on **Vercel** (Global CDN, instant edge routing, React 19 SPA).
- **Backend**: Hosted on **Render** (FastAPI ASGI Web Service with native persistent WebSockets and managed PostgreSQL).

---

## 1. Monorepo Deployment Architecture

```mermaid
flowchart LR
    subgraph Users["End Users / Student Laptops"]
        BROWSER["Web Browser<br/>(Desktop / Mobile)"]
    end

    subgraph Vercel["Vercel Global Edge Network"]
        CDN["Vercel Edge CDN<br/>https://lumenos.vercel.app"]
        SPA["React 19 / Vite SPA Assets<br/>(HTML, CSS, JS, Cesium Workers)"]
    end

    subgraph Render["Render Cloud (Oregon / Frankfurt)"]
        API["FastAPI Web Service<br/>https://lumenos-api.onrender.com"]
        WS["Native WebSocket Server<br/>wss://lumenos-api.onrender.com/api/rooms/ws"]
        PG[(Render Managed PostgreSQL<br/>Career Profiles & Spacecraft)]
    end

    BROWSER -->|HTTPS (Page Load & Assets)| CDN
    CDN --> SPA
    BROWSER -->|REST API Requests (/api/*)| API
    BROWSER <-->|Persistent WebSocket Concurrency| WS
    API <--> PG
```

---

## 2. Infrastructure Configuration Files

### 2.1 Render Blueprint (`render.yaml`)
LumenOS includes a version-controlled Render Blueprint at the repository root ([`render.yaml`](file:///d:/projects/LumenOS/render.yaml)) that automatically configures the Python web service, health checks, and PostgreSQL database:

```yaml
services:
  - type: web
    name: lumenos-api
    runtime: python
    buildCommand: pip install -e ".[dev]"
    startCommand: uvicorn api.main:app --host 0.0.0.0 --port $PORT
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.9
      - key: LUMENOS_DEBUG
        value: "false"
      - key: CORS_ORIGINS
        value: "https://lumenos.vercel.app,http://localhost:5173"
      - key: DATABASE_URL
        fromDatabase:
          name: lumenos-db
          property: connectionString

databases:
  - name: lumenos-db
    databaseName: lumenos
    user: lumenos_user
    plan: free
```

### 2.2 Vercel Configuration (`vercel.json`)
The root [`vercel.json`](file:///d:/projects/LumenOS/vercel.json) specifies the monorepo build command, output directory, and SPA fallback rewrites:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm --prefix apps/web run build",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "https://lumenos-api.onrender.com/api/$1"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

---

## 3. Environment Variables Reference

| Variable Name | Required | Default / Example Value | Platform | Description |
|:---|:---:|:---|:---:|:---|
| `DATABASE_URL` | Optional | `sqlite+aiosqlite:///data/lumenos.db` | Render | Connection string for PostgreSQL in production (automatically injected by Render Database). |
| `CORS_ORIGINS` | Optional | `https://lumenos.vercel.app,http://localhost:5173` | Render | Comma-separated list of allowed web origins for CORS headers. |
| `LUMENOS_DEBUG` | Optional | `false` | Render | Set to `false` in production to disable verbose SQLAlchemy query echoing. |
| `VITE_API_URL` | Optional | `https://lumenos-api.onrender.com` | Vercel | Base URL for FastAPI REST calls. If omitted, relative `/api` paths with Vercel rewrites are used. |
| `VITE_WS_URL` | Optional | `wss://lumenos-api.onrender.com` | Vercel | Base WebSocket URL for real-time multiplayer rooms. |
| `LUMENOS_NASA_FIRMS_KEY` | Optional | `""` | Render | Optional NASA FIRMS API key for live real-time queries. If omitted, bundled offline dataset is used. |

---

## 4. Production Health Checks & Monitoring

1. **REST Health Endpoint**:
   - URL: `GET https://lumenos-api.onrender.com/api/health`
   - Response: `{"status": "ok", "app": "LumenOS", "version": "0.1.0"}`
   - Render's health checker polls this route every 15 seconds to guarantee zero-downtime rolling deploys.
2. **WebSocket Health Endpoint**:
   - URL: `wss://lumenos-api.onrender.com/ws/health`
   - Accepts connection, replies with `{"type": "connected", "status": "ok"}`, responds to `{"type": "ping"}` with `{"type": "pong"}`.
3. **Room Expiration & Memory Management**:
   - `room_manager.cleanup_stale_rooms()` prunes inactive sessions older than 30 minutes.

---

## 5. Rollback Procedures

- **Frontend Rollback (Vercel)**:
  1. Open the **Deployments** tab in the Vercel Dashboard.
  2. Locate the previous stable production deployment.
  3. Click **Instant Rollback** to redirect edge traffic within seconds.
- **Backend Rollback (Render)**:
  1. Navigate to the **Deploys** tab in the Render Dashboard.
  2. Select the previous successful commit deployment.
  3. Click **Rollback to this deploy**.

