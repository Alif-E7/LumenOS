/**
 * Kid translation layer — the only file the simple (Cadet) experience uses
 * to talk about the simulation. Raw physics vocabulary never crosses this
 * boundary: battery SoC becomes "Battery", the comms buffer becomes
 * "Memory", budget credits become coins, and every concept gets a
 * plain-language status instead of a numeric readout.
 *
 * The backend stays untouched and authoritative — we only curate what the
 * UI shows (a 6-action subset of the 24 engine actions) and how it sounds.
 */

import type {
  GameStateSummary,
  ObjectiveProgress,
  Telemetry,
} from "../types";

// ── Mission stories ─────────────────────────────────────────────────────────

export const MISSION_STORIES: Record<string, { story: string; goal: string }> = {
  wildfire: {
    story:
      "Severe crown fires are burning across eucalyptus corridors in Australia. Task your 3.9 µm SWIR sensor and onboard FireNet AI to pinpoint thermal fronts and alert Incident Command.",
    goal: "Photograph active wildfire fronts in SWIR and downlink compressed AI perimeter alerts",
  },
  flood: {
    story:
      "Monsoon storm surges are inundating major river deltas beneath 98% cloud cover. Penetrate the clouds with C-Band SAR radar and run 50:1 onboard AI water-mask segmentation.",
    goal: "Map inundated river basins with SAR radar and relay vector flood masks to ground stations",
  },
  solar_storm: {
    story:
      "An X-class solar flare and Earth-directed Coronal Mass Ejection (CME) are impacting the magnetosphere. Track Kp geomagnetic indices while scrubbing radiation SEUs in neural memory.",
    goal: "Monitor solar coronagraph telemetry, survive proton flux peaks, and issue CME warnings",
  },
  volcano: {
    story:
      "Stratovolcano calderas are exhibiting pre-eruptive thermal spikes and stratospheric SO₂/ash plumes. Track plume dispersion and issue ICAO Aviation SIGMET advisories.",
    goal: "Monitor caldera thermal anomalies and downlink SO₂ / volcanic ash aviation warnings",
  },
};

export function missionStory(missionId: string): string {
  return (
    MISSION_STORIES[missionId]?.story ??
    "Fly your spaceship, take photos of Earth, and send them home!"
  );
}

export function missionGoal(missionId: string): string {
  return MISSION_STORIES[missionId]?.goal ?? "Complete your mission goals";
}

// ── Gauges ──────────────────────────────────────────────────────────────────

export type GaugeStatus = "good" | "warn" | "bad";

export interface KidGauge {
  id: "battery" | "heat" | "signal" | "memory" | "health";
  label: string;
  /** 0–100 fill level for the gauge bar. */
  value: number;
  status: GaugeStatus;
  /** One short kid-friendly line, e.g. "Battery is happy!" */
  line: string;
}

const STATUS_LINE: Record<KidGauge["id"], Record<GaugeStatus, string>> = {
  battery: {
    good: "Solar arrays nominal in sunshine — battery reserve optimal!",
    warn: "Battery SoC depleting — consider switching AI compute to Eco Mode.",
    bad: "Battery reserve almost empty! Shed non-essential loads immediately!",
  },
  heat: {
    good: "Stefan-Boltzmann radiator loop nominal.",
    warn: "Bus thermal load rising — AI compute dissipating excess heat.",
    bad: "Critical thermal boundary! Throttle AI compute or trim radiators.",
  },
  signal: {
    good: "RF Ground Station / Optical ISL link locked!",
    warn: "Awaiting next RF ground station pass (ISL relay standby).",
    bad: "Out of ground station cone — store vectors in SSDR buffer.",
  },
  memory: {
    good: "NVMe SSDR flash buffer nominal.",
    warn: "SSDR buffer filling — downlink telemetry on next pass!",
    bad: "SSDR buffer almost full! High-rate sensor frames at overflow risk!",
  },
  health: {
    good: "Spacecraft bus & AI compute blades nominal!",
    warn: "Minor subsystem degradation detected.",
    bad: "Critical bus integrity alert — engage Safe Mode!",
  },
};

/**
 * Convert raw telemetry into the four kid gauges (+ health).
 * Thresholds mirror the expert console's warning flags so both modes agree
 * on when something is actually wrong.
 */
