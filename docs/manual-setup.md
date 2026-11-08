# LumenOS Manual Setup & Deployment Guide

This guide details every human step required to run LumenOS locally, execute automated test suites, and deploy to production cloud hosting.

---

## 1. Prerequisites & System Requirements

Ensure the following tools are installed on your host machine:
- **Node.js**: Version `20.x` or `22.x LTS` (includes `npm 10+`)
- **Python**: Version `3.11` to `3.14`
- **Git**: Version `2.30+`
- **Modern Web Browser**: Chrome, Edge, Firefox, or Safari (WebGL support recommended for Cesium 3D view; accessible 2D fallback available automatically).

---

## 2. Local Development Setup (Step-by-Step)

### Step 1: Clone the Repository
```powershell
git clone https://github.com/your-username/LumenOS.git
cd LumenOS
```

### Step 2: Set Up Python Virtual Environment & Dependencies
```powershell
# Create virtual environment
python -m venv .venv

# Activate on Windows:
.\.venv\Scripts\activate

# Activate on macOS/Linux:
# source .venv/bin/activate

# Install backend dependencies in editable development mode:
pip install -e ".[dev]"
```

### Step 3: Install Frontend Dependencies
```powershell
cd apps/web
npm install
cd ../..
```

### Step 4: Run Backend Development Server
Open Terminal 1:
```powershell
.\.venv\Scripts\python.exe -m uvicorn api.main:app --reload --port 8000
```
Verify backend health in your browser at: `http://localhost:8000/api/health`

### Step 5: Run Frontend Development Server
Open Terminal 2:
```powershell
npm --prefix apps/web run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 3. Local Verification & Test Suite Execution

Run all automated test suites to ensure 100% pass rates before deployment:

```powershell
# 1. Run full backend pytest suite (386 tests)
.\.venv\Scripts\python.exe -m pytest

# 2. Run frontend Vitest suite (94 tests)
npm --prefix apps/web test -- --run

# 3. Verify TypeScript types and production bundle build
npm --prefix apps/web run build
```

---

## 4. Production Cloud Deployment (Step-by-Step)

### Step 1: Push Repository to GitHub
Create a private or public GitHub repository and push your verified code:
```powershell
git remote add origin https://github.com/your-username/LumenOS.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy Backend to Render
1. Create a free account at [render.com](https://render.com).
2. Click **New +** $\to$ **Blueprint**.
3. Connect your GitHub repository.
4. Render will detect [`render.yaml`](file:///d:/projects/LumenOS/render.yaml) and automatically configure:
   - **`lumenos-api`** (Python Web Service)
   - **`lumenos-db`** (Managed PostgreSQL Database)
5. Under Environment Variables for `lumenos-api`, update `CORS_ORIGINS` to include your Vercel URL (e.g. `https://lumenos.vercel.app,http://localhost:5173`).
6. Click **Apply**.
7. Once deployed, note your public backend URL: `https://lumenos-api.onrender.com`.

### Step 3: Deploy Frontend to Vercel
1. Create a free account at [vercel.com](https://vercel.com).
2. Click **Add New...** $\to$ **Project**.
3. Import your GitHub `LumenOS` repository.
4. In Project Settings:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm --prefix apps/web run build`
   - **Output Directory**: `apps/web/dist`
5. In **Environment Variables**, add:
   - `VITE_API_URL`: `https://lumenos-api.onrender.com`
   - `VITE_WS_URL`: `wss://lumenos-api.onrender.com`
6. Click **Deploy**.
7. Vercel will build and assign your production URL (e.g. `https://lumenos.vercel.app`).

---

## 5. End-to-End Smoke Testing & Browser Verification

Once deployed, verify the full loop in your browser:
1. **Solo Mission Journey**:
   - Navigate to `https://lumenos.vercel.app`.
   - Click **Solo Missions** $\to$ Select **Wildfire Scout**.
   - Design your spacecraft bus, review pre-launch GO/NO-GO gates, and click **Launch Mission**.
   - Advance the simulation clock, resolve an event, and inspect the Results & Scoring screen.
2. **Cooperative Multiplayer Room**:
   - Open a normal browser tab: Click **Co-op Multiplayer** $\to$ **Create Room**.
   - Note the 6-character room code (e.g. `K9W4B2`).
   - Open a private/incognito tab: Click **Join Room** $\to$ enter the code and display name.
   - Host assigns roles (e.g. Mission Director & Systems Engineer).
   - Verify that actions, clock steps, and tactical pings synchronize instantly across both windows.
3. **Cesium 3D & 2D Accessible Toggle**:
   - Toggle the **Accessible 2D Map** button to confirm smooth switching between the 3D Cesium globe and the high-contrast 2D SVG map.

---

## 6. Troubleshooting FAQ

- **Issue: WebSocket fails to connect in production.**
  - *Fix*: Ensure your reverse proxy or hosting provider supports WebSocket upgrades. On Render, WebSockets are supported natively on all HTTPS ports without extra configuration.
- **Issue: CORS error when calling backend from Vercel.**
  - *Fix*: In your Render Dashboard, add your exact Vercel production domain to the `CORS_ORIGINS` environment variable (e.g. `https://lumenos.vercel.app`).
- **Issue: Cesium globe shows blank black screen on low-end laptops.**
  - *Fix*: Click **Accessible 2D Map** on the flight deck. LumenOS includes a full SVG/Canvas equirectangular map that requires zero WebGL hardware acceleration.

