# LumenOS System Architecture

LumenOS is an educational, interactive space mission design and simulation platform. It operates as a unified monorepo featuring a high-performance **React 19 / TypeScript / Vite** frontend and an authoritative **Python / FastAPI** backend hosting a deterministic orbital and spacecraft subsystems simulation engine.

---

## 1. High-Level System Architecture

LumenOS maintains strict server-side authority. The client renders the mission control deck, flight instruments, and CesiumJS 3D visualizer, while all orbital state transitions, subsystem physics integrations, event triggers, and crew permissions are computed authoritatively on the backend.

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Browser / React 19)"]
        UI["Flight Deck UI<br/>(Tailwind CSS + Lucide Icons)"]
        CES["Cesium 3D View<br/>+ Accessible 2D SVG Map"]
        WS_CLIENT["WebSocket Hook<br/>(useRoomSocket / Reconnect)"]
        REST_CLIENT["REST API Client<br/>(Typed Fetch Wrappers)"]
    end

    subgraph Backend["Backend Server (FastAPI / Python 3.11+)"]
        ROUTER_ROOMS["Room Router<br/>(/api/rooms & WS)"]
        ROUTER_REST["REST Routers<br/>(Missions, Spacecraft, Replay, Progression)"]
        ROOM_MGR["Room & Session Manager<br/>(Authoritative Concurrency)"]
        PERM["Role Permission Matrix<br/>(Server-Side Enforcement)"]
    end

    subgraph SimulationCore["Authoritative Game & Simulation Engine"]
        GAME_SESSION["GameSession Coordinator"]
        EVENT_DIR["Seeded Event Director"]
        OBJ_EVAL["Objective Evaluator & Scorer"]
        LUMENOS_AI["LumenOS Predictive Scheduler<br/>(5-Min Physics Forecast)"]
        SIM_RUNNER["SimulationRunner (60s discrete steps)"]
        
        subgraph Subsystems["Spacecraft Subsystems"]
            PHYS_ORBIT["Orbital Mechanics (Kepler + J2)"]
            PHYS_PWR["Power & Battery (Solar + EFC Wear)"]
            PHYS_THM["Thermal (Lumped Mass + Stefan-Boltzmann)"]
            PHYS_COM["Comms & RF (FSPL + Elevation Mask)"]
            PHYS_STR["SSDR Storage (Multi-Queue Buffers)"]
            PHYS_RAD["Radiation & Debris (SAA + Altitude Shell)"]
        end
    end

    subgraph Storage["Persistence & Reference Data"]
        DB[(PostgreSQL / SQLite<br/>Spacecraft & Career Profiles)]
        OFFLINE_DATA["7 Bundled NASA / Partner<br/>Zero-Credential Datasets"]
    end

    UI --> REST_CLIENT
    UI --> WS_CLIENT
    CES --> REST_CLIENT
    
    REST_CLIENT --> ROUTER_REST
    WS_CLIENT <-->|Real-Time Commands & Snapshots| ROUTER_ROOMS

    ROUTER_REST --> ROOM_MGR
    ROUTER_ROOMS --> ROOM_MGR
    ROOM_MGR --> PERM
    PERM --> GAME_SESSION

    GAME_SESSION --> EVENT_DIR
    GAME_SESSION --> OBJ_EVAL
    GAME_SESSION --> LUMENOS_AI
    GAME_SESSION --> SIM_RUNNER

    SIM_RUNNER --> PHYS_ORBIT
    SIM_RUNNER --> PHYS_PWR
    SIM_RUNNER --> PHYS_THM
    SIM_RUNNER --> PHYS_COM
    SIM_RUNNER --> PHYS_STR
    SIM_RUNNER --> PHYS_RAD

    ROUTER_REST --> DB
    SIM_RUNNER -.->|Environmental Calibration| OFFLINE_DATA
```

---

## 2. Session Authority & Multiplayer Command Flow

Every mission session runs as an isolated, stateful `GameSession` managed by `SessionManager` and coordinated through `RoomManager`. Whether operating in **Solo Mode (All Stations)** or **Cooperative Multiplayer (2–4 Players)**, the command execution pipeline guarantees bit-exact determinism and server-authoritative integrity:

```mermaid
sequenceDiagram
    autonumber
    participant Player as Station Operator (Client)
    participant WS as WebSocket Handler (/api/rooms/ws)
    participant Room as Co-op Room Manager
    participant Perm as Server Permission Matrix
    participant Session as Authoritative GameSession
    participant Sim as Physics Engine
    participant Crew as Other Crew Stations

    Player->>WS: Send Command {command: "action", action_type: "set_power_mode", params: {...}}
    WS->>Room: Rate Limit & Message Size Verification (≤64 KB)
    Room->>Perm: Verify Player Role Permissions
    alt Unauthorized Role
        Perm-->>Player: Reject {"type": "error", "error": "Role does not permit action"}
    else Authorized Role
        Perm->>Session: Execute Action Request
        Session->>Sim: Update Subsystem State & Decrement Budget
        Sim-->>Session: New Physical State & Telemetry
        Session-->>Room: Updated Authoritative GameState
        Room-->>Player: Command Result {"type": "action_result", "success": true}
        Room->>Crew: Broadcast State {"type": "action_broadcast", "state": {...}, "telemetry": {...}}
    end
```

---

## 3. Technology Stack Summary

| Layer | Component | Technology | Rationale |
|:---|:---|:---|:---|
| **Frontend** | Framework & Bundler | React 19, TypeScript, Vite 8 | Ultra-fast HMR, strict type safety, zero-bundle overhead. |
| | Styling & UI | Tailwind CSS v4, Lucide Icons | Clean mission-control aesthetics, responsive grid, accessible contrast. |
| | 3D Visualization | CesiumJS (via `vite-plugin-cesium`) | High-precision WGS-84 globe, satellite orbits, ground tracks, sensor swaths. |
| | Accessible 2D Fallback | Equirectangular SVG Map & Tables | Works without WebGL, screen-reader friendly, accessible tabular telemetry. |
| **Backend** | API Framework | FastAPI (ASGI), Uvicorn | Native async WebSockets, automatic OpenAPI docs, high concurrency. |
| | Data Validation | Pydantic v2 | High-speed C-extension schema validation, strict type coercion. |
| | Persistence | SQLAlchemy 2.0 (Async), SQLite / PostgreSQL | Zero-config SQLite for local dev; async PostgreSQL for production hosting. |
| **Simulation** | Physics Engine | Pure Python 3.11+, NumPy, SciPy | Deterministic 60-second discrete step numerical integration. |
| | Astrodynamics | Analytical Kepler + $J_2$ Oblateness | Verified against NASA GMAT R2022a and Vallado orbital equations. |
| | Predictive AI | Rule-based & Physical forward forecasting | Transparent 5-minute thermal, power, and storage horizon predictions. |

---

## 4. Dual Operational Modes

1. **Solo Mode (All Stations Workspace)**:
   - The solo player commands all four spacecraft disciplines simultaneously via a unified workstation.
   - Restful step control allows forward stepping, pausing, speed modification, and timeline scrubbing.
2. **Co-op Multiplayer (2–4 Players)**:
   - Players join private rooms via 6-character high-entropy codes.
   - Dedicated stations: **Mission Director**, **Systems Engineer**, **Science Officer**, and **Flight Controller**.
   - Dynamic role bundling automatically maps 4 roles across 2 or 3 players.
   - Cross-role action requests, host start/pause/restart controls, and real-time synchronization.