export function kidGauges(tel: Telemetry | null): KidGauge[] {
  if (!tel || !tel.power) {
    return [
      { id: "battery", label: "Battery", value: 100, status: "good", line: STATUS_LINE.battery.good },
      { id: "heat", label: "Temperature", value: 45, status: "good", line: STATUS_LINE.heat.good },
      { id: "signal", label: "Signal", value: 100, status: "good", line: STATUS_LINE.signal.good },
      { id: "memory", label: "Memory", value: 0, status: "good", line: STATUS_LINE.memory.good },
      { id: "health", label: "Ship Health", value: 100, status: "good", line: STATUS_LINE.health.good },
    ];
  }

  // Battery — server flags win over raw thresholds
  const soc = Math.round(tel.power?.battery_soc_pct ?? 100);
  let batStatus: GaugeStatus = soc > 50 ? "good" : soc > 25 ? "warn" : "bad";
  if (tel.power?.power_critical) batStatus = "bad";
  else if (tel.power?.low_power_warning && batStatus === "good") batStatus = "warn";

  // Heat — the thermometer only reacts to server warnings, not absolute °C,
  // because safe operating range depends on the spacecraft design
  let heatStatus: GaugeStatus = "good";
  if (tel.thermal?.overtemp_warning || tel.thermal?.undertemp_warning) heatStatus = "warn";
  if (tel.thermal?.thermal_critical) heatStatus = "bad";

  // Signal — are we over a ground station right now?
  const inContact = tel.comms?.in_contact ?? true;
  const sigStatus: GaugeStatus = inContact ? "good" : "warn";

  // Memory — downlink buffer / storage usage
  const mem = Math.round(Math.max(tel.storage?.used_pct ?? 0, tel.comms?.data_buffer_pct ?? 0));
  let memStatus: GaugeStatus = mem < 70 ? "good" : mem < 90 ? "warn" : "bad";
  if (tel.comms?.buffer_full_warning || tel.storage?.storage_full_warning) memStatus = "bad";

  // Ship health
  const hp = Math.round(tel.spacecraft_health_pct ?? 100);
  const hpStatus: GaugeStatus = hp > 70 ? "good" : hp > 40 ? "warn" : "bad";

  const mk = (
    id: KidGauge["id"],
    label: string,
    value: number,
    status: GaugeStatus
  ): KidGauge => ({ id, label, value: Math.max(0, Math.min(100, Math.round(value))), status, line: STATUS_LINE[id][status] });

  return [
    mk("battery", "Battery", soc, batStatus),
    mk("heat", "Temperature", heatStatus === "warn" ? 85 : heatStatus === "bad" ? 97 : 45, heatStatus),
    mk("signal", "Signal", inContact ? 100 : 15, sigStatus),
    mk("memory", "Memory", mem, memStatus),
    mk("health", "Ship Health", hp, hpStatus),
  ];
}

/** The single most urgent gauge — used for Lumi's ambient hints. */
export function worstGauge(gauges: KidGauge[]): KidGauge | null {
  const rank = { good: 0, warn: 1, bad: 2 } as const;
  let worst: KidGauge | null = null;
  for (const g of gauges) {
    if (!worst || rank[g.status] > rank[worst.status]) worst = g;
  }
  return worst && worst.status !== "good" ? worst : null;
}

// ── Coins & goals ───────────────────────────────────────────────────────────

export function coinsLeft(state: GameStateSummary | null): number {
  return Math.max(0, Math.round(state?.budget_remaining ?? 0));
}

export interface KidGoal {
  id: string;
  text: string;
  progress: number; // 0–100
  done: boolean;
}

/**
 * Turn backend objectives into short goal chips.
 * Long engineering descriptions get shortened to their first clause.
 */
export function kidGoals(objectives: ObjectiveProgress[] | undefined): KidGoal[] {
  if (!objectives?.length) return [];
  const shorten = (desc: string) => {
    const firstClause = desc.split(/[.;—]/)[0].trim();
    const words = firstClause.split(/\s+/);
    return words.length <= 10 ? firstClause : words.slice(0, 9).join(" ") + "…";
  };
  return objectives
    .slice()
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .slice(0, 3)
    .map((o) => ({
      id: o.objective_id,
      text: shorten(o.description),
      progress: Math.max(0, Math.min(100, Math.round(o.fraction * 100))),
      done: o.is_complete,
    }));
}

// ── Curated actions ─────────────────────────────────────────────────────────

export interface KidAction {
  id: string;
  label: string;
  /** Lucide icon name (resolved in the component to avoid a hard import dep). */
  icon: "camera" | "antenna" | "leaf" | "zap" | "shield" | "rocket";
  /** Coin cost shown on the button (0 = free). */
  cost: number;
  /** Backend ActionType (game/actions.py). */
  actionType: string;
  params?: Record<string, unknown>;
  /** Plain-language description of what it does. */
  hint: string;
}

