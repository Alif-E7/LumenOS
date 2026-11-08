"""
Game Session Service — Orchestrates simulation + game layer into playable sessions.

This is the central service that:
1. Creates a mission session from a contract + spacecraft config
2. Runs the simulation step loop
3. Feeds simulation state into the game layer (events, objectives, scoring)
4. Validates and applies player actions through the role permission system
5. Produces the unified GameState for clients

Both solo and co-op modes use this same service. The multiplayer layer
(rooms, WebSocket) wraps this service with session coordination.
"""

from __future__ import annotations

import secrets
import time
from typing import Any, Optional
from uuid import uuid4

import yaml
from pathlib import Path

from api.config import settings
from api.models.mission import MissionDetail
from game.contracts import MissionContract, ObjectiveDefinition, Difficulty, OutcomeType
from game.difficulty import apply_difficulty_to_contract
from game.events import EventDirector, EventConsequence
from game.command_resolver import CommandResolver, CommandRequest, CommandAuditRecord
from game.objectives import ObjectiveEvaluator
from game.roles import RoleName, RoleAssignment, assign_roles, has_permission
from game.actions import ActionType, build_action, PlayerAction
from game.scoring import MissionScorer, ScoreBreakdown
from game.state import GameState
from game.advisory import (
    LumenOSPredictiveScheduler,
    ForecastWindow,
    AdvisoryRecommendation,
    AdvisoryMetricsSummary,
)
from simulation.core import (
    SimulationRunner, SimulationConfig, SpacecraftConfig, SimulationSnapshot,
)
from simulation.physics.orbital import OrbitalElements, GroundTarget
from simulation.timeline import TimelineEvent, TimelineEventType


DEFAULT_MISSION_TARGETS: dict[str, list[GroundTarget]] = {
    "wildfire": [
        GroundTarget(target_id="fire_zone_alpha", name="Fire Zone Alpha (Blue Mountains)", latitude_deg=-33.7, longitude_deg=150.3, target_type="wildfire", priority=1),
        GroundTarget(target_id="fire_zone_bravo", name="Fire Zone Bravo (Gippsland)", latitude_deg=-37.5, longitude_deg=147.2, target_type="wildfire", priority=2),
        GroundTarget(target_id="fire_zone_charlie", name="Fire Zone Charlie (Hunter Valley)", latitude_deg=-32.8, longitude_deg=151.2, target_type="wildfire", priority=3),
    ],
    "flood": [
        GroundTarget(target_id="flood_basin_alpha", name="Brahmaputra Flood Plain", latitude_deg=26.1, longitude_deg=91.7, target_type="flood_zone", priority=1),
        GroundTarget(target_id="flood_basin_bravo", name="Ganges Delta Confluence", latitude_deg=23.4, longitude_deg=90.2, target_type="flood_zone", priority=2),
    ],
    "solar_storm": [
        GroundTarget(target_id="solar_polar_station", name="Svalbard Auroral Observatory", latitude_deg=78.2, longitude_deg=15.4, target_type="aurora_station", priority=1),
    ],
    "volcano": [
        GroundTarget(target_id="volcano_merapi", name="Mount Merapi Caldera", latitude_deg=-7.54, longitude_deg=110.44, target_type="active_volcano", priority=1),
        GroundTarget(target_id="volcano_krakatoa", name="Anak Krakatau", latitude_deg=-6.10, longitude_deg=105.42, target_type="active_volcano", priority=2),
    ],
}


