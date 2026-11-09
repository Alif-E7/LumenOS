import { useState } from "react";
import type { LumiTip } from "../../lib/kid";

export interface LumiAdvice {
  recommendationId: string;
  title: string;
  explanation: string;
  benefit: string;
}

const KIND_STYLES = {
  tip: "border-sky-400/40 text-sky-200",
  alert: "border-red-400/50 text-red-200",
  cheer: "border-emerald-400/40 text-emerald-200",
  advice: "border-violet-400/40 text-violet-200",
} as const;

/**
 * Lumi — the helper robot. Shows ambient flight tips and (when available)
 * the predictive advisory's plain-language suggestion with a
 * "Do it for me!" button that accepts the recommendation server-side.
 */
export function LumiBot({
  tip,
  advice,
  onAcceptAdvice,
  busy,
}: {
  tip: LumiTip | null;
  advice: LumiAdvice | null;
  onAcceptAdvice: (recommendationId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [dismissedAdvice, setDismissedAdvice] = useState<string | null>(null);

  const showAdvice = advice && advice.recommendationId !== dismissedAdvice;

  return (
    <div className="pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-void/80 backdrop-blur-md rounded-full border border-violet-400/40 px-3 py-2 shadow-lg hover:border-violet-300/60 transition-colors"
        aria-expanded={open}
        aria-label="Lumi the helper robot"
      >
        <span className={`text-2xl ${busy ? "animate-spin" : open ? "" : "animate-bounce"}`}>
          {busy ? "⏳" : "🤖"}
        </span>
        <span className="text-xs font-bold text-violet-200 pr-1">Lumi</span>
      </button>

      {open && (tip || showAdvice) && (
        <div className="mt-2 w-72 space-y-2 max-h-56 overflow-y-auto">
          {showAdvice && advice && (
            <div className={`bg-void/90 backdrop-blur-md rounded-2xl border p-3 shadow-lg ${KIND_STYLES.advice}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
                💡 Lumi's idea
              </div>
              <div className="text-sm font-bold text-ink mt-0.5">{advice.title}</div>
              <p className="text-xs text-muted mt-1 leading-relaxed">{advice.explanation}</p>
              {advice.benefit && (
                <p className="text-[11px] text-emerald-300/90 mt-1">✅ {advice.benefit}</p>
              )}
              <div className="flex gap-2 mt-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onAcceptAdvice(advice.recommendationId)}
                  className="flex-1 rounded-full bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-xs font-bold py-1.5 px-3 transition-colors"
                >
                  Do it for me!
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedAdvice(advice.recommendationId)}
                  className="rounded-full border border-edge text-muted hover:text-ink text-xs font-bold py-1.5 px-3 transition-colors"
                >
                  No thanks
                </button>
              </div>
            </div>
          )}
          {tip && (
            <div className={`bg-void/90 backdrop-blur-md rounded-2xl border p-3 shadow-lg ${KIND_STYLES[tip.kind]}`}>
              <p className="text-xs leading-relaxed text-ink/90">{tip.text}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