/** The six flight deck commands — a curated subset of the engine's 24 ActionTypes. */
export const KID_ACTIONS: KidAction[] = [
  {
    id: "photo",
    label: "Sensor Capture",
    icon: "camera",
    cost: 0,
    actionType: "collect_data",
    hint: "Trigger nadir payload capture and ingest raw scene into the Orbital AI Compute Rack.",
  },
  {
    id: "send",
    label: "Downlink / ISL",
    icon: "antenna",
    cost: 50,
    actionType: "downlink_data",
    hint: "Transmit compressed AI vector alerts and science telemetry to Earth.",
  },
  {
    id: "save-power",
    label: "Eco AI Mode",
    icon: "leaf",
    cost: 0,
    actionType: "set_power_mode",
    params: { mode: "eco" },
    hint: "Throttle neural compute blades to 15 W Eco profile to preserve battery during eclipse.",
  },
  {
    id: "full-power",
    label: "Full AI Compute",
    icon: "zap",
    cost: 0,
    actionType: "set_power_mode",
    params: { mode: "normal" },
    hint: "Engage full 24-TOPS neural inference and maximum payload duty cycle.",
  },
  {
    id: "safe-mode",
    label: "Radiation Safe",
    icon: "shield",
    cost: 0,
    actionType: "enter_safe_mode",
    hint: "Engage TMR radiation shielding and survival power posture during solar proton storms.",
  },
  {
    id: "boost",
    label: "Prograde Burn",
    icon: "rocket",
    cost: 200,
    actionType: "fire_thruster",
    params: { delta_v_ms: 10, direction: "prograde" },
    hint: "Fire ion thruster (+10 m/s Δv) to raise orbital altitude and widen nadir swath.",
  },
];

// ── Events in kid language ──────────────────────────────────────────────────

const EVENT_EMOJI: Record<string, string> = {
  battery: "🔋",
  thermal: "🌡️",
  eclipse: "🌙",
  comms: "📡",
  storage: "💾",
  workload: "🤖",
  radiation: "☀️",
  fault: "🔧",
  observation: "📸",
  orbit: "🚀",
};

/** Pick a friendly emoji for an event from its name/description. */
export function eventEmoji(name: string): string {
  const hay = name.toLowerCase();
  for (const [key, emoji] of Object.entries(EVENT_EMOJI)) {
    if (hay.includes(key)) return emoji;
  }
  if (hay.includes("sun") || hay.includes("solar")) return "☀️";
  if (hay.includes("power")) return "🔋";
  return "⚠️";
}

export interface KidEventChoice {
  id: string;
  label: string;
  /** `description` may contain engineer phrasing — shown as smaller subtext. */
  subtext: string;
}

export interface KidEvent {
  id: string;
  emoji: string;
  title: string;
  text: string;
  urgent: boolean;
  choices: KidEventChoice[];
}

const URGENT_WORDS = ["critical", "emergency", "immediate", "failure", "loss"];

/** Map a backend ActiveEvent to the big popup card content. */
export function kidEvent(ev: {
  event_id: string;
  name: string;
  description: string;
  severity: string;
  choices: Array<{ id: string; label: string; description: string }>;
}): KidEvent {
  return {
    id: ev.event_id,
    emoji: eventEmoji(ev.name),
    title: ev.name,
    text: ev.description,
    urgent: URGENT_WORDS.some((w) => ev.severity.toLowerCase().includes(w)) ||
      ev.severity.toLowerCase() === "critical",
    choices: ev.choices.map((c) => ({
      id: c.id,
      label: c.label,
      subtext: c.description,
    })),
  };
}

// ── Lumi the helper bot ─────────────────────────────────────────────────────

export interface LumiTip {
  text: string;
  kind: "tip" | "advice" | "cheer" | "alert";
}

