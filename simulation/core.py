"""
Simulation Core — Deterministic, seeded mission simulation runner.

This module composes all physics models (orbital, thermal, power, comms,
storage) into a single step-based simulation loop. Every step is
deterministic given the same seed and action sequence.

The simulation engine is GAME-LAYER INDEPENDENT. It knows nothing about
objectives, scoring, progression, or roles. The game layer reads simulation
state and decides consequences separately.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any

from simulation.physics.orbital import OrbitalElements, OrbitalModel, OrbitalState
from simulation.physics.power import PowerConfig, PowerModel, PowerState
from simulation.physics.thermal import ThermalConfig, ThermalModel, ThermalState
from simulation.physics.comms import CommsConfig, CommsModel, CommsState
from simulation.physics.storage import (
    StorageConfig, StorageModel, StorageState,
    WorkloadConfig, WorkloadModel, WorkloadState,
)


@dataclass
class SpacecraftConfig:
    """Complete spacecraft configuration for simulation."""
    name: str = "Default Orbiter"
    orbital: OrbitalElements = field(default_factory=lambda: OrbitalElements(
        semi_major_axis_km=6371.0 + 700.0,
    ))
    power: PowerConfig = field(default_factory=PowerConfig)
    thermal: ThermalConfig = field(default_factory=ThermalConfig)
    comms: CommsConfig = field(default_factory=CommsConfig)
    storage: StorageConfig = field(default_factory=StorageConfig)
    workload: WorkloadConfig = field(default_factory=WorkloadConfig)

    # Payload
    payload_power_w: float = 80.0
    payload_data_rate_mb_per_min: float = 5.0   # MB per minute when active
    payload_active: bool = True


@dataclass
class SimulationSnapshot:
    """Complete snapshot of all subsystem states at a simulation step."""
    step: int
    elapsed_seconds: float
    status: str                        # "running" | "completed"
    orbital: OrbitalState
    power: PowerState
    thermal: ThermalState
    comms: CommsState
    storage: StorageState
    workload: WorkloadState
    spacecraft_health_pct: float       # Aggregate health metric


@dataclass
class SimulationConfig:
    """Configuration for a simulation run."""
    seed: int = 42
    time_step_seconds: float = 60.0
    max_steps: int = 1440              # 24 hours at 1-min steps


@dataclass
class SimulationRunner:
    """
    Step-based simulation runner that composes all physics models.

    Uses a seeded RNG for deterministic, reproducible results.
    All physics models receive the same environmental conditions.

    The runner is stateful — call step() repeatedly to advance time.
    Call reset() to return to initial conditions.
    """
    config: SimulationConfig = field(default_factory=SimulationConfig)
    spacecraft: SpacecraftConfig = field(default_factory=SpacecraftConfig)

    # Physics models (initialised in __post_init__)
    _orbital: OrbitalModel = field(init=False, repr=False)
    _power: PowerModel = field(init=False, repr=False)
    _thermal: ThermalModel = field(init=False, repr=False)
    _comms: CommsModel = field(init=False, repr=False)
    _storage: StorageModel = field(init=False, repr=False)
    _workload: WorkloadModel = field(init=False, repr=False)

    _rng: random.Random = field(init=False, repr=False)
    _step: int = field(default=0, init=False)
    _history: list[SimulationSnapshot] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self):
        self._rng = random.Random(self.config.seed)
        self._init_models()

    def _init_models(self):
        """Initialise all physics models from spacecraft config."""
        self._orbital = OrbitalModel(elements=OrbitalElements(
            semi_major_axis_km=self.spacecraft.orbital.semi_major_axis_km,
            eccentricity=self.spacecraft.orbital.eccentricity,
            inclination_deg=self.spacecraft.orbital.inclination_deg,
            raan_deg=self.spacecraft.orbital.raan_deg,
            arg_periapsis_deg=self.spacecraft.orbital.arg_periapsis_deg,
            mean_anomaly_deg=self.spacecraft.orbital.mean_anomaly_deg,
        ))
        self._power = PowerModel(config=self.spacecraft.power)
        self._thermal = ThermalModel(config=self.spacecraft.thermal)
        self._comms = CommsModel(config=self.spacecraft.comms)
        self._storage = StorageModel(config=self.spacecraft.storage)
        self._workload = WorkloadModel(config=self.spacecraft.workload)

    @property
    def current_step(self) -> int:
        return self._step

    @property
    def elapsed_seconds(self) -> float:
        return self._step * self.config.time_step_seconds

    @property
    def rng(self) -> random.Random:
        """Expose RNG for game layer to use (preserves determinism)."""
        return self._rng

    @property
    def history(self) -> list[SimulationSnapshot]:
        return self._history

    def reset(self, seed: int | None = None) -> None:
        """Reset simulation to initial state, optionally with a new seed."""
        if seed is not None:
            self.config.seed = seed
        self._rng = random.Random(self.config.seed)
        self._step = 0
        self._history = []
        self._init_models()

    def apply_action(self, action: dict[str, Any]) -> dict[str, Any]:
        """
        Apply a player/game action to the simulation state.

        Actions modify subsystem parameters. The simulation engine
        executes changes but does not judge them — that's the game layer's job.

        Returns a dict describing what changed.
        """
        result: dict[str, Any] = {"applied": True, "changes": []}

        action_type = action.get("type", "")

        if action_type == "set_payload_active":
            self.spacecraft.payload_active = action.get("active", True)
            result["changes"].append(f"payload_active={self.spacecraft.payload_active}")

        elif action_type == "shed_load":
            name = action.get("load_name", "")
            ok = self._power.shed_load(name)
            result["changes"].append(f"shed_load={name}, success={ok}")

        elif action_type == "restore_load":
            name = action.get("load_name", "")
            ok = self._power.restore_load(name)
            result["changes"].append(f"restore_load={name}, success={ok}")

        elif action_type == "adjust_radiator":
            delta = action.get("delta_m2", 0.0)
            self._thermal.config.radiator_area_m2 = max(
                0.1, self._thermal.config.radiator_area_m2 + delta
            )
            result["changes"].append(
                f"radiator_area={self._thermal.config.radiator_area_m2:.2f}"
            )

        elif action_type == "adjust_transmit_power":
            delta = action.get("delta_w", 0.0)
            self._comms.config.transmit_power_w = max(
                1.0, self._comms.config.transmit_power_w + delta
            )
            result["changes"].append(
                f"transmit_power={self._comms.config.transmit_power_w:.1f}"
            )

        elif action_type == "purge_storage":
            amount = action.get("amount_mb", 0.0)
            purged = self._storage.read(amount)
            result["changes"].append(f"purged_mb={purged:.1f}")

        else:
            result["applied"] = False
            result["changes"].append(f"unknown_action_type={action_type}")

        return result

    def step(self) -> SimulationSnapshot:
        """
        Advance simulation by one time step.

        Evaluates all physics models in order:
        1. Orbital propagation
        2. Power generation and consumption
        3. Thermal heat balance
        4. Communications and downlink
        5. Storage and workload
        6. Aggregate health assessment
        """
        self._step += 1
        dt = self.config.time_step_seconds
        t = self.elapsed_seconds

        # 1. Orbital
        orb_state = self._orbital.propagate(t)

        # 2. Power
        power_state = self._power.step(
            dt_seconds=dt,
            in_eclipse=orb_state.in_eclipse,
            sun_angle_deg=0.0,  # simplified: assume tracking
        )

        # 3. Thermal
        internal_heat = power_state.total_load_w * 0.7  # ~70% of power becomes heat
        thermal_state = self._thermal.step(
            dt_seconds=dt,
            in_eclipse=orb_state.in_eclipse,
            altitude_km=orb_state.altitude_km,
            internal_power_w=internal_heat,
        )

        # 4. Payload data collection
        if self.spacecraft.payload_active and not power_state.power_critical:
            data_mb = self.spacecraft.payload_data_rate_mb_per_min * (dt / 60.0)
            self._storage.write(data_mb)
            self._comms.collect_data(data_mb)

        # 5. Communications
        comms_state = self._comms.step(
            dt_seconds=dt,
            sat_lat=orb_state.latitude_deg,
            sat_lon=orb_state.longitude_deg,
            sat_alt_km=orb_state.altitude_km,
            transmitting=True,
        )

        # 6. Storage & Workload
        storage_state = self._storage.state
        workload_state = self._workload.compute_workload(
            payload_active=self.spacecraft.payload_active,
            data_processing_active=True,
        )

        # 7. Aggregate health
        health = self._compute_health(power_state, thermal_state, comms_state)

        status = "running" if self._step < self.config.max_steps else "completed"

        snapshot = SimulationSnapshot(
            step=self._step,
            elapsed_seconds=t,
            status=status,
            orbital=orb_state,
            power=power_state,
            thermal=thermal_state,
            comms=comms_state,
            storage=storage_state,
            workload=workload_state,
            spacecraft_health_pct=health,
        )

        self._history.append(snapshot)
        return snapshot

    def _compute_health(
        self,
        power: PowerState,
        thermal: ThermalState,
        comms: CommsState,
    ) -> float:
        """
        Compute aggregate spacecraft health percentage.
        Penalises for out-of-range conditions.
        """
        health = 100.0

        # Power penalties
        if power.power_critical:
            health -= 30.0
        elif power.low_power_warning:
            health -= 10.0

        # Thermal penalties
        if thermal.overtemp_warning:
            health -= 20.0
        if thermal.undertemp_warning:
            health -= 15.0

        # Comms penalties
        if comms.buffer_full_warning:
            health -= 5.0

        return max(0.0, min(100.0, health))

    def get_snapshot(self) -> SimulationSnapshot | None:
        """Get the most recent snapshot, or None if not yet stepped."""
        return self._history[-1] if self._history else None
