import { useNavigate } from "react-router-dom";
import { useApi } from "../hooks/useApi";
import { getHealth } from "../api/client";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";

export function HomePage() {
  const navigate = useNavigate();
  const { data: health, loading, error } = useApi(getHealth);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Hero */}
      <section className="text-center mb-16">
        <h1 className="text-5xl font-bold text-white mb-4">
          LumenOS
          <span className="block text-2xl text-blue-400 font-light mt-2">
            Orbital Mission Architect
          </span>
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-8">
          Design a spacecraft. Configure your mission. Launch into orbit.
          Monitor systems, respond to events, and analyze your performance.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button size="lg" onClick={() => navigate("/missions")}>
            🚀 Start a Mission
          </Button>
          <Button variant="secondary" size="lg" onClick={() => navigate("/design")}>
            🛠️ Design Spacecraft
          </Button>
        </div>
      </section>

      {/* Mission Cards */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">Mission Scenarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              icon: "🔥",
              title: "Wildfire Scout",
              codename: "Eyes on Fire",
              desc: "Monitor wildfires with thermal imaging from a sun-synchronous orbit.",
              difficulty: 2,
            },
            {
              icon: "🌊",
              title: "Flood Scout",
              codename: "Rising Waters",
              desc: "Track flooding with SAR radar — see through clouds to map disaster zones.",
              difficulty: 3,
            },
            {
              icon: "☀️",
              title: "Solar Storm Sentinel",
              codename: "Watch the Sun",
              desc: "Monitor solar activity and issue CME warnings to protect Earth.",
              difficulty: 4,
            },
            {
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
              onClick={() => navigate("/missions")}
              className="hover:shadow-lg hover:shadow-blue-500/5"
            >
              <p className="text-sm text-slate-400 mb-3">{m.desc}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Difficulty:</span>
                <span className="text-xs">
                  {"⭐".repeat(m.difficulty)}
                  {"☆".repeat(5 - m.difficulty)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Product Loop */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6">The Mission Loop</h2>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {[
            "Design", "Configure", "Validate", "Launch", "Simulate",
            "Monitor", "Decide", "Handle Events", "Communicate",
            "Analyze", "Replay", "Improve", "Try Again",
          ].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-2">
              <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-slate-600">→</span>}
            </span>
          ))}
        </div>
      </section>

      {/* System status */}
      <section>
        <Card title="System Status" icon="📡">
          <div className="flex items-center gap-4">
            {loading && <StatusBadge label="Connecting..." variant="warning" />}
            {error && <StatusBadge label={`API Error: ${error}`} variant="danger" />}
            {health && (
              <>
                <StatusBadge label={`${health.app} v${health.version}`} variant="success" />
                <StatusBadge label="API Online" variant="success" />
              </>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

