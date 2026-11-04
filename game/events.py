"""
Event Director — Seeded event scheduling with cue→choice→consequence pipeline.

Events are drawn from the mission's event pool using a seeded RNG so that
the same seed always produces the same event sequence. The pipeline:

  1. CUE — An event fires: players see a description + severity.
  2. EXPLANATION — Context is provided so the choice is educational.
  3. CHOICES — Players pick from described options with stated consequences.
  4. CONSEQUENCE — The chosen option's effects are applied to simulation state.

Fair event rules:
  - No more than MAX_CONCURRENT_EVENTS active at once
  - Cooldown period between events of the same type
  - Critical events have a minimum spacing
  - Events respect their earliest/latest step windows
"""

from __future__ import annotations

import random
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from api.models.mission import EventSeverity, MissionEventTemplate, EventChoice


# ── Event lifecycle ──────────────────────────────────────────────────────────


class EventPhase(str, Enum):
    """Phases of the event lifecycle."""
    CUE = "cue"                 # Event just triggered
    AWAITING_CHOICE = "awaiting_choice"  # Waiting for player decision
    RESOLVED = "resolved"       # Player made a choice (or auto-resolved)
    EXPIRED = "expired"         # Auto-resolved after timeout


class ActiveEvent(BaseModel):
    """A live event instance in the game."""
    event_id: str
    template_id: str
    name: str
    description: str
    severity: EventSeverity
    phase: EventPhase = EventPhase.CUE
    triggered_step: int
    deadline_step: int
    choices: list[EventChoice] = Field(default_factory=list)
    chosen_id: Optional[str] = None
    effects_applied: dict[str, float] = Field(default_factory=dict)
    auto_resolve_steps: int = 5

    @property
    def is_pending(self) -> bool:
        return self.phase in (EventPhase.CUE, EventPhase.AWAITING_CHOICE)


class EventConsequence(BaseModel):
    """The result of resolving an event."""
    event_id: str
    choice_id: Optional[str]
    choice_label: str
    effects: dict[str, float]
    description: str


# ── Fair event rules ─────────────────────────────────────────────────────────

MAX_CONCURRENT_EVENTS = 3
MIN_CRITICAL_SPACING = 60    # minimum steps between critical events
EVENT_COOLDOWN = 30          # minimum steps between same-type events


# ── Event Director ───────────────────────────────────────────────────────────


class EventDirector:
    """
    Manages the event lifecycle for a mission.

    Uses a seeded RNG for deterministic event scheduling.
    Enforces fair event rules to prevent event-storming.
    """

    def __init__(
        self,
        event_pool: list[MissionEventTemplate],
        seed: int = 42,
        max_steps: int = 1440,
    ):
        self._pool = {e.id: e for e in event_pool}
        self._rng = random.Random(seed)
        self._max_steps = max_steps

        # State
        self._active_events: list[ActiveEvent] = []
        self._resolved_events: list[ActiveEvent] = []
        self._event_counter = 0
        self._last_trigger_by_template: dict[str, int] = {}
        self._last_critical_step: int = -MIN_CRITICAL_SPACING  # allow first critical

    @property
    def active_events(self) -> list[ActiveEvent]:
        return list(self._active_events)

    @property
    def resolved_events(self) -> list[ActiveEvent]:
        return list(self._resolved_events)

    @property
    def all_events(self) -> list[ActiveEvent]:
        return self._active_events + self._resolved_events

    def tick(self, current_step: int) -> list[ActiveEvent]:
        """
        Advance the event system by one step.

        Returns newly triggered events this step.
        """
        new_events: list[ActiveEvent] = []

        # 1. Auto-resolve expired events
        self._auto_resolve_expired(current_step)

        # 2. Try to trigger new events from the pool
        if len(self._active_events) < MAX_CONCURRENT_EVENTS:
            for template in self._pool.values():
                if self._should_trigger(template, current_step):
                    event = self._create_event(template, current_step)
                    self._active_events.append(event)
                    new_events.append(event)
                    self._last_trigger_by_template[template.id] = current_step
                    if template.severity == EventSeverity.CRITICAL:
                        self._last_critical_step = current_step

                    # Respect concurrent limit
                    if len(self._active_events) >= MAX_CONCURRENT_EVENTS:
                        break

        return new_events

    def resolve_event(
        self,
        event_id: str,
        choice_id: str,
    ) -> Optional[EventConsequence]:
        """
        Resolve an active event with the player's chosen response.

        Returns the consequence, or None if event not found / already resolved.
        """
        for i, event in enumerate(self._active_events):
            if event.event_id == event_id and event.is_pending:
                # Find the chosen option
                choice = None
                for c in event.choices:
                    if c.id == choice_id:
                        choice = c
                        break

                if choice is None:
                    return None

                # Apply
                event.chosen_id = choice_id
                event.phase = EventPhase.RESOLVED
                event.effects_applied = dict(choice.effects)

                # Move to resolved
                self._active_events.pop(i)
                self._resolved_events.append(event)

                return EventConsequence(
                    event_id=event_id,
                    choice_id=choice_id,
                    choice_label=choice.label,
                    effects=dict(choice.effects),
                    description=choice.description,
                )

        return None

    def _should_trigger(self, template: MissionEventTemplate, step: int) -> bool:
        """Determine if an event template should trigger this step, respecting fair rules."""
        # Step window check
        if step < template.earliest_step:
            return False
        if template.latest_step >= 0 and step > template.latest_step:
            return False

        # Cooldown check
        last = self._last_trigger_by_template.get(template.id, -EVENT_COOLDOWN)
        if step - last < EVENT_COOLDOWN:
            return False

        # Critical spacing check
        if template.severity == EventSeverity.CRITICAL:
            if step - self._last_critical_step < MIN_CRITICAL_SPACING:
                return False

        # Already active check
        if any(e.template_id == template.id and e.is_pending for e in self._active_events):
            return False

        # Probability roll (seeded)
        return self._rng.random() < template.probability

    def _create_event(self, template: MissionEventTemplate, step: int) -> ActiveEvent:
        """Create a new ActiveEvent instance from a template."""
        self._event_counter += 1
        return ActiveEvent(
            event_id=f"evt_{self._event_counter:04d}",
            template_id=template.id,
            name=template.name,
            description=template.description,
            severity=template.severity,
            phase=EventPhase.AWAITING_CHOICE,
            triggered_step=step,
            deadline_step=step + template.auto_resolve_steps,
            choices=list(template.choices),
            auto_resolve_steps=template.auto_resolve_steps,
        )

    def _auto_resolve_expired(self, current_step: int) -> None:
        """Auto-resolve events that have passed their deadline."""
        still_active: list[ActiveEvent] = []
        for event in self._active_events:
            if event.is_pending and current_step >= event.deadline_step:
                event.phase = EventPhase.EXPIRED
                # Pick the first choice as default, or no effects
                if event.choices:
                    default = event.choices[0]
                    event.chosen_id = default.id
                    event.effects_applied = dict(default.effects)
                self._resolved_events.append(event)
            else:
                still_active.append(event)
        self._active_events = still_active
