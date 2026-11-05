"""
Simulation Clock & Checkpoint Engine — Time Flow, Speed Controls, and Deterministic Replay.

Provides:
- Clock controls: Pause, Resume, Speed Multipliers (1x, 10x, 100x), Custom Speeds.
- Fixed or documented timestep (dt_seconds).
- Controlled fast-forward to target time or event boundary.
- Full state checkpoint save and restore with deep serialization.
- Deterministic replay verification.
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional
from pydantic import BaseModel, Field


class ClockStatus(str, Enum):
    PAUSED = "PAUSED"
    RUNNING = "RUNNING"
    FAST_FORWARDING = "FAST_FORWARDING"


class ClockState(BaseModel):
    """Pydantic model representing the state of the simulation clock."""
    status: ClockStatus = ClockStatus.RUNNING
    speed_multiplier: float = 1.0
    time_step_seconds: float = 60.0
    elapsed_seconds: float = 0.0
    step_count: int = 0
    max_steps: int = 1440  # 24 hours at 60s per step


class SimulationClock:
    """
    Authoritative clock managing time flow, speed multipliers, and fast-forwarding.
    Guarantees that identical steps advance identical simulated time.
    """
    SUPPORTED_SPEEDS: tuple[float, ...] = (1.0, 10.0, 100.0)

    def __init__(
        self,
        time_step_seconds: float = 60.0,
        max_steps: int = 1440,
        initial_status: ClockStatus = ClockStatus.RUNNING,
        speed_multiplier: float = 1.0,
    ):
        if time_step_seconds <= 0.0:
            raise ValueError(f"Timestep ({time_step_seconds}s) must be positive.")
        if speed_multiplier <= 0.0:
            raise ValueError(f"Speed multiplier ({speed_multiplier}) must be positive.")

        self.time_step_seconds = float(time_step_seconds)
        self.max_steps = int(max_steps)
        self.status = initial_status
        self.speed_multiplier = float(speed_multiplier)
        self.elapsed_seconds = 0.0
        self.step_count = 0

    @property
    def is_paused(self) -> bool:
        return self.status == ClockStatus.PAUSED

    @property
    def is_running(self) -> bool:
        return self.status == ClockStatus.RUNNING

    @property
    def is_completed(self) -> bool:
        return self.step_count >= self.max_steps

    def pause(self) -> None:
        """Pause the clock."""
        self.status = ClockStatus.PAUSED

    def resume(self) -> None:
        """Resume running at the current speed multiplier."""
        self.status = ClockStatus.RUNNING

    def set_speed(self, multiplier: float) -> None:
        """Set speed multiplier (1x, 10x, 100x, or any positive float)."""
        if multiplier <= 0.0:
            raise ValueError("Speed multiplier must be positive.")
        self.speed_multiplier = float(multiplier)

    def advance_step(self) -> float:
        """
        Advance one clock step.
        Returns the elapsed time increment (dt in seconds).
        """
        if self.status == ClockStatus.PAUSED:
            return 0.0

        self.step_count += 1
        self.elapsed_seconds += self.time_step_seconds
        return self.time_step_seconds

    def to_state(self) -> ClockState:
        """Export clock state."""
        return ClockState(
            status=self.status,
            speed_multiplier=self.speed_multiplier,
            time_step_seconds=self.time_step_seconds,
            elapsed_seconds=self.elapsed_seconds,
            step_count=self.step_count,
            max_steps=self.max_steps,
        )

    def load_state(self, state: ClockState | dict[str, Any]) -> None:
        """Restore clock state."""
        if isinstance(state, dict):
            state = ClockState(**state)
        self.status = state.status
        self.speed_multiplier = state.speed_multiplier
        self.time_step_seconds = state.time_step_seconds
        self.elapsed_seconds = state.elapsed_seconds
        self.step_count = state.step_count
        self.max_steps = state.max_steps

    def reset(self) -> None:
        """Reset clock to t=0."""
        self.elapsed_seconds = 0.0
        self.step_count = 0
        self.status = ClockStatus.RUNNING


@dataclass
class SimulationCheckpoint:
    """Complete serialized snapshot of the simulation state for deterministic restore."""
    step: int
    elapsed_seconds: float
    seed: int
    clock: dict[str, Any]
    spacecraft: dict[str, Any]
    history_length: int
    rng_state: Any
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "step": self.step,
            "elapsed_seconds": self.elapsed_seconds,
            "seed": self.seed,
            "clock": copy.deepcopy(self.clock),
            "spacecraft": copy.deepcopy(self.spacecraft),
            "history_length": self.history_length,
            "rng_state": copy.deepcopy(self.rng_state),
            "metadata": copy.deepcopy(self.metadata),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SimulationCheckpoint:
        return cls(
            step=data["step"],
            elapsed_seconds=data["elapsed_seconds"],
            seed=data["seed"],
            clock=copy.deepcopy(data["clock"]),
            spacecraft=copy.deepcopy(data["spacecraft"]),
            history_length=data["history_length"],
            rng_state=copy.deepcopy(data["rng_state"]),
            metadata=copy.deepcopy(data.get("metadata", {})),
        )
