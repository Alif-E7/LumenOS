import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RewardPanel, type Reward } from "../components/RewardPanel";
import { getPlayerProfile, purchaseUnlock } from "../api/client";
import type { PlayerProfileResponse, UnlockItem } from "../types";

/**
 * Rewards & Progression — career overview.
 * Connected to persistent player profile, achievement catalog, and unlock store.
 */
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
        // Fallback from localStorage if server isn't reached
        let xp = 0;
        try {
          xp = JSON.parse(localStorage.getItem("lumenos.career") ?? "").xp ?? 0;
        } catch { /* default 0 */ }
        setProfile({
          player_id: "pilot-local",
          display_name: xp >= 800 ? "Veteran Flight Director" : xp >= 400 ? "Mission Specialist" : "Cadet Operator",
          total_xp: xp,
          level: Math.max(1, Math.floor(Math.sqrt(xp / 100))),
          xp_to_next_level: 1000 - xp,
          engineering_credits: 500,
          missions_completed: 0,
          achievements: [],
          unlocks: [],
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
  const rankLabel = profile?.display_name || (xp >= 800 ? "Veteran Flight Director" : xp >= 400 ? "Mission Specialist" : "Cadet Operator");

  const rewards: Reward[] = (profile?.achievements && profile.achievements.length > 0)
    ? profile.achievements.map((a) => ({
        id: a.id,
        label: a.name,
        description: a.description,
        earned: a.unlocked,
        icon: a.icon,
      }))
    : [
        { id: "first_launch", label: "First Launch", description: "Complete your first mission", earned: false, icon: "🚀" },
        { id: "perfect_score", label: "Perfect Score", description: "Earn an A+ grade on any mission", earned: false, icon: "⭐" },
        { id: "budget_master", label: "Budget Master", description: "Complete a mission using < 50% budget", earned: false, icon: "💰" },
        { id: "clean_telemetry", label: "Pristine Hull", description: "Maintain at least 95% spacecraft health", earned: false, icon: "🛡️" },
        { id: "flood_responder", label: "Radar Pathfinder", description: "Complete Flood Scout mission", earned: false, icon: "🌊" },
        { id: "campaign_champion", label: "Grand Architect", description: "Complete all 4 campaign missions", earned: false, icon: "👑" },
      ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-bold text-ink">Rewards & Career Progression</h1>
        <span className="text-xs px-2.5 py-1 rounded bg-accent/10/80 border border-blue-800 text-accent-hi font-mono">
          PROFILE ID: {profile?.player_id ?? "pilot-local"}
        </span>
      </div>
      <p className="text-muted mb-8">
        Earn XP and Engineering Credits by completing NASA data-driven orbital contracts.
        Credits unlock specialized hardware modules in the Spacecraft Architect.
      </p>

      {feedbackMessage && (
        <div
          className={`mb-6 p-3 rounded-none border text-sm ${
            feedbackMessage.error
              ? "bg-rose-950/50 border-rose-800 text-rose-200"
              : "bg-ok/10/50 border-emerald-800 text-emerald-200"
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
      <Card title="Engineering Credits Catalog (Hardware Unlocks)" icon="🔓" className="mb-8">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-edge text-xs text-muted">
          <span>Available Balance: <strong className="text-warn font-mono font-semibold">{credits.toLocaleString()} Credits</strong></span>
          <span>Pilot Clearance: <strong className="text-info font-mono font-semibold">Level {profile?.level ?? 1}</strong></span>
        </div>

        {loading ? (
          <p className="text-xs text-muted">Loading catalog…</p>
        ) : profile?.unlocks && profile.unlocks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {profile.unlocks.map((u) => {
              const canAfford = credits >= u.credit_cost;
              const meetsLevel = (profile?.level ?? 1) >= u.required_level;
              return (
                <div
                  key={u.id}
                  className={`p-4 rounded-none border flex flex-col justify-between ${
                    u.unlocked
                      ? "border-emerald-700/50 bg-ok/10/20"
                      : "border-edge bg-panel/50"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{u.icon}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-ink">{u.name}</h4>
                        {u.unlocked && (
                          <span className="text-3xs font-mono px-1.5 py-0.5 rounded bg-ok/20 text-ok border border-ok/30">
                            UNLOCKED
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-1">{u.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-edge/80 text-xs">
                    <span className="text-ink0 font-mono">
                      Req: Lvl {u.required_level} • Cost: {u.credit_cost} cr
                    </span>
                    {!u.unlocked ? (
                      <Button
                        size="sm"
                        disabled={!canAfford || !meetsLevel || purchasing === u.id}
                        onClick={() => handlePurchase(u)}
                        className="text-xs py-1"
                      >
                        {purchasing === u.id ? "Unlocking…" : !meetsLevel ? `Lvl ${u.required_level} Required` : !canAfford ? "Insufficient Credits" : `Unlock (${u.credit_cost} cr)`}
                      </Button>
                    ) : (
                      <span className="text-xs text-ok font-medium">Ready in Designer</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink0">No hardware modules listed.</p>
        )}
      </Card>

      <Card title="How Engineering Progression Works" icon="ℹ️" className="mb-8">
        <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
          <li><strong>Mission Budget</strong> is specific to each contract and resets between missions.</li>
          <li><strong>Engineering Credits</strong> are persistent career currency earned from high mission scores and objective completion.</li>
          <li><strong>Career XP</strong> increases your operator rank and unlocks advanced campaign scenarios (Wildfire → Flood → Solar Storm → Volcano).</li>
        </ul>
      </Card>

      <div className="flex justify-center">
        <Button onClick={() => navigate("/missions")}>Earn XP & Credits — Fly a Mission</Button>
      </div>
    </div>
  );
}
