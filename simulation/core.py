"""
Simulation Core — Deterministic, seeded mission simulation runner.

This module composes all physics models (orbital, thermal, power, comms,
storage, space environment) and the simulation clock into a single
deterministic, checkpointable step-based simulation loop.

Every step is bit-exact and deterministic given the same seed and action sequence.
"""

from __future__ import annotations

import copy
import math
import random
from dataclasses import dataclass, field
from typing import Any, Optional

from simulation.physics.orbital import (
    OrbitalElements,
    OrbitalModel,
    OrbitalState,
    GroundTarget,
)
from simulation.physics.power import PowerConfig, PowerModel, PowerState
from simulation.physics.thermal import ThermalConfig, ThermalModel, ThermalState
from simulation.physics.comms import CommsConfig, CommsModel, CommsState
from simulation.physics.storage import (
    StorageConfig, StorageModel, StorageState,
    WorkloadConfig, WorkloadModel, WorkloadState,
)
from simulation.environment import (
    EnvironmentConfig,
    SpaceEnvironmentModel,
    EnvironmentState,
)
from simulation.clock import (
    SimulationClock,
    ClockStatus,
    SimulationCheckpoint,
)
from simulation.timeline import (
    TimelineEvent,
    TimelineEventType,
    TimelineForecastEngine,
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
    environment: Optional[EnvironmentState] = None
    active_targets: list[str] = field(default_factory=list)


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

    Features:
    - Integrated SimulationClock (pause, resume, 1x, 10x, 100x speed multipliers).
    - Environment model (solar flux, Earth IR, albedo, SAA radiation, atmospheric drag).
    - Target observation tracking and swath intersection.
    - Checkpoint save / restore with bit-exact reproducibility.
    - Controlled fast-forward to future time or timeline event.
    - Forward timeline event forecasting with epistemic barrier protection.
    """
    config: SimulationConfig = field(default_factory=SimulationConfig)
    spacecraft: SpacecraftConfig = field(default_factory=SpacecraftConfig)
    targets: list[GroundTarget] = field(default_factory=list)

    # Physics models (initialised in __post_init__)
    _orbital: OrbitalModel = field(init=False, repr=False)
    _power: PowerModel = field(init=False, repr=False)
    _thermal: ThermalModel = field(init=False, repr=False)
    _comms: CommsModel = field(init=False, repr=False)
    _storage: StorageModel = field(init=False, repr=False)
    _workload: WorkloadModel = field(init=False, repr=False)
    _environment: SpaceEnvironmentModel = field(init=False, repr=False)

    clock: SimulationClock = field(init=False, repr=False)
    _rng: random.Random = field(init=False, repr=False)
    _step: int = field(default=0, init=False)
    _history: list[SimulationSnapshot] = field(default_factory=list, init=False, repr=False)
    _action_history: list[dict[str, Any]] = field(default_factory=list, init=False, repr=False)

    def __post_init__(self):
        self._rng = random.Random(self.config.seed)
        self.clock = SimulationClock(
            time_step_seconds=self.config.time_step_seconds,
            max_steps=self.config.max_steps,
        )
        self._environment = SpaceEnvironmentModel()
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
            epoch_seconds=self.spacecraft.orbital.epoch_seconds,
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

    def get_snapshot(self) -> Optional[SimulationSnapshot]:
        """Return the most recent snapshot, or None if simulation hasn't started."""
        return self._history[-1] if self._history else None

    def reset(self, seed: int | None = None) -> None:
        """Reset simulation to initial state, optionally with a new seed."""
        if seed is not None:
            self.config.seed = seed
        self._rng = random.Random(self.config.seed)
        self._step = 0
        self._history = []
        self._action_history = []
        self.clock.reset()
        self._init_models()

    def apply_action(self, action: dict[str, Any]) -> dict[str, Any]:
        """
        Apply a player/game action to the simulation state.
        Executes changes and logs the action for deterministic replay.
        """
        result: dict[str, Any] = {"applied": True, "changes": []}
        action_type = action.get("type", "")

        if action_type == "set_payload_active":
            self.spacecraft.payload_active = action.get("active", True)
            result["changes"].append(f"payload_active={self.spacecraft.payload_active}")

        elif action_type == "shed_load":
            load_name = action.get("load_name", "")
            self._power.shed_load(load_name)
            result["changes"].append(f"shed_load={load_name}")

        elif action_type == "restore_load":
            load_name = action.get("load_name", "")
            self._power.restore_load(load_name)
            result["changes"].append(f"restore_load={load_name}")

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

        if result["applied"]:
            self._action_history.append({"step": self._step, "action": copy.deepcopy(action)})

        return result

    def step(self, steps: int = 1) -> SimulationSnapshot:
        """
        Advance simulation by one or more time steps.

        Evaluates all physics models in order:
        1. Orbital propagation & 3D position
        2. Environmental conditions (solar flux, Earth IR, albedo, SAA radiation, drag)
        3. Power generation and battery state
        4. Thermal heat balance
        5. Payload data collection & ground contact downlink
        6. Storage and processor workload
        7. Target observation detection
        8. Aggregate health assessment
        """
        last_snapshot: Optional[SimulationSnapshot] = None

        for _ in range(max(1, steps)):
            self._step += 1
            dt = self.config.time_step_seconds
            t = self.elapsed_seconds
            self.clock.advance_step()

            # 1. Orbital propagation
            orb_state = self._orbital.propagate(t)

            # 2. Environmental conditions
            env_state = self._environment.evaluate(
                altitude_km=orb_state.altitude_km,
                latitude_deg=orb_state.latitude_deg,
                longitude_deg=orb_state.longitude_deg,
                velocity_km_s=orb_state.velocity_km_s,
                sunlight_fraction=orb_state.sunlight_fraction,
            )

            # 3. Power
            power_state = self._power.step(
                dt_seconds=dt,
                in_eclipse=orb_state.in_eclipse,
                sun_angle_deg=0.0,
            )

            # 4. Thermal
            internal_heat = power_state.total_load_w * 0.7
            thermal_state = self._thermal.step(
                dt_seconds=dt,
                in_eclipse=orb_state.in_eclipse,
                altitude_km=orb_state.altitude_km,
                internal_power_w=internal_heat,
            )

            # 5. Payload data collection
            if self.spacecraft.payload_active and not power_state.power_critical:
                data_mb = self.spacecraft.payload_data_rate_mb_per_min * (dt / 60.0)
                self._storage.write(data_mb)
                self._comms.collect_data(data_mb)

            # 6. Communications and downlink
            comms_state = self._comms.step(
                dt_seconds=dt,
                sat_lat=orb_state.latitude_deg,
                sat_lon=orb_state.longitude_deg,
                sat_alt_km=orb_state.altitude_km,
                transmitting=True,
            )

            # 7. Storage & Workload
            storage_state = self._storage.state
            workload_state = self._workload.compute_workload(
                payload_active=self.spacecraft.payload_active,
                data_processing_active=True,
            )

            # 8. Ground Target Observation Detection
            active_targets: list[str] = []
            for tgt in self.targets:
                in_fov, _, _ = self._orbital.is_target_in_fov(
                    orb_state.latitude_deg, orb_state.longitude_deg, orb_state.altitude_km,
                    tgt.latitude_deg, tgt.longitude_deg,
                    fov_half_angle_deg=30.0,
                )
                if in_fov:
                    active_targets.append(tgt.name)

            # 9. Aggregate health
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
                environment=env_state,
                active_targets=active_targets,
            )

            self._history.append(snapshot)
            last_snapshot = snapshot

        return last_snapshot or self._history[-1]

    def _compute_health(
        self,
        power: PowerState,
        thermal: ThermalState,
        comms: CommsState,
    ) -> float:
        """Compute aggregate spacecraft health percentage."""
        health = 100.0
        if power.power_critical:
            health -= 30.0
        elif power.low_power_warning:
            health -= 10.0

        if thermal.overtemp_warning:
            health -= 20.0
        if thermal.undertemp_warning:
            health -= 15.0

        if comms.buffer_full_warning:
            health -= 5.0

        return max(0.0, min(100.0, health))

    # ── Simulation Clock Controls ────────────────────────────────────────────

    def pause(self) -> None:
        """Pause the simulation clock."""
        self.clock.pause()

    def resume(self) -> None:
        """Resume running the simulation clock."""
        self.clock.resume()

    def set_speed(self, multiplier: float) -> None:
        """Set simulation speed multiplier (1.0, 10.0, 100.0)."""
        self.clock.set_speed(multiplier)

    # ── Fast-Forward Controls ────────────────────────────────────────────────

    def fast_forward_to_time(self, target_seconds: float) -> SimulationSnapshot:
        """
        Fast-forward simulation until elapsed time reaches or exceeds target_seconds.
        Executes each physics step sequentially to preserve full physical integrity.
        """
        if target_seconds <= self.elapsed_seconds:
            return self.get_snapshot() or self.step()

        dt = self.config.time_step_seconds
        needed_steps = int(math.ceil((target_seconds - self.elapsed_seconds) / dt))
        return self.step(steps=needed_steps)

    def fast_forward_to_event(
        self,
        event_type: TimelineEventType | str,
        horizon_seconds: float = 86400.0,
    ) -> tuple[SimulationSnapshot, Optional[TimelineEvent]]:
        """
        Fast-forward to the next predicted occurrence of a specific timeline event type
        (e.g., next SUNRISE, SUNSET, GROUND_STATION_AOS).
        """
        if isinstance(event_type, str):
            event_type = TimelineEventType(event_type)

        forecast = self.get_forecast_timeline(horizon_seconds=horizon_seconds)
        target_ev = TimelineForecastEngine.get_next_event(
            forecast,
            current_time_seconds=self.elapsed_seconds,
            event_type=event_type,
        )

        if target_ev is None:
            # Advance 1 step if no event found in horizon
            return self.step(), None

        snap = self.fast_forward_to_time(target_ev.timestamp_seconds)
        return snap, target_ev

    # ── Timeline Forecasting ─────────────────────────────────────────────────

    def get_forecast_timeline(self, horizon_seconds: float = 86400.0) -> list[TimelineEvent]:
        """
        Generate deterministic forward timeline forecast starting from current simulated time.
        Protects epistemic barrier: includes only predictable ephemeris and orbital geometry.
        """
        return TimelineForecastEngine.generate_forecast(
            orbital_model=self._orbital,
            ground_stations=self._comms.ground_stations,
            targets=self.targets,
            start_seconds=self.elapsed_seconds,
            horizon_seconds=horizon_seconds,
            time_step_seconds=self.config.time_step_seconds,
        )

    # ── Checkpointing & Deterministic Replay ──────────────────────────────────

    def save_checkpoint(self, metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """
        Capture complete simulation state into a serializable checkpoint dict.
        Allows exact bit-for-bit restoration at a later time.
        """
        checkpoint = {
            "step": self._step,
            "elapsed_seconds": self.elapsed_seconds,
            "seed": self.config.seed,
            "clock": self.clock.to_state().model_dump(),
            "spacecraft_payload_active": self.spacecraft.payload_active,
            "power_state": {
                "battery_soc_wh": self._power.state.battery_soc_wh,
                "solar_output_w": self._power.state.solar_output_w,
                "in_eclipse": self._power.state.in_eclipse,
            },
            "thermal_state": {
                "temperature_k": self._thermal.state.temperature_k,
                "temperature_c": self._thermal.state.temperature_c,
            },
            "comms_state": {
                "data_buffer_mb": self._comms.state.data_buffer_mb,
                "data_collected_mb": self._comms.state.data_collected_mb,
                "data_downlinked_mb": self._comms.state.data_downlinked_mb,
            },
            "storage_state": {
                "used_mb": self._storage.state.used_mb,
                "free_mb": self._storage.state.free_mb,
            },
            "rng_state": self._rng.getstate(),
            "action_history": copy.deepcopy(self._action_history),
            "history_length": len(self._history),
            "metadata": metadata or {},
        }
        return checkpoint

    def load_checkpoint(self, checkpoint: dict[str, Any]) -> None:
        """
        Restore complete simulation state from a checkpoint dict.
        Guarantees that subsequent steps proceed exactly as they would have originally.
        """
        self._step = checkpoint["step"]
        self.config.seed = checkpoint["seed"]
        self.clock.load_state(checkpoint["clock"])
        self.spacecraft.payload_active = checkpoint.get("spacecraft_payload_active", True)

        # Restore subsystem states
        if "power_state" in checkpoint:
            self._power.state.battery_soc_wh = checkpoint["power_state"]["battery_soc_wh"]
            self._power.state.solar_output_w = checkpoint["power_state"]["solar_output_w"]
            self._power.state.in_eclipse = checkpoint["power_state"]["in_eclipse"]

        if "thermal_state" in checkpoint:
            self._thermal.state.temperature_k = checkpoint["thermal_state"]["temperature_k"]
            self._thermal.state.temperature_c = checkpoint["thermal_state"]["temperature_c"]

        if "comms_state" in checkpoint:
            self._comms.state.data_buffer_mb = checkpoint["comms_state"]["data_buffer_mb"]
            self._comms.state.data_collected_mb = checkpoint["comms_state"]["data_collected_mb"]
            self._comms.state.data_downlinked_mb = checkpoint["comms_state"]["data_downlinked_mb"]

        if "storage_state" in checkpoint:
            self._storage.state.used_mb = checkpoint["storage_state"]["used_mb"]
            self._storage.state.free_mb = checkpoint["storage_state"]["free_mb"]

        # Restore RNG state
        if "rng_state" in checkpoint:
            rng_s = checkpoint["rng_state"]
            if isinstance(rng_s, (list, tuple)):
                version = rng_s[0]
                internal = tuple(rng_s[1]) if isinstance(rng_s[1], list) else rng_s[1]
                gauss = rng_s[2]
                self._rng.setstate((version, internal, gauss))
            else:
                self._rng.setstate(rng_s)
        self._action_history = copy.deepcopy(checkpoint.get("action_history", []))

    @classmethod
    def replay(
        cls,
        config: SimulationConfig,
        spacecraft: SpacecraftConfig,
        actions: list[dict[str, Any]],
        target_step: int,
        targets: Optional[list[GroundTarget]] = None,
    ) -> SimulationRunner:
        """
        Deterministically reconstruct simulation state by executing actions at their exact recorded steps.
        """
        runner = cls(config=config, spacecraft=spacecraft, targets=targets or [])

        # Index actions by step
        actions_by_step: dict[int, list[dict[str, Any]]] = {}
        for item in actions:
            step = item.get("step", 0)
            act = item.get("action", item)
            actions_by_step.setdefault(step, []).append(act)

        for s in range(target_step):
            # Apply scheduled actions for this step
            if s in actions_by_step:
                for act in actions_by_step[s]:
                    runner.apply_action(act)
            runner.step()

        return runner