class GameSession:
    """
    A single playable mission session (solo or co-op).

    Owns the simulation runner, event director, objective evaluator,
    and game state. The WebSocket room layer delegates all game logic here.
    """

    def __init__(
        self,
        session_id: str,
        mission: MissionDetail,
        spacecraft_config: SpacecraftConfig,
        seed: int = 42,
        player_ids: list[str] | None = None,
        time_step_seconds: float = 60.0,
        difficulty: Difficulty | str | None = None,
    ):
        self.session_id = session_id
        self.mission = mission
        self.seed = seed
        self.created_at = time.time()

        # Derive max steps from mission duration
        max_steps = int((mission.duration_hours * 3600) / time_step_seconds)

        # Simulation engine
        if getattr(mission, "targets", None):
            mission_targets = [
                GroundTarget(
                    target_id=t.get("id", f"target_{i}"),
                    name=t.get("name", f"Target {i}"),
                    latitude_deg=float(t.get("latitude_deg", 0.0)),
                    longitude_deg=float(t.get("longitude_deg", 0.0)),
                    target_type=t.get("target_type", "surface"),
                    priority=int(t.get("priority", 1)),
                )
                for i, t in enumerate(mission.targets)
            ]
        else:
            mission_targets = DEFAULT_MISSION_TARGETS.get(mission.id.lower(), [])
        self._sim = SimulationRunner(
            config=SimulationConfig(
                seed=seed,
                time_step_seconds=time_step_seconds,
                max_steps=max_steps,
            ),
            spacecraft=spacecraft_config,
            targets=mission_targets,
        )

        # Contract (game rules for this session)
        objectives = [
            ObjectiveDefinition(
                id=obj.id,
                description=obj.description,
                target_value=obj.target_value,
                unit=obj.unit,
                weight=obj.weight,
                is_primary=getattr(obj, "is_primary", obj.weight >= 0.8),
            )
            for obj in mission.objectives
        ]
        contract = MissionContract(
            mission_id=mission.id,
            mission_name=mission.name,
            description=mission.description,
            story=getattr(mission, "story", mission.description),
            difficulty=Difficulty.from_int(mission.difficulty),
            deadline_steps=max_steps,
            budget=getattr(mission, "budget", 10000.0),
            permitted_components=getattr(mission, "permitted_components", {}),
            observation_tasks=getattr(mission, "observation_tasks", []),
            targets=getattr(mission, "targets", []),
            role_responsibilities=getattr(mission, "role_responsibilities", {}),
            rewards=getattr(mission, "rewards", {}),
            objectives=objectives,
            seed=seed,
        )
        if difficulty is not None:
            contract = apply_difficulty_to_contract(contract, difficulty)
        self._contract = contract

        # Event director (seeded)
        self._events = EventDirector(
            event_pool=mission.event_pool,
            seed=seed,
            max_steps=max_steps,
        )

        # Objective evaluator
        self._objectives = ObjectiveEvaluator(objectives)

        # Scorer
        self._scorer = MissionScorer()

        # Role assignment
        pids = player_ids or [f"solo_{uuid4().hex[:8]}"]
        self._roles = assign_roles(pids)
        self._player_ids = pids

        # Command resolver (authoritative serializer)
        self._command_resolver = CommandResolver(roles=self._roles)

        # LumenOS predictive workload scheduler (Prompt 12)
        self._advisory = LumenOSPredictiveScheduler(
            horizon_steps=5,
            time_step_seconds=getattr(self._sim.config, "time_step_seconds", 60.0),
        )

        # Game state
        self._state = GameState(
            session_id=session_id,
            mission_id=mission.id,
            seed=seed,
            status="running",
            budget_total=self._contract.budget,
            budget_remaining=self._contract.budget,
            objectives=list(self._objectives.trackers.values()),
        )

    # ── Properties ───────────────────────────────────────────────────────

    @property
    def state(self) -> GameState:
        return self._state

    @property
    def roles(self) -> RoleAssignment:
        return self._roles

    @property
    def is_finished(self) -> bool:
        return self._state.status in ("completed", "failed")

    @property
    def contract(self) -> MissionContract:
        return self._contract

    @property
    def spacecraft(self) -> SpacecraftConfig:
        return self._sim.spacecraft

    @property
    def budget_remaining(self) -> float:
        return self._state.budget_remaining

    def spend_budget(self, amount: float) -> bool:
        return self._state.spend_budget(amount)

    def execute_command(self, command: CommandRequest) -> CommandAuditRecord:
        """Execute a validated CommandRequest via the authoritative serializer."""
        return self._command_resolver.execute_command(
            command=command,
            current_step=self._sim.current_step,
            runtime=self,
        )

    # ── Core game loop ───────────────────────────────────────────────────

    def step(self, num_steps: int = 1) -> list[dict[str, Any]]:
        """
        Advance the game by num_steps simulation steps.

        Returns a list of step results (one per step), each containing:
        - snapshot: simulation state
        - new_events: any events triggered this step
        - objective_updates: current objective progress
        - game_state: current GameState summary
        """
        if self.is_finished:
            return [{"error": "Session already finished"}]

        results = []
        for _ in range(num_steps):
            if self.is_finished:
                break

            # 1. Advance simulation
            snapshot = self._sim.step()

            # 2. Tick event director
            new_events = self._events.tick(snapshot.step, sim_snapshot=snapshot)

            # 3. Update objectives based on simulation state
            self._update_objectives(snapshot)

            # 4. Update game state from snapshot
            self._sync_state(snapshot, new_events)

            # 5. Check win/fail conditions
            self._check_outcome(snapshot)

            # 6. Evaluate Prior Predictions Against Measured Telemetry
            telemetry_data = self._telemetry(snapshot)
            self._advisory.evaluate_actuals(snapshot.step, telemetry_data)

            # 7. Generate 5-Minute Forward Forecast & Action Recommendations
            forecast = self._advisory.generate_forecast(snapshot.step, self)
            auto_executed = self._advisory.tick_automation(self)

            results.append({
                "step": snapshot.step,
                "elapsed_seconds": snapshot.elapsed_seconds,
                "telemetry": telemetry_data,
                "new_events": [
                    {
                        "event_id": e.event_id,
                        "name": e.name,
                        "description": e.description,
                        "severity": e.severity.value,
                        "choices": [
                            {"id": c.id, "label": c.label, "description": c.description}
                            for c in e.choices
                        ],
                        "deadline_step": e.deadline_step,
                    }
                    for e in new_events
                ],
                "game_state": self._state.to_summary(),
                "advisory": {
                    "forecast": forecast.model_dump(),
                    "recommendations": [
                        r.model_dump() for r in (
                            self._advisory.active_recommendations.values()
                            if isinstance(self._advisory.active_recommendations, dict)
                            else self._advisory.active_recommendations
                        )
                    ],
                    "auto_executed": [r.model_dump() for r in auto_executed],
                    "metrics": self._advisory.compute_metrics_summary().model_dump(),
                },
            })

        return results

    def get_telemetry(self) -> dict[str, Any]:
        """Latest telemetry snapshot (for clients joining mid-mission)."""
        if not self._sim.history:
            return {}
        return self._telemetry(self._sim.history[-1])

    def get_active_events(self) -> list[dict[str, Any]]:
        """Serialised pending + recently resolved events."""
        return [
            {
                "event_id": e.event_id,
                "name": e.name,
                "description": e.description,
                "severity": e.severity.value,
                "phase": e.phase.value,
                "is_pending": e.is_pending,
                "triggered_step": e.triggered_step,
                "deadline_step": e.deadline_step,
                "choices": [
                    {"id": c.id, "label": c.label, "description": c.description}
                    for c in e.choices
                ],
            }
            for e in self._state.active_events
        ]

    def get_full_state(self) -> dict[str, Any]:
        """Game state summary plus objective progress and active events."""
        return {
            **self._state.to_summary(),
            "elapsed_seconds": self._state.elapsed_seconds,
            "data_downlinked_mb": self._state.data_downlinked_mb,
            "resolved_event_count": self._state.resolved_event_count,
            "objectives": [
                {
                    "objective_id": o.objective_id,
                    "description": o.description,
                    "target_value": o.target_value,
                    "current_value": o.current_value,
                    "unit": o.unit,
                    "weight": o.weight,
                    "is_primary": o.is_primary,
                    "fraction": o.fraction,
                    "is_complete": o.is_complete,
                }
                for o in self._state.objectives
            ],
            "active_events": self.get_active_events(),
        }

    # ── LumenOS Predictive Mission Management (Prompt 12) ─────────────────────

    def get_advisory_state(self) -> dict[str, Any]:
        """Retrieve current advisory forecast, active recommendations, and accuracy metrics."""
        fc = self._advisory.active_forecast
        recs = (
            list(self._advisory.active_recommendations.values())
            if isinstance(self._advisory.active_recommendations, dict)
            else list(self._advisory.active_recommendations)
        )
        rec_dumps = [r.model_dump() for r in recs]
        return {
            "forecast": fc.model_dump() if fc else None,
            "recommendations": rec_dumps,
            "active_recommendations": rec_dumps,
            "auto_pilot_enabled": self._advisory.auto_pilot_enabled,
            "metrics": self._advisory.compute_metrics_summary().model_dump(),
        }

    def respond_to_advisory(
        self,
        player_id: str = "operator",
        recommendation_id: str = "",
        action: str = "accept",
        modified_parameters: Optional[dict[str, Any]] = None,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Accept, reject, or modify an advisory recommendation."""
        # Normalize args if called positionally or with alternate names
        rec_id = recommendation_id or kwargs.get("rec_id", "")
        act = action or kwargs.get("response", "accept")
        params = modified_parameters or kwargs.get("modified_params")
        actor = player_id or kwargs.get("actor", "operator")

        return self._advisory.respond_to_recommendation(
            recommendation_id=rec_id,
            action=act,
            modified_parameters=params,
            player_id=actor,
            runtime=self,
        )

    def set_advisory_automation(self, player_id: str = "operator", enabled: bool = False, **kwargs: Any) -> dict[str, Any]:
        """Toggle optional autopilot automation."""
        if "enabled" not in kwargs and isinstance(player_id, bool):
            enabled = player_id
            player_id = "operator"
        res = self._advisory.set_automation(enabled=enabled, player_id=player_id)
        return {"success": True, "auto_pilot_enabled": self._advisory.auto_pilot_enabled, **res}

    def get_advisory_metrics(self) -> dict[str, Any]:
        """Get prediction accuracy scorecard."""
        return self._advisory.compute_metrics_summary().model_dump()

    @staticmethod
    def _telemetry(snapshot: SimulationSnapshot) -> dict[str, Any]:
        """Compact telemetry dict from a simulation snapshot with physical accounting."""
        tel: dict[str, Any] = {
            "step": snapshot.step,
            "elapsed_seconds": snapshot.elapsed_seconds,
            "status": snapshot.status,
            "spacecraft_health_pct": snapshot.spacecraft_health_pct,
            "orbital": {
                "altitude_km": snapshot.orbital.altitude_km,
                "velocity_km_s": snapshot.orbital.velocity_km_s,
                "latitude_deg": snapshot.orbital.latitude_deg,
                "longitude_deg": snapshot.orbital.longitude_deg,
                "in_eclipse": snapshot.orbital.in_eclipse,
                "true_anomaly_deg": snapshot.orbital.true_anomaly_deg,
            },
            "power": {
                "solar_output_w": snapshot.power.solar_output_w,
                "solar_irradiance_w_m2": snapshot.power.solar_irradiance_w_m2,
                "sun_incidence_angle_deg": snapshot.power.sun_incidence_angle_deg,
                "total_load_w": snapshot.power.total_load_w,
                "net_power_w": snapshot.power.net_power_w,
                "battery_soc_wh": snapshot.power.battery_soc_wh,
                "battery_capacity_wh": snapshot.power.battery_capacity_wh,
                "battery_usable_capacity_wh": snapshot.power.battery_usable_capacity_wh,
                "battery_soc_pct": snapshot.power.battery_soc_pct,
                "battery_dod_pct": snapshot.power.battery_dod_pct,
                "battery_equivalent_full_cycles": snapshot.power.battery_equivalent_full_cycles,
                "battery_soh_pct": snapshot.power.battery_soh_pct,
                "in_eclipse": snapshot.power.in_eclipse,
                "low_power_warning": snapshot.power.low_power_warning,
                "power_critical": snapshot.power.power_critical,
                "load_breakdown_w": snapshot.power.load_breakdown_w,
            },
            "thermal": {
                "temperature_c": snapshot.thermal.temperature_c,
                "temperature_k": snapshot.thermal.temperature_k,
                "heat_input_w": snapshot.thermal.heat_input_w,
                "heat_rejected_w": snapshot.thermal.heat_rejected_w,
                "internal_dissipation_w": snapshot.thermal.internal_dissipation_w,
                "solar_absorbed_w": snapshot.thermal.solar_absorbed_w,
                "albedo_absorbed_w": snapshot.thermal.albedo_absorbed_w,
                "earth_ir_absorbed_w": snapshot.thermal.earth_ir_absorbed_w,
                "heater_heat_w": snapshot.thermal.heater_heat_w,
                "net_heat_w": snapshot.thermal.net_heat_w,
                "heater_active": snapshot.thermal.heater_active,
                "overtemp_warning": snapshot.thermal.overtemp_warning,
                "undertemp_warning": snapshot.thermal.undertemp_warning,
                "thermal_critical": snapshot.thermal.thermal_critical,
                "model_type": snapshot.thermal.model_type,
            },
            "comms": {
                "data_buffer_mb": snapshot.comms.data_buffer_mb,
                "data_buffer_pct": snapshot.comms.data_buffer_pct,
                "data_collected_mb": snapshot.comms.data_collected_mb,
                "data_downlinked_mb": snapshot.comms.data_downlinked_mb,
                "alerts_downlinked_mb": snapshot.comms.alerts_downlinked_mb,
                "processed_downlinked_mb": snapshot.comms.processed_downlinked_mb,
                "raw_downlinked_mb": snapshot.comms.raw_downlinked_mb,
                "in_contact": snapshot.comms.in_contact,
                "active_station": snapshot.comms.active_station,
                "elevation_deg": snapshot.comms.elevation_deg,
                "slant_range_km": snapshot.comms.slant_range_km,
                "current_data_rate_mbps": snapshot.comms.current_data_rate_mbps,
                "signal_strength_dbm": snapshot.comms.signal_strength_dbm,
                "buffer_full_warning": snapshot.comms.buffer_full_warning,
                "transmission_interrupted": snapshot.comms.transmission_interrupted,
                "downlink_priority_mode": snapshot.comms.downlink_priority_mode,
            },
            "storage": {
                "used_pct": snapshot.storage.used_pct,
                "used_mb": snapshot.storage.used_mb,
                "free_mb": snapshot.storage.free_mb,
                "raw_data_mb": snapshot.storage.raw_data_mb,
                "processed_data_mb": snapshot.storage.processed_data_mb,
                "priority_alerts_mb": snapshot.storage.priority_alerts_mb,
                "dropped_overflow_mb": snapshot.storage.dropped_overflow_mb,
                "overflow_risk_pct": snapshot.storage.overflow_risk_pct,
                "compression_ratio": snapshot.storage.compression_ratio,
                "storage_full_warning": snapshot.storage.storage_full_warning,
            },
            "workload": {
                "operational_profile": snapshot.workload.operational_profile.value,
                "cpu_usage_pct": snapshot.workload.cpu_usage_pct,
                "cpu_power_w": snapshot.workload.cpu_power_w,
                "active_tasks": snapshot.workload.active_tasks,
                "output_quality": snapshot.workload.output_quality,
                "processing_queue_items": snapshot.workload.processing_queue_items,
                "cpu_overload_warning": snapshot.workload.cpu_overload_warning,
                "profile_educational_note": snapshot.workload.profile_educational_note,
            },
        }

        if snapshot.radiation_debris:
            tel["radiation_debris"] = {
                "in_saa_zone": snapshot.radiation_debris.in_saa_zone,
                "in_auroral_horn": snapshot.radiation_debris.in_auroral_horn,
                "instantaneous_dose_rate_rad_per_hour": snapshot.radiation_debris.instantaneous_dose_rate_rad_per_hour,
                "total_ionizing_dose_rad": snapshot.radiation_debris.total_ionizing_dose_rad,
                "tid_pct_of_limit": snapshot.radiation_debris.tid_pct_of_limit,
                "seu_rate_per_day": snapshot.radiation_debris.seu_rate_per_day,
                "radiation_warning": snapshot.radiation_debris.radiation_warning,
                "debris_spatial_density_per_km3": snapshot.radiation_debris.debris_spatial_density_per_km3,
                "debris_collision_risk_index": snapshot.radiation_debris.debris_collision_risk_index,
                "educational_disclaimer": snapshot.radiation_debris.educational_disclaimer,
            }

        return tel

    def perform_action(
        self,
        player_id: str,
        action_type: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Validate and apply a player action.

        Checks:
        1. Session is running
        2. Player is in the session
        3. Player's role permits this action
        4. Budget is sufficient
        5. Action parameters are valid

        Returns result dict with success/failure and details.
        """
        if self.is_finished:
            return {"success": False, "error": "Session is finished"}

        # Player membership check
        if player_id not in self._player_ids:
            return {"success": False, "error": "Player not in this session"}

        # Parse action type
        try:
            at = ActionType(action_type)
        except ValueError:
            return {"success": False, "error": f"Unknown action type: {action_type}"}

        # Role permission check (server-side, never trust client)
        if not self._roles.can_perform(player_id, at):
            return {
                "success": False,
                "error": f"Role does not permit action: {action_type}",
                "player_roles": [r.value for r in self._roles.player_roles.get(player_id, [])],
            }

        # Build the action
        action = build_action(at, params or {})

        # Budget check
        if action.budget_cost > 0:
            if not self._state.spend_budget(action.budget_cost):
                return {
                    "success": False,
                    "error": f"Insufficient budget. Need {action.budget_cost}, have {self._state.budget_remaining}",
                }

        # Apply to simulation (translate game actions to sim actions)
        sim_result = self._apply_to_simulation(at, params or {})

        # Log the action
        self._state.log_action(
            step=self._sim.current_step,
            player_id=player_id,
            action_type=action_type,
            params=params,
            result=str(sim_result.get("changes", [])),
            budget_cost=action.budget_cost,
        )

        return {
            "success": True,
            "action_type": action_type,
            "budget_cost": action.budget_cost,
            "budget_remaining": self._state.budget_remaining,
            "sim_result": sim_result,
        }

    def resolve_event(
        self,
        player_id: str,
        event_id: str,
        choice_id: str,
    ) -> dict[str, Any]:
        """Resolve a pending event with the player's choice."""
        if self.is_finished:
            return {"success": False, "error": "Session is finished"}

        if player_id not in self._player_ids:
            return {"success": False, "error": "Player not in this session"}

        # Mission Director or solo player can respond to events
        if not self._roles.can_perform(player_id, ActionType.RESPOND_TO_EVENT):
            return {"success": False, "error": "Role does not permit event responses"}

        consequence = self._events.resolve_event(event_id, choice_id)
        if consequence is None:
            return {"success": False, "error": "Event not found or already resolved"}

        # Apply event effects to simulation
        for key, value in consequence.effects.items():
            if key == "enter_safe_mode":
                self._sim.apply_action({"type": "set_power_mode", "mode": "safe"})
            elif key in ("power_mode_eco", "reduce_workload_eco"):
                self._sim.apply_action({"type": "set_operational_profile", "profile": "ECO"})
            elif key == "reorient_attitude":
                self._sim.apply_action({"type": "set_attitude", "mode": "Nadir (Earth)"})
            elif key == "pipeline_compress":
                self._sim.apply_action({"type": "set_operational_profile", "profile": "FULL"})
            elif key == "payload_active":
                self._sim.apply_action({"type": "set_payload_active", "active": bool(value)})
            elif key == "purge_storage":
                self._sim.apply_action({"type": "purge_storage", "amount_mb": float(value)})
            else:
                self._sim.apply_action({"type": "adjust_" + key, "delta": value})

        self._state.resolved_event_count += 1
        self._state.well_handled_event_count += 1  # Simplified: any response = handled

        # Log
        self._state.log_action(
            step=self._sim.current_step,
            player_id=player_id,
            action_type="respond_to_event",
            params={"event_id": event_id, "choice_id": choice_id},
            result=consequence.choice_label,
        )

        return {
            "success": True,
            "event_id": event_id,
            "choice": consequence.choice_label,
            "effects": consequence.effects,
            "description": consequence.description,
        }

    def get_score_breakdown(self) -> ScoreBreakdown:
        """Calculate current score breakdown."""
        obj_results = self._objectives.get_results()

        # Determine data target from mission objectives
        data_target = 500.0  # default
        for obj in self.mission.objectives:
            if "data" in obj.id.lower() or "downlink" in obj.id.lower():
                data_target = obj.target_value

        # Co-op team summary if multiplayer
        team_summary = None
        if len(self._player_ids) > 1:
            from game.team_contribution import calculate_team_contributions
            roles_dict = {pid: [r.value for r in self._roles.player_roles.get(pid, [])] for pid in self._player_ids}
            team_contrib = calculate_team_contributions(
                action_log=[a.model_dump() for a in self._state.action_log],
                roles_map=roles_dict,
                telemetry_summary={
                    "data_downlinked_mb": self._state.data_downlinked_mb,
                    "spacecraft_health_pct": self._state.spacecraft_health_pct,
                },
            )
            team_summary = team_contrib.model_dump()

        return self._scorer.calculate(
            objective_results=obj_results,
            spacecraft_health_pct=self._state.spacecraft_health_pct,
            data_collected_mb=self._state.data_collected_mb,
            data_target_mb=data_target,
            steps_elapsed=self._state.current_step,
            deadline_steps=self._contract.deadline_steps,
            events_resolved_well=self._state.well_handled_event_count,
            total_events=max(1, self._state.resolved_event_count),
            budget_remaining=self._state.budget_remaining,
            total_budget=self._state.budget_total,
            critical_safety_violation=self._state.spacecraft_health_pct <= 0.0,
            alerts_delivered=self._state.well_handled_event_count,
            team_summary=team_summary,
        )

    # ── Internal helpers ─────────────────────────────────────────────────

    def _update_objectives(self, snapshot: SimulationSnapshot) -> None:
        """Map simulation state to objective progress."""
        for obj in self.mission.objectives:
            if "data" in obj.id.lower() or "downlink" in obj.id.lower():
                self._objectives.update(obj.id, snapshot.comms.data_downlinked_mb)
            elif "coverage" in obj.id.lower() or "monitoring" in obj.id.lower() or "mapping" in obj.id.lower():
                # Approximate: zones covered ~ data collected / data per zone
                zones = snapshot.comms.data_collected_mb / 100.0
                self._objectives.update(obj.id, zones)
            elif "health" in obj.id.lower():
                self._objectives.update(obj.id, snapshot.spacecraft_health_pct)
            elif "duration" in obj.id.lower() or "uptime" in obj.id.lower() or "continuous" in obj.id.lower():
                hours = snapshot.elapsed_seconds / 3600.0
                self._objectives.update(obj.id, hours)
            elif "detection" in obj.id.lower() or "so2" in obj.id.lower() or "flare" in obj.id.lower():
                val = max(1.0 if self._state.well_handled_event_count > 0 else 0.0, snapshot.comms.data_collected_mb / 150.0)
                self._objectives.update(obj.id, min(obj.target_value, val))
            elif "latency" in obj.id.lower() or "warning" in obj.id.lower() or "rapid" in obj.id.lower() or "alert" in obj.id.lower() or "advisory" in obj.id.lower():
                compliance = 95.0 if snapshot.comms.data_downlinked_mb > 0 else 0.0
                self._objectives.update(obj.id, compliance)
            elif "volume" in obj.id.lower() or "sar" in obj.id.lower():
                self._objectives.update(obj.id, snapshot.comms.data_collected_mb)
            elif "survival" in obj.id.lower():
                self._objectives.update(obj.id, snapshot.spacecraft_health_pct)
            elif "thermal_margin" in obj.id.lower() or "overflow" in obj.id.lower() or "dose" in obj.id.lower() or "mitigation" in obj.id.lower():
                self._objectives.update(obj.id, snapshot.spacecraft_health_pct)

        # Sync tracker state back to game state
        self._state.objectives = list(self._objectives.trackers.values())

    def _sync_state(self, snapshot: SimulationSnapshot, new_events: list) -> None:
        """Sync simulation snapshot into game state."""
        self._state.current_step = snapshot.step
        self._state.elapsed_seconds = snapshot.elapsed_seconds
        self._state.spacecraft_health_pct = snapshot.spacecraft_health_pct
        self._state.data_collected_mb = snapshot.comms.data_collected_mb
        self._state.data_downlinked_mb = snapshot.comms.data_downlinked_mb
        self._state.active_events = self._events.active_events

        # Update score
        breakdown = self.get_score_breakdown()
        self._state.current_score = breakdown.total_score

    def _check_outcome(self, snapshot: SimulationSnapshot) -> None:
        """Check win/partial/fail conditions.

        During normal play, only hard failures (health=0, budget<0) end the
        mission early. Full win/partial/fail evaluation happens when the
        simulation reaches its deadline (max_steps) or when the simulation
        runner reports "completed".
        """
        # Hard failure checks — these end the mission immediately
        if snapshot.spacecraft_health_pct <= 0:
            self._state.status = "failed"
            self._state.outcome = OutcomeType.FAILURE
            return
        if self._state.budget_remaining < 0:
            self._state.status = "failed"
            self._state.outcome = OutcomeType.FAILURE
            return

        # Simulation reached the deadline or runner signals completion
        if snapshot.status == "completed":
            obj_scores = self._objectives.get_scores()
            outcome = self._contract.evaluate_outcome(
                objective_scores=obj_scores,
                budget_remaining=self._state.budget_remaining,
                spacecraft_health_pct=snapshot.spacecraft_health_pct,
                steps_elapsed=snapshot.step,
            )
            self._state.status = "completed"
            self._state.outcome = outcome
            return

        # Check for early win — all primary objectives completed
        obj_scores = self._objectives.get_scores()
        primaries = self._contract.primary_objectives
        if primaries:
            all_primary_done = all(
                obj_scores.get(o.id, 0.0) >= 1.0 for o in primaries
            )
            if all_primary_done:
                overall = sum(
                    obj_scores.get(o.id, 0.0) * o.weight
                    for o in self._contract.objectives
                ) / max(self._contract.total_weight, 0.01)
                if overall >= self._contract.win_condition.min_overall_score_pct:
                    self._state.status = "completed"
                    self._state.outcome = OutcomeType.WIN

    def _apply_to_simulation(self, action_type: ActionType, params: dict) -> dict:
        """Translate game actions to simulation engine actions."""
        if action_type == ActionType.TOGGLE_SUBSYSTEM:
            return self._sim.apply_action({
                "type": "set_payload_active",
                "active": params.get("active", True),
            })
        elif action_type == ActionType.SET_POWER_MODE:
            return self._sim.apply_action({
                "type": "set_power_mode",
                "mode": params.get("mode", "normal"),
            })
        elif action_type == ActionType.ADJUST_THERMAL:
            if "heater_setpoint_c" in params:
                return self._sim.apply_action({
                    "type": "adjust_heater_setpoint",
                    "heater_setpoint_c": params["heater_setpoint_c"],
                })
            return self._sim.apply_action({
                "type": "adjust_radiator",
                "delta_m2": params.get("delta_m2", 0.0),
            })
        elif action_type == ActionType.DOWNLINK_DATA:
            return self._sim.apply_action({
                "type": "downlink_data",
                "data_mb": params.get("data_mb", 50.0),
            })
        elif action_type == ActionType.ADJUST_ORBIT:
            return self._sim.apply_action({
                "type": "adjust_orbit",
                "delta_altitude_km": params.get("delta_altitude_km", 0.0),
                "delta_inclination_deg": params.get("delta_inclination_deg", 0.0),
            })
        elif action_type == ActionType.COLLECT_DATA:
            return self._sim.apply_action({
                "type": "collect_data",
                "volume_mb": params.get("volume_mb", params.get("duration_steps", 1) * 20.0),
            })
        elif action_type in (ActionType.SET_PRIORITY, ActionType.CHANGE_PRIORITY, ActionType.ALLOCATE_BUDGET, ActionType.REQUEST_AI_PREDICTION):
            return self._sim.apply_action({"type": action_type.value, **params})
        elif action_type == ActionType.SET_ATTITUDE:
            return self._sim.apply_action({
                "type": "set_attitude",
                "mode": params.get("mode", params.get("target_mode", "Nadir (Earth)")),
            })
        elif action_type == ActionType.SET_CONTROL_MODE:
            if "profile" in params:
                return self._sim.apply_action({
                    "type": "set_operational_profile",
                    "profile": params["profile"],
                })
        elif action_type == ActionType.ENTER_SAFE_MODE:
            return self._sim.apply_action({"type": "set_power_mode", "mode": "safe"})
        elif action_type == ActionType.REDUCE_WORKLOAD:
            return self._sim.apply_action({
                "type": "set_operational_profile",
                "profile": params.get("profile", "ECO"),
            })
        elif action_type == ActionType.DELAY_NONCRITICAL_PROCESSING:
            return self._sim.apply_action({
                "type": "set_operational_profile",
                "profile": "ECO",
            })
        elif action_type == ActionType.ADJUST_OBSERVATION_PLAN:
            return self._sim.apply_action({
                "type": "set_payload_active",
                "active": params.get("payload_active", True),
            })
        elif action_type == ActionType.USE_LATER_PASS:
            return self._sim.apply_action({
                "type": "shed_load",
                "load_name": "comms_transmitter",
            })
        elif action_type == ActionType.REQUEUE_DATA:
            return self._sim.apply_action({
                "type": "requeue_data",
                "queue": params.get("queue_name", "priority"),
            })
        elif action_type in (ActionType.RESET_FAULT, ActionType.REPAIR_SUBSYSTEM):
            return self._sim.apply_action({
                "type": "restore_load",
                "load_name": "payload",
            })

        return {"applied": False, "changes": ["no_sim_mapping"]}

    # ── Simulation Clock & Environment Controls (Prompt 6) ───────────────────

    def pause(self) -> None:
        """Pause the simulation clock."""
        self._sim.pause()
        self._state.status = "paused"

    def resume(self) -> None:
        """Resume running the simulation clock."""
        self._sim.resume()
        self._state.status = "running"

    def set_speed(self, multiplier: float) -> None:
        """Set simulation speed multiplier (1x, 10x, 100x)."""
        self._sim.set_speed(multiplier)

    def get_clock_state(self) -> dict[str, Any]:
        """Return the current simulation clock state."""
        return self._sim.clock.to_state().model_dump()

    def fast_forward_to_time(self, target_seconds: float) -> dict[str, Any]:
        """Fast-forward simulation time sequentially up to target_seconds."""
        snap = self._sim.fast_forward_to_time(target_seconds)
        new_events = self._events.tick(snap.step)
        self._update_objectives(snap)
        self._sync_state(snap, new_events)
        self._check_outcome(snap)
        return {
            "elapsed_seconds": self._sim.elapsed_seconds,
            "step": self._sim.current_step,
            "spacecraft_health_pct": snap.spacecraft_health_pct,
            "game_state": self._state.model_dump(),
        }

    def fast_forward_to_event(self, event_type: str) -> dict[str, Any]:
        """Fast-forward simulation time to the next occurrence of an event type."""
        snap, event = self._sim.fast_forward_to_event(event_type)
        new_events = self._events.tick(snap.step)
        self._update_objectives(snap)
        self._sync_state(snap, new_events)
        self._check_outcome(snap)
        return {
            "target_event": event.model_dump() if event else None,
            "elapsed_seconds": self._sim.elapsed_seconds,
            "step": self._sim.current_step,
            "game_state": self._state.model_dump(),
        }

    def get_forecast_timeline(self, horizon_seconds: float = 86400.0) -> list[dict[str, Any]]:
        """
        Generate deterministic forward timeline events.
        Epistemic barrier: includes only predictable ephemeris and orbital geometry.
        """
        events = self._sim.get_forecast_timeline(horizon_seconds=horizon_seconds)
        return [e.model_dump() for e in events]

    def save_checkpoint(self, metadata: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        """Capture complete session checkpoint."""
        sim_ckpt = self._sim.save_checkpoint(metadata=metadata)
        return {
            "session_id": self.session_id,
            "mission_id": self.mission.id,
            "sim_checkpoint": sim_ckpt,
            "game_state": self._state.model_dump(),
            "created_at": time.time(),
        }

    def load_checkpoint(self, checkpoint_data: dict[str, Any]) -> None:
        """Restore complete session checkpoint."""
        self._sim.load_checkpoint(checkpoint_data["sim_checkpoint"])
        if "game_state" in checkpoint_data:
            gs = checkpoint_data["game_state"]
            self._state.current_step = gs.get("current_step", gs.get("step", self._sim.current_step))
            self._state.elapsed_seconds = gs.get("elapsed_seconds", self._sim.elapsed_seconds)
            self._state.budget_remaining = gs.get("budget_remaining", self._state.budget_remaining)

    def get_ground_track(
        self,
        num_points: int = 100,
        duration_seconds: Optional[float] = None,
    ) -> list[dict[str, Any]]:
        """Compute ground track points along the orbit for 2D/3D map display."""
        period_s = self._sim._orbital.orbital_period()
        dur = duration_seconds if duration_seconds is not None else period_s
        dt = dur / max(num_points, 1)
        points = []
        for i in range(num_points + 1):
            t = self._sim.elapsed_seconds + i * dt
            st = self._sim._orbital.propagate(t)
            points.append({
                "timestamp_seconds": round(t, 1),
                "latitude_deg": round(st.latitude_deg, 3),
                "longitude_deg": round(st.longitude_deg, 3),
                "altitude_km": round(st.altitude_km, 2),
                "velocity_km_s": round(st.velocity_km_s, 3),
                "in_eclipse": st.in_eclipse,
                "sunlight_fraction": st.sunlight_fraction,
                "in_saa": st.in_saa,
            })
        return points


# ── Session manager (in-memory for now) ──────────────────────────────────

class SessionManager:
    """
    Manages active game sessions in memory.

    For production co-op: sessions would be persisted to PostgreSQL
    for reconnect/recovery. This in-memory version works for local
    solo play and dev/hackathon co-op.
    """

    def __init__(self):
        self._sessions: dict[str, GameSession] = {}

    def create_session(
        self,
        mission: MissionDetail,
        spacecraft_config: SpacecraftConfig,
        seed: int | None = None,
        player_ids: list[str] | None = None,
        time_step_seconds: float = 60.0,
        difficulty: Difficulty | str | None = None,
    ) -> GameSession:
        """Create and register a new game session."""
        session_id = f"ses_{uuid4().hex[:12]}"
        actual_seed = seed if seed is not None else secrets.randbelow(2**31)

        session = GameSession(
            session_id=session_id,
            mission=mission,
            spacecraft_config=spacecraft_config,
            seed=actual_seed,
            player_ids=player_ids,
            time_step_seconds=time_step_seconds,
            difficulty=difficulty,
        )
        self._sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> GameSession | None:
        return self._sessions.get(session_id)

    def remove_session(self, session_id: str) -> bool:
        return self._sessions.pop(session_id, None) is not None

    def list_sessions(self) -> list[dict[str, Any]]:
        return [
            {
                "session_id": s.session_id,
                "mission_id": s.state.mission_id,
                "status": s.state.status,
                "players": s._player_ids,
                "step": s.state.current_step,
                "score": s.state.current_score,
            }
            for s in self._sessions.values()
        ]


# Global singleton
session_manager = SessionManager()

