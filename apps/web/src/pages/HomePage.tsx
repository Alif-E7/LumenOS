import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getHealth } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { loadMissionSession } from "../lib/mission";

export function HomePage() {
  const navigate = useNavigate();
  const { data: health, loading, error } = useApi(getHealth);
  const session = loadMissionSession();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Active Session Resume Banner */}
      {session && session.sessionId && (
        <div className="mb-8 p-4 rounded-none border border-accent/50 bg-accent/10/40 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">🛰️</span>
            <div>
              <h3 className="font-semibold text-ink">
                Active Mission in Flight: {session.missionName}
              </h3>
              <p className="text-xs text-muted">
                Mode: {session.mode === "solo" ? "Solo (All Stations)" : `Co-op (Room ${session.roomCode})`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => navigate("/operate")}>
              Resume Mission Control →
            </Button>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold text-ink mb-4">
          LumenOS
          <span className="block text-2xl text-accent font-light mt-2">
            Orbital Mission Architect
          </span>
        </h1>
        <p className="text-lg text-muted max-w-2xl mx-auto mb-8">
          An educational interactive space mission design & simulation platform.
          Fly solo with full command of all four stations, or team up in real-time co-op with friends.
        </p>

        {/* Solo vs Co-op Direct Entry Points */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" onClick={() => navigate("/mode")}>
            🚀 Start Solo Mission
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate("/coop")}>
            👥 Multiplayer Co-op Room
          </Button>
          <Button variant="ghost" size="lg" onClick={() => navigate("/design")}>
            🛠️ Spacecraft Designer
          </Button>
        </div>
      </section>

      {/* Mission Cards */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-ink">Mission Scenarios</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate("/missions")}>
            View All Scenarios →
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              id: "wildfire",
              icon: "🔥",
              title: "Wildfire Scout",
              codename: "Eyes on Fire",
              desc: "Monitor wildfires with thermal imaging from a sun-synchronous orbit.",
              difficulty: 2,
            },
            {
              id: "flood",
              icon: "🌊",
              title: "Flood Scout",
              codename: "Rising Waters",
              desc: "Track flooding with SAR radar — see through clouds to map disaster zones.",
              difficulty: 3,
            },
            {
              id: "solar_storm",
              icon: "☀️",
              title: "Solar Storm Sentinel",
              codename: "Watch the Sun",
              desc: "Monitor solar activity and issue CME warnings to protect Earth.",
              difficulty: 4,
            },
            {
              id: "volcano",
              icon: "🌋",
              title: "Volcano Watch",
              codename: "Fire Beneath the Earth",
              desc: "Observe volcanic activity with multispectral imaging from orbit.",
              difficulty: 3,
            },
          ].map((m) => (
            <Card
              key={m.title}
              icon={m.icon}
              title={m.title}
              subtitle={m.codename}
              onClick={() => navigate(`/missions/${m.id}/brief`)}
              className="hover:shadow-lg hover:shadow-accent/5 cursor-pointer"
            >
              <p className="text-sm text-muted mb-3">{m.desc}</p>
              <div className="flex items-center justify-between pt-2 border-t border-edge/80">
                <span className="text-xs text-ink0">
                  {"⭐".repeat(m.difficulty)}
                  {"☆".repeat(5 - m.difficulty)}
                </span>
                <span className="text-xs text-accent font-medium">Briefing →</span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Product Loop */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-ink mb-6">The Mission Loop</h2>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {[
            "Design", "Configure", "Validate", "Launch", "Simulate",
            "Monitor", "Decide", "Handle Events", "Communicate",
            "Analyze", "Replay", "Improve", "Try Again",
          ].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-none bg-raised text-ink border border-edge-strong">
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-faint">→</span>}
            </span>
          ))}
        </div>
      </section>

      {/* System status */}
      <section>
        <Card title="System Status" icon="📡">
          <div className="flex flex-wrap items-center gap-4">
            {loading && <StatusBadge label="Connecting..." variant="warning" />}
            {error && <StatusBadge label={`API Error: ${error}`} variant="danger" />}
            {health && (
              <>
                <StatusBadge label={`${health.app} v${health.version}`} variant="success" />
                <StatusBadge label="FastAPI Simulation Engine Online" variant="success" />
              </>
            )}
            <StatusBadge label="WebSocket Multi-client Ready" variant="info" />
          </div>
        </Card>
      </section>
    </div>
  );
}