/** Ambient tip from the current flight situation (no AI call needed). */
export function situationTip(
  gauges: KidGauge[],
  state: GameStateSummary | null,
  inEclipse: boolean
): LumiTip | null {
  const worst = worstGauge(gauges);
  if (worst?.status === "bad") {
    return {
      text:
        worst.id === "battery"
          ? "Battery is almost empty! Press Save Power — and maybe Safe Mode if it keeps dropping."
          : worst.id === "memory"
            ? "Memory is almost full! Send Data Home before photos get lost."
            : worst.id === "health"
              ? "The spaceship is badly hurt. Try Safe Mode to protect it."
              : worst.line,
      kind: "alert",
    };
  }
  if (inEclipse && worst?.id === "battery") {
    return {
      text: "Transiting Earth's umbra shadow — solar arrays are offline; running on Li-Ion reserve.",
      kind: "tip",
    };
  }
  if (worst?.status === "warn") return { text: worst.line, kind: "tip" };
  if (state && state.active_event_count > 0) {
    return { text: "Orbital anomaly detected — review the Tactical Decision Card!", kind: "alert" };
  }
  if (state && state.objectives_total > 0 && state.objectives_complete === state.objectives_total) {
    return { text: "All primary mission objectives complete! Maintain orbital stability until window end.", kind: "cheer" };
  }
  return { text: "All systems happy and nominal — capture target telemetry and downlink via ground pass or ISL relay.", kind: "cheer" };
}

// ── Onboarding tips ─────────────────────────────────────────────────────────

const TIP_SEEN_KEY = "lumenos.cadetTipsSeen";
const TIPS: string[] = [
  "Engage Play ▶ or time-warp (1×/2×/5×) to propagate your Sun-Synchronous Orbit around Earth.",
  "Trigger Sensor Capture 📸 when the nadir footprint cone locks onto an active crisis zone.",
  "Execute Downlink / ISL 📡 during ground-station contact or via the 1550 nm Optical Relay Constellation.",
  "Monitor Battery SoC 🔋 and Radiator Temp 🌡️ — switch to Eco AI Mode 🌿 during eclipse transits.",
  "When an orbital anomaly or solar flare occurs, evaluate the physics trade-offs in the decision card.",
  "LumenOS Predictive AI 🤖 runs a 5-minute ODE lookahead to flag thermal or battery hazards before they hit.",
];

/** First-flight onboarding: one tip at a time, only on the first flight. */
export function nextOnboardingTip(): string | null {
  try {
    if (localStorage.getItem(TIP_SEEN_KEY)) return null;
    const shown = Number(localStorage.getItem(TIP_SEEN_KEY + ".idx") ?? "0");
    if (shown >= TIPS.length) {
      localStorage.setItem(TIP_SEEN_KEY, "done");
      return null;
    }
    localStorage.setItem(TIP_SEEN_KEY + ".idx", String(shown + 1));
    return TIPS[shown];
  } catch {
    return null;
  }
}

/** Mark onboarding finished (called when the player skips or finishes). */
export function finishOnboarding(): void {
  try {
    localStorage.setItem(TIP_SEEN_KEY, "done");
  } catch {
    /* ignore */
  }
}

// ── Score story ─────────────────────────────────────────────────────────────

export interface KidScoreStory {
  stars: number;
  headline: string;
  sentence: string;
}

const WIN_HEADLINES = [
  "Mission Complete!",
  "You did it, Cadet!",
  "Amazing flying!",
];
const PARTIAL_HEADLINES = ["Good flight!", "Almost there!"];
const FAIL_HEADLINES = ["Tough flight!", "Space is tricky!"];

/**
 * Turn the score endpoint's causes into a kid story.
 * `causes` come from ScoreResponse success_failure_causes / primary_cause.
 */
export function kidScoreStory(
  outcome: string | null,
  scorePct: number,
  causes: string[],
  primaryCause: string | null
): KidScoreStory {
  const o = (outcome ?? "").toUpperCase();
  const stars = scorePct >= 90 ? 3 : scorePct >= 70 ? 2 : scorePct >= 50 ? 1 : 0;
  let headline: string;
  if (o === "WIN") headline = WIN_HEADLINES[stars % WIN_HEADLINES.length];
  else if (o === "PARTIAL_SUCCESS") headline = PARTIAL_HEADLINES[0];
  else headline = FAIL_HEADLINES[0];

  const firstGood = causes.find((c) => !/fail|loss|critical|collapse/i.test(c));
  const sentence =
    (o === "WIN" ? "You " : "") +
    (firstGood ? firstGood.charAt(0).toLowerCase() + firstGood.slice(1) : "") ||
    (primaryCause ? "Mission ended: " + primaryCause : "") ||
    "Great effort up in space, Cadet!";
  return { stars, headline, sentence };
}

// ── Time formatting ─────────────────────────────────────────────────────────

/** Elapsed sim time as a friendly mission clock: "1h 23m" / "45m". */
export function missionClock(elapsedSeconds: number): string {
  const totalMin = Math.floor(elapsedSeconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
