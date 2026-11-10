import { useEffect, useState } from "react";
import { Unlock as UnlockIcon, Award, Cpu, ShieldCheck, Rocket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { getPlayerProfile, purchaseUnlock } from "../api/client";
import type { PlayerProfileResponse, UnlockItem } from "../types";

export function RewardsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchProfile = () => {
    getPlayerProfile("pilot-local")
      .then((data) => setProfile(data))
      .catch(() => {
        let xp = 0;
        try {
          xp = JSON.parse(localStorage.getItem("lumenos.career") ?? "").xp ?? 0;
        } catch {
          /* default 0 */
        }
        setProfile({
          player_id: "pilot-local",
          display_name:
            xp >= 800
              ? "Veteran Flight Director"
              : xp >= 400
              ? "Mission Specialist"
              : "Cadet Operator",
          total_xp: xp,
          level: Math.max(1, Math.floor(Math.sqrt(xp / 100))),
          xp_to_next_level: 1000 - xp,
          engineering_credits: 500,
          missions_completed: 0,
          achievements: [],
          unlocks: [
            {
              id: "high_density_battery",
              name: "High-Density Li-Sulfur Battery",
              description: "4.0 kWh deep-discharge reserve yielding +40% capacity across LEO eclipse.",
              unlock_type: "spacecraft_module",
              credit_cost: 350,
              required_level: 1,
              icon: "🔋",
              unlocked: false,
            },
            {
              id: "optical_sar_sensor",
              name: "Dual-Polarized C-Band SAR Array",
              description: "High-resolution synthetic aperture radar with all-weather cloud penetration.",
              unlock_type: "spacecraft_module",
              credit_cost: 500,
              required_level: 1,
              icon: "📡",
              unlocked: false,
            },
          ],
          campaign: { unlocked_missions: ["wildfire"], mission_records: {} },
        });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePurchase = async (unlock: UnlockItem) => {
    if (!profile) return;
    setPurchasing(unlock.id);
    setFeedbackMessage(null);
    try {
      const res = await purchaseUnlock(profile.player_id, unlock.id);
      if (res.success) {
        setFeedbackMessage({ text: `Successfully unlocked ${unlock.name}!` });
        fetchProfile();
      }
    } catch (err: any) {
      setFeedbackMessage({ text: err.message || "Failed to purchase unlock", error: true });
    } finally {
      setPurchasing(null);
    }
  };

  const xp = profile?.total_xp ?? 0;
  const credits = profile?.engineering_credits ?? 0;
  const rankLabel =
    profile?.display_name ||
    (xp >= 800 ? "Veteran Flight Director" : xp >= 400 ? "Mission Specialist" : "Cadet Operator");

  const rewards: Reward[] =
    profile?.achievements && profile.achievements.length > 0
      ? profile.achievements.map((a) => ({
          id: a.id,
          label: a.name,
          description: a.description,
          earned: a.unlocked,
          icon: a.icon,
        }))
      : [
          { id: "first_launch", label: "First Launch", description: "Complete your first orbital mission", earned: false, icon: "" },
          { id: "perfect_score", label: "Perfect Score", description: "Earn an A+ grade on any mission theater", earned: false, icon: "" },
          { id: "budget_master", label: "Budget Master", description: "Complete a mission using < 50% budget", earned: false, icon: "" },
          { id: "clean_telemetry", label: "Pristine Hull", description: "Maintain at least 95% spacecraft health", earned: false, icon: "" },
          { id: "flood_responder", label: "Radar Pathfinder", description: "Complete Flood Scout SAR mission", earned: false, icon: "" },
          { id: "campaign_champion", label: "Grand Architect", description: "Complete all 4 campaign missions", earned: false, icon: "👑" },
        ];

  return (
    <div className="max-w-5xl mx-auto px-4 pt-10 pb-16 sm:px-6 lg:px-8">
      {/* Aerospace Career Command Banner */}
      <div className="rounded-2xl border border-slate-800/90 bg-gradient-to-r from-slate-950 via-slate-900/90 to-amber-950/25 p-6 sm:p-8 shadow-2xl mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-[10px] font-mono uppercase tracking-[0.2em] text-amber-300 mb-2">
              <Award className="h-3.5 w-3.5" /> Orbital Flight Directorate · Career & Hardware Qualification
            </div>
            <h1 className="text-3xl font-bold text-ink tracking-tight">
              Rewards & Career Progression
            </h1>
            <p className="text-slate-300 mt-1.5 max-w-2xl text-sm leading-relaxed">
              Earn XP and Engineering Credits by containing global environmental crises and maintaining
              high spacecraft telemetry margins. Unlock advanced rad-hardened modules for the Hangar CAD.
            </p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
            PROFILE ID: {profile?.player_id ?? "pilot-local"}
          </span>
        </div>
      </div>

      {feedbackMessage && (
        <div
          className={`mb-6 p-3.5 rounded-xl border text-sm font-mono ${
            feedbackMessage.error
              ? "bg-crit/10 border-crit/40 text-crit"
              : "bg-ok/10 border-ok/40 text-ok"
          }`}
        >
          {feedbackMessage.text}
        </div>
      )}

      {/* Career Progress & Badges */}
      <RewardPanel
        rewards={rewards}
        xp={xp}
        nextRankXp={1000}
        rankLabel={rankLabel}
        credits={credits}
        className="mb-8"
      />

      {/* Engineering Credits Unlocks Catalog */}
      <Card title="Engineering Credits Catalog (Hardware Unlocks)" className="mb-8 rounded-2xl">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-edge text-xs text-muted">
          <span>
            Available Balance:{" "}
            <strong className="text-warn font-mono font-semibold">
              {credits.toLocaleString()} Credits
            </strong>
          </span>
          <span>
            Pilot Clearance:{" "}
            <strong className="text-info font-mono font-semibold">
              Level {profile?.level ?? 1}
            </strong>
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted">Loading catalog…</p>
        ) : profile?.unlocks && profile.unlocks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.unlocks.map((u) => {
              const canAfford = credits >= u.credit_cost;
              const meetsLevel = (profile?.level ?? 1) >= u.required_level;
              return (
                <div
                  key={u.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                    u.unlocked
                      ? "border-emerald-500/40 bg-emerald-950/20"
                      : "border-slate-800 bg-slate-950/70"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span
                      aria-hidden
                      className={`p-2 rounded-lg border ${
                        u.unlocked
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : "border-slate-800 bg-slate-900 text-slate-400"
                      }`}
                    >
                      <UnlockIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-100">{u.name}</h4>
                        {u.unlocked && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            UNLOCKED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{u.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                    <span className="text-slate-400 font-mono">
                      Req: Lvl {u.required_level} • Cost: {u.credit_cost} cr
                    </span>
                    {!u.unlocked ? (
                      <Button
                        size="sm"
                        disabled={!canAfford || !meetsLevel || purchasing === u.id}
                        onClick={() => handlePurchase(u)}
                        className="text-xs py-1"
                      >
                        {purchasing === u.id
                          ? "Unlocking…"
                          : !meetsLevel
                          ? `Lvl ${u.required_level} Required`
                          : !canAfford
                          ? "Insufficient Credits"
                          : `Unlock (${u.credit_cost} cr)`}
                      </Button>
                    ) : (
                      <span className="text-xs text-emerald-300 font-mono font-semibold flex items-center gap-1">
                        <ShieldCheck className="h-3.5 w-3.5" /> Qualified for Flight
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-faint">No hardware modules listed.</p>
        )}
      </Card>

      {/* Architecture Progression Overview */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8 font-mono">
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <Cpu className="h-4 w-4 text-cyan-400 mb-2" />
          <div className="text-xs font-bold text-slate-100">Mission Operations Budget</div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Allocated per orbital contract for in-flight sensor captures, AI inference, and prograde burns.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <Award className="h-4 w-4 text-amber-400 mb-2" />
          <div className="text-xs font-bold text-slate-100">Persistent Engineering Credits</div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Earned from mission grades and crisis containment to unlock permanent spacecraft hardware.
          </p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
          <Rocket className="h-4 w-4 text-emerald-400 mb-2" />
          <div className="text-xs font-bold text-slate-100">Flight Director Clearance</div>
          <p className="text-xs text-slate-400 mt-1 font-sans">
            Advance from Cadet Operator to Veteran Flight Director across all 4 environmental theaters.
          </p>
        </div>
      </div>

      <div className="flex justify-center">
        <Button onClick={() => navigate("/missions")}>
          Earn XP & Credits — Launch a Mission Sortie
        </Button>
      </div>
    </div>
  );
}
