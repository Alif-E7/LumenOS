"""Lumen Scheduler — the LumenOS brain.

Scheduling philosophy
=====================
A data-centre scheduler on Earth (Kubernetes, Slurm, ...) asks:
*"Is there enough CPU / RAM / GPU for this job?"*

In orbit that question is not enough. In a vacuum there is no air to carry heat
away — the **only** exit for heat is a radiator glowing infrared into space, and
how well it works depends on where the satellite is:

* radiator facing **deep space** (3 K)       -> excellent cooling
* radiator facing **night-side Earth** (220 K) -> moderate cooling
* radiator facing **day-side Earth** (280 K)   -> poor cooling
* **eclipse** -> no solar power, only a small battery

So LumenOS asks a different question every 30 seconds:

    "Given where we are in orbit, how hot we are, and how much power we have,
     which job can run *right now* without pushing the hardware toward a
     thermal shutdown?"

Decision rules (evaluated every step)
-------------------------------------
1. **SHUTDOWN** (>= 95 °C or battery empty): pause everything and wait until the
   server has cooled below ``SHUTDOWN_RECOVERY_CELSIUS``.
2. **CRITICAL** (80-95 °C): only COLD jobs.
3. **WARNING** (60-80 °C): only MEDIUM and COLD jobs.
4. **NOMINAL** (< 60 °C): the highest-priority job that fits, where "fits" means:

   * its power draw fits the power budget (solar in sunlight, battery in eclipse,
     minus the electronics' base load), **and**
   * a look-ahead prediction (``ThermalEngine.predict_temperature``) says the
     server will still be below that job's category limit (HEAVY 60 °C,
     MEDIUM 80 °C, COLD 95 °C) after the next few minutes of running it.

   The look-ahead is what makes LumenOS *proactive* instead of reactive: it
   pauses a heavy job *before* the temperature crosses a threshold, not after.

Jobs are **preemptible with checkpointing**: when LumenOS pauses a job its
progress is kept and it resumes later (e.g. when the radiator swings back to deep
space). A *thermal shutdown*, by contrast, is a hard power-off — the job that was
running loses all its progress.

The naive baseline
------------------
``compare_with_naive_scheduler`` runs the same orbit with a scheduler that only
checks power (it physically cannot run a job without electricity) but ignores
temperature entirely: it always runs the highest-priority job it can power.

Workloads are treated as a recurring stream: when a job finishes, a fresh copy is
queued again, so the queue never runs dry during a simulation.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable, Optional

from engine.orbital_engine import OrbitalEngine
from engine.thermal_engine import (
    CRITICAL,
    NOMINAL,
    SHUTDOWN,
    SHUTDOWN_THRESHOLD_CELSIUS,
    WARNING,
    ThermalEngine,
)
from engine.workload_profiler import (
    CATEGORY_MAX_START_TEMP_CELSIUS,
    COLD,
    HEAVY,
    MEDIUM,
    AIWorkload,
    WorkloadProfiler,
)

#: Scheduler tick (seconds).
STEP_SECONDS: float = 30.0

#: How far ahead LumenOS predicts the temperature before (re)starting a job.
LOOKAHEAD_MINUTES: float = 5.0

#: After a thermal shutdown, hardware stays off until it cools below this (°C).
SHUTDOWN_RECOVERY_CELSIUS: float = 70.0

#: Job categories permitted in each thermal status.
ALLOWED_CATEGORIES: dict[str, tuple[str, ...]] = {
    NOMINAL: (HEAVY, MEDIUM, COLD),
    WARNING: (MEDIUM, COLD),
    CRITICAL: (COLD,),
    SHUTDOWN: (),
}


@dataclass
class _Job:
    """A queued instance of a workload, with its remaining run time."""

    workload: AIWorkload
    remaining_seconds: float

    @classmethod
    def fresh(cls, workload: AIWorkload) -> "_Job":
        """Create a not-yet-started job for ``workload``."""
        return cls(workload, workload.duration_minutes * 60.0)

    @property
    def total_seconds(self) -> float:
        """Full duration of the job in seconds."""
        return self.workload.duration_minutes * 60.0

    @property
    def started(self) -> bool:
        """``True`` if some progress has been made."""
        return self.remaining_seconds < self.total_seconds

    def restart(self) -> None:
        """Discard all progress (used after a hard thermal shutdown)."""
        self.remaining_seconds = self.total_seconds


@dataclass
class _Decision:
    """Outcome of one scheduling decision."""

    job: Optional[_Job]
    reason: str
    shutdown_risk_avoided: bool = False


#: Signature of a scheduling policy:
#: (sorted queue, orbital state, temperature, status, task power budget) -> decision
_Policy = Callable[[list[_Job], dict[str, Any], float, str, float], _Decision]


class LumenScheduler:
    """Thermodynamics-aware scheduler: like Kubernetes, but the scarce resource is *cooling*.

    Example:
        >>> scheduler = LumenScheduler(OrbitalEngine(), ThermalEngine(), WorkloadProfiler())
        >>> lumen = scheduler.run_simulation(90)
        >>> naive = scheduler.compare_with_naive_scheduler(90)
        >>> lumen["max_temperature_reached"] < naive["max_temperature_reached"]
        True
    """

    def __init__(
        self,
        orbital_engine: OrbitalEngine,
        thermal_engine: ThermalEngine,
        workload_profiler: WorkloadProfiler,
        step_seconds: float = STEP_SECONDS,
        lookahead_minutes: float = LOOKAHEAD_MINUTES,
        start_time: Optional[datetime] = None,
    ) -> None:
        """Store references to the three engines.

        Args:
            orbital_engine: Provides sunlight, solar power and radiator conditions.
            thermal_engine: Provides temperature, predictions and the battery.
                It is reset at the start of every simulation run.
            workload_profiler: Provides the AI job catalogue.
            step_seconds: Scheduler tick length.
            lookahead_minutes: Prediction horizon used before running a job.
            start_time: Simulation start (UTC). Defaults to the first orbital
                sunrise after the orbit epoch, so a run covers a full
                sunlight -> eclipse cycle.
        """
        self.orbital_engine = orbital_engine
        self.thermal_engine = thermal_engine
        self.workload_profiler = workload_profiler
        self.step_seconds = float(step_seconds)
        self.lookahead_minutes = float(lookahead_minutes)
        self.start_time: datetime = (
            start_time if start_time is not None else orbital_engine.next_sunrise()
        )
        self._orbit_cache: dict[float, list[dict[str, Any]]] = {}

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #
    def run_simulation(self, total_minutes: float = 90) -> dict[str, Any]:
        """Simulate one orbit window under LumenOS thermodynamics-aware scheduling.

        Every ``step_seconds`` (30 s): read the orbital state, compute cooling,
        read the temperature and thermal status, decide which job runs, apply
        its heat to the thermal model, and log the step.

        Args:
            total_minutes: Simulated duration.

        Returns:
            A results dict:

            * ``timeline`` — one dict per step with ``time``, ``orbital_state``,
              ``temperature_c`` (at the start of the step, i.e. what the decision
              was based on), ``task_running``, ``task_heat_watts``,
              ``cooling_watts``, ``thermal_status`` plus ``battery_percent``,
              ``power_available_watts``, ``decision`` and ``task_completed``.
            * ``total_tasks_completed`` (int)
            * ``total_compute_seconds`` (float)
            * ``max_temperature_reached`` (float, °C)
            * ``thermal_shutdowns_avoided`` (int) — episodes where the job a naive
              scheduler would have run was held back and the look-ahead
              predicted that running it for a full task length would reach
              >= 95 °C.
            * extras: ``scheduler``, ``thermal_shutdowns``, ``shutdown_minutes``,
              ``lost_compute_seconds`` (progress destroyed by hard shutdowns),
              ``min_battery_percent``, ``completed_by_task``.
        """
        return self._simulate(total_minutes, self._lumen_policy, "LumenOS")

    def compare_with_naive_scheduler(self, total_minutes: float = 90) -> dict[str, Any]:
        """Simulate the same window with a thermally-blind baseline scheduler.

        The naive scheduler always runs the highest-priority job it has power
        for and never looks at temperature. It is subject to the same physics:
        at 95 °C the hardware shuts down, the running job loses its progress,
        and nothing runs until the server cools below the recovery threshold.

        Args:
            total_minutes: Simulated duration.

        Returns:
            A results dict in the same format as :meth:`run_simulation`
            (``thermal_shutdowns_avoided`` is always 0).
        """
        return self._simulate(total_minutes, self._naive_policy, "Naive")

    # ------------------------------------------------------------------ #
    # Policies
    # ------------------------------------------------------------------ #
    def _lumen_policy(
        self,
        queue: list[_Job],
        state: dict[str, Any],
        temp: float,
        status: str,
        power_budget: float,
    ) -> _Decision:
        """LumenOS: status-gated, look-ahead, highest-priority-first selection."""
        allowed = ALLOWED_CATEGORIES[status]
        sink_k = state["sink_temperature_kelvin"]
        cooling_cap = state["max_cooling_capacity_watts"]
        naive_choice_checked = False
        shutdown_risk = False
        held_back: list[str] = []

        for job in queue:
            workload = job.workload
            if workload.power_draw_watts > power_budget:
                continue

            fits = workload.category in allowed
            if fits:
                horizon = min(self.lookahead_minutes, job.remaining_seconds / 60.0)
                predicted = self.thermal_engine.predict_temperature(
                    temp,
                    workload.heat_generation_watts,
                    cooling_cap,
                    duration_minutes=horizon,
                    sink_temperature_kelvin=sink_k,
                )
                fits = predicted < CATEGORY_MAX_START_TEMP_CELSIUS[workload.category]

            if not naive_choice_checked:
                # This is the job a thermally-blind scheduler would run now.
                naive_choice_checked = True
                if not fits:
                    # Would a thermally-blind scheduler running this job for a
                    # full task length drive the hardware into SHUTDOWN?
                    end_temp = self.thermal_engine.predict_temperature(
                        temp,
                        workload.heat_generation_watts,
                        cooling_cap,
                        duration_minutes=workload.duration_minutes,
                        sink_temperature_kelvin=sink_k,
                    )
                    shutdown_risk = end_temp >= SHUTDOWN_THRESHOLD_CELSIUS

            if fits:
                reason = f"{status}: run {workload.name} ({workload.category})"
                if held_back:
                    reason += f"; held back {', '.join(held_back)} (thermal)"
                return _Decision(job, reason, shutdown_risk)
            held_back.append(workload.name)

        if not held_back:
            return _Decision(None, f"{status}: no job fits the power budget", shutdown_risk)
        return _Decision(None, f"{status}: all powered jobs held back (thermal)", shutdown_risk)

    @staticmethod
    def _naive_policy(
        queue: list[_Job],
        state: dict[str, Any],
        temp: float,
        status: str,
        power_budget: float,
    ) -> _Decision:
        """Naive: highest-priority job that has power. Temperature is ignored."""
        for job in queue:
            if job.workload.power_draw_watts <= power_budget:
                return _Decision(job, f"Naive: run {job.workload.name}")
        return _Decision(None, "Naive: no job fits the power budget")

    # ------------------------------------------------------------------ #
    # Simulation core
    # ------------------------------------------------------------------ #
    def _orbital_states(self, total_minutes: float) -> list[dict[str, Any]]:
        """Orbital states at the start of each step (cached per duration)."""
        if total_minutes not in self._orbit_cache:
            n_steps = int(total_minutes * 60.0 // self.step_seconds)
            states = self.orbital_engine.simulate_orbit(
                duration_minutes=total_minutes,
                step_seconds=self.step_seconds,
                start_time=self.start_time,
            )
            self._orbit_cache[total_minutes] = states[:n_steps]
        return self._orbit_cache[total_minutes]

    @staticmethod
    def _sorted_queue(queue: list[_Job]) -> list[_Job]:
        """Priority order; within a priority, resume started jobs first, then FIFO."""
        order = sorted(
            range(len(queue)),
            key=lambda i: (queue[i].workload.priority, not queue[i].started, i),
        )
        return [queue[i] for i in order]

    def _simulate(self, total_minutes: float, policy: _Policy, name: str) -> dict[str, Any]:
        """Run one simulation with the given policy and collect results."""
        if total_minutes <= 0:
            raise ValueError("total_minutes must be positive")

        thermal = self.thermal_engine
        battery = thermal.battery
        thermal.reset()
        dt = self.step_seconds

        queue = [_Job.fresh(w) for w in self.workload_profiler.get_all_tasks()]
        timeline: list[dict[str, Any]] = []
        completed: Counter[str] = Counter()
        compute_seconds = 0.0
        lost_compute_seconds = 0.0
        max_temp = thermal.current_temp_celsius
        min_battery = battery.percent
        shutdowns = 0
        shutdown_steps = 0
        shutdowns_avoided = 0
        previous_risk = False
        in_shutdown = False
        running_job: Optional[_Job] = None

        for state in self._orbital_states(total_minutes):
            temp = thermal.current_temp_celsius
            status = thermal.get_thermal_status(temp)

            # --- Hardware protection: latch SHUTDOWN until cooled down -------
            if status == SHUTDOWN and not in_shutdown:
                in_shutdown = True
                shutdowns += 1
                if running_job is not None:
                    lost_compute_seconds += running_job.total_seconds - running_job.remaining_seconds
                    running_job.restart()  # hard power-off: progress lost
                    running_job = None
            elif in_shutdown and temp < SHUTDOWN_RECOVERY_CELSIUS and not battery.is_depleted:
                in_shutdown = False
            if in_shutdown:
                status = SHUTDOWN

            power_available = battery.available_power(
                state["is_sunlit"], state["solar_power_watts"], dt
            )
            power_budget = max(0.0, power_available - thermal.base_heat_watts)

            # --- Decide ------------------------------------------------------
            if in_shutdown:
                decision = _Decision(None, "SHUTDOWN: all tasks paused, waiting to cool")
            else:
                decision = policy(self._sorted_queue(queue), state, temp, status, power_budget)
            job = decision.job

            # --- Apply physics -----------------------------------------------
            task_heat = job.workload.heat_generation_watts if job else 0.0
            task_power = job.workload.power_draw_watts if job else 0.0
            if in_shutdown:
                q_in, load = 0.0, 0.0  # electronics powered off
            else:
                q_in = thermal.total_heat_input(task_heat)
                load = thermal.base_heat_watts + task_power
            q_out = thermal.radiator_heat_rejection(
                state["sink_temperature_kelvin"], state["max_cooling_capacity_watts"]
            )
            battery.step(state["is_sunlit"], state["solar_power_watts"], load, dt)
            new_temp = thermal.update_temperature(q_in, q_out, dt)

            # --- Book-keeping ------------------------------------------------
            max_temp = max(max_temp, new_temp)
            min_battery = min(min_battery, battery.percent)
            shutdown_steps += int(in_shutdown)
            if decision.shutdown_risk_avoided and not previous_risk:
                shutdowns_avoided += 1
            previous_risk = decision.shutdown_risk_avoided

            finished: Optional[str] = None
            if job is not None:
                job.remaining_seconds -= dt
                compute_seconds += dt
                if job.remaining_seconds <= 1e-9:
                    finished = job.workload.name
                    completed[finished] += 1
                    queue.remove(job)
                    queue.append(_Job.fresh(job.workload))  # recurring workload
                    job = None
            running_job = job

            timeline.append(
                {
                    "time": state["timestamp"],
                    "orbital_state": state,
                    "temperature_c": temp,
                    "task_running": decision.job.workload.name if decision.job else None,
                    "task_heat_watts": task_heat,
                    "cooling_watts": q_out,
                    "thermal_status": status,
                    "battery_percent": battery.percent,
                    "power_available_watts": power_available,
                    "decision": decision.reason,
                    "task_completed": finished,
                }
            )

        return {
            "scheduler": name,
            "timeline": timeline,
            "total_tasks_completed": sum(completed.values()),
            "total_compute_seconds": compute_seconds,
            "lost_compute_seconds": lost_compute_seconds,
            "max_temperature_reached": max_temp,
            "thermal_shutdowns_avoided": shutdowns_avoided,
            "thermal_shutdowns": shutdowns,
            "shutdown_minutes": shutdown_steps * dt / 60.0,
            "min_battery_percent": min_battery,
            "completed_by_task": dict(completed),
        }
