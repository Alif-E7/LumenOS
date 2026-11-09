import type { KidEvent } from "../../lib/kid";

/**
 * Center-screen event popup — the kid's decision moment.
 * One big card: emoji, plain title, one-line story, 2–3 giant choices.
 */
export function EventPopup({
  event,
  onChoose,
  busy,
}: {
  event: KidEvent;
  onChoose: (choiceId: string) => void;
  busy: boolean;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-void/60 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-label={event.title}
        className={`w-full max-w-lg rounded-3xl border-2 p-6 shadow-2xl bg-panel ${
          event.urgent
            ? "border-red-400/60 shadow-red-500/20 animate-[pulse_2s_ease-in-out_infinite]"
            : "border-amber-400/50 shadow-amber-400/10"
        }`}
      >
        <div className="flex items-start gap-4">
          <div className="text-5xl select-none">{event.emoji}</div>
          <div className="flex-1">
            <div
              className={`text-[11px] font-bold uppercase tracking-wider ${
                event.urgent ? "text-red-300" : "text-amber-300"
              }`}
            >
              {event.urgent ? "⚠️ Urgent!" : "✨ Something happened!"}
            </div>
            <h2 className="text-xl font-bold text-ink mt-0.5">{event.title}</h2>
            <p className="text-sm text-muted mt-1.5 leading-relaxed">{event.text}</p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {event.choices.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => onChoose(c.id)}
              className="w-full text-left rounded-2xl border border-edge bg-panel/80 hover:bg-raised hover:border-accent/50 transition-colors px-4 py-3 disabled:opacity-50 disabled:cursor-wait"
            >
              <div className="text-base font-bold text-ink">{c.label}</div>
              {c.subtext && <div className="text-xs text-muted mt-0.5">{c.subtext}</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
