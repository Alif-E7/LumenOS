"""
Storage & Workload Subsystem Model — Onboard Data Management and Processing.

Models:
- Multi-queue onboard solid-state storage (SSDR):
  * raw_data_mb: Uncompressed instrument captures
  * processed_data_mb: Calibrated, compressed science products ready for downlink
  * priority_alerts_mb: High-priority immediate alert packages (wildfire hotspot, flood crest, etc.)
  * dropped_overflow_mb: Unbuffered data dropped due to capacity exhaustion
- Data queue growth, compression pipelines, deletion, and overflow mitigation.
- Priority-protected overflow management: raw observations are dropped first when
  capacity is exceeded, while priority alerts and processed science are preserved.
- On-board processor workload and task management:
  * Task priority, deadline, duration, energy cost, heat contribution, storage needs, and output quality.
  * Operational profiles: FULL, ECO, SAFE (user-facing operational profiles,
    explicitly NOT synonyms for FP32, INT8, or TinyML).

REFERENCE assumptions:
- Flash storage capacity ~4000 to 16000 MB
- Lossless/lossy compression ratios: 3.0:1 in FULL, 2.0:1 in ECO, 1.0:1 (bypass) in SAFE
- Task execution queues with deadline tracking and priority-first scheduling
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


# ── Operational Profiles ─────────────────────────────────────────────────────

class WorkloadProfile(str, Enum):
    """
    User-facing spacecraft computer operational profiles.

    NOTE: Full, Eco, and Safe are user-facing operational profiles,
    NOT synonyms for FP32, INT8, or TinyML machine learning quantization.
    """
    FULL = "FULL"    # Maximum throughput: all pipelines active, 35 W CPU, high science quality
    ECO = "ECO"      # Power-saving mode: throttled CPU (15 W), balanced compression, lower heat
    SAFE = "SAFE"    # Survival mode: minimal housekeeping (5 W), instruments disabled, minimal heat


@dataclass
class StorageConfig:
    """Onboard solid-state data recorder configuration."""
    capacity_mb: float = 8000.0         # 8 GB flash recorder
    write_speed_mbps: float = 100.0     # Maximum bus write rate
    read_speed_mbps: float = 200.0      # Maximum bus read rate
    safe_reserve_mb: float = 800.0      # Protected space reserved for telemetry & priority alerts


@dataclass
class ProcessingTask:
    """A distinct computational task managed by the spacecraft flight computer."""
    name: str
    priority: int = 5                  # 1=critical (housekeeping/FDIR), 10=background
    deadline_step: int = 999999
    duration_steps: int = 1
    energy_w: float = 15.0             # Electrical power consumed while active
    heat_w: float = 15.0               # Waste heat dissipated into thermal subsystem
    storage_needed_mb: float = 10.0    # RAM/scratch storage required
    output_quality: str = "standard"   # "high" | "standard" | "minimal"
    active: bool = True


@dataclass
class WorkloadConfig:
    """Flight computer processor workload configuration."""
    max_cpu_pct: float = 100.0
    base_housekeeping_cpu_pct: float = 12.0
    adcs_cpu_pct: float = 8.0
    thermal_cpu_pct: float = 5.0
    comms_cpu_pct: float = 5.0
    # Dynamic profile parameters
    full_profile_cpu_draw_w: float = 35.0
    eco_profile_cpu_draw_w: float = 15.0
    safe_profile_cpu_draw_w: float = 5.0


@dataclass
class StorageState:
    """Storage subsystem state at a simulation step."""
    used_mb: float = 0.0
    free_mb: float = 8000.0
    used_pct: float = 0.0
    raw_data_mb: float = 0.0
    processed_data_mb: float = 0.0
    priority_alerts_mb: float = 0.0
    dropped_overflow_mb: float = 0.0
    total_written_mb: float = 0.0
    total_read_mb: float = 0.0
    storage_full_warning: bool = False
    overflow_risk_pct: float = 0.0
    compression_ratio: float = 2.5


@dataclass
class WorkloadState:
    """Flight computer workload state at a simulation step."""
    operational_profile: WorkloadProfile = WorkloadProfile.FULL
    cpu_usage_pct: float = 15.0
    active_tasks: list[str] = field(default_factory=list)
    cpu_power_w: float = 35.0
    waste_heat_w: float = 35.0
    cpu_overload_warning: bool = False
    processing_queue_items: int = 0
    output_quality: str = "high"
    profile_educational_note: str = (
        "Full/Eco/Safe are user-facing operational profiles, not synonyms for FP32/INT8/TinyML"
    )


@dataclass
class StorageModel:
    """
    Onboard Solid-State Storage Simulation Model.

    Maintains segregated queues for:
    - Raw observations (unprocessed sensor captures)
    - Processed science products (calibrated, compressed products)
    - Priority alerts (urgent real-time alerts for natural hazards / space weather)
    """
    config: StorageConfig = field(default_factory=StorageConfig)
    state: StorageState = field(default_factory=StorageState)

    def __post_init__(self):
        self.state.free_mb = self.config.capacity_mb
        self.state.used_mb = 0.0
        self.state.used_pct = 0.0

    def write_raw(self, amount_mb: float) -> float:
        """
        Record raw instrument observation data to storage.
        If capacity is exceeded, excess raw data is dropped.
        """
        if amount_mb <= 0.0:
            return 0.0

        available = max(0.0, self.config.capacity_mb - self.state.used_mb)
        stored = min(amount_mb, available)
        dropped = amount_mb - stored

        self.state.raw_data_mb += stored
        self.state.dropped_overflow_mb += dropped
        self.state.total_written_mb += stored
        self._update_state()
        return stored

    def write_processed(self, amount_mb: float) -> float:
        """Record processed, compressed science products."""
        if amount_mb <= 0.0:
            return 0.0

        available = max(0.0, self.config.capacity_mb - self.state.used_mb)
        stored = min(amount_mb, available)
        dropped = amount_mb - stored

        self.state.processed_data_mb += stored
        self.state.dropped_overflow_mb += dropped
        self.state.total_written_mb += stored
        self._update_state()
        return stored

    def write_priority_alert(self, amount_mb: float) -> float:
        """
        Record critical hazard alert packages.
        Alerts are protected: if storage is full, raw data is pruned to fit the alert.
        """
        if amount_mb <= 0.0:
            return 0.0

        available = self.config.capacity_mb - self.state.used_mb
        if available < amount_mb and self.state.raw_data_mb > 0.0:
            # Drop enough raw data to fit the critical alert
            needed = amount_mb - available
            reclaimed = min(self.state.raw_data_mb, needed)
            self.state.raw_data_mb -= reclaimed
            self.state.dropped_overflow_mb += reclaimed
            available += reclaimed

        stored = min(amount_mb, available)
        self.state.priority_alerts_mb += stored
        self.state.total_written_mb += stored
        self._update_state()
        return stored

    def write(self, amount_mb: float) -> float:
        """Backward-compatible write method for legacy calls (routes to raw)."""
        return self.write_raw(amount_mb)

    def read(self, amount_mb: float) -> float:
        """
        Extract / delete data from storage (FIFO: raw first, then processed, then alerts).
        Returns the total amount successfully read.
        """
        if amount_mb <= 0.0:
            return 0.0

        remaining_to_read = amount_mb

        # 1. Read from raw data
        from_raw = min(self.state.raw_data_mb, remaining_to_read)
        self.state.raw_data_mb -= from_raw
        remaining_to_read -= from_raw

        # 2. Read from processed data
        from_proc = min(self.state.processed_data_mb, remaining_to_read)
        self.state.processed_data_mb -= from_proc
        remaining_to_read -= from_proc

        # 3. Read from priority alerts
        from_alerts = min(self.state.priority_alerts_mb, remaining_to_read)
        self.state.priority_alerts_mb -= from_alerts
        remaining_to_read -= from_alerts

        total_read = amount_mb - remaining_to_read
        self.state.total_read_mb += total_read
        self._update_state()
        return total_read

    def extract_downlink_data(self, max_downlink_mb: float) -> dict[str, float]:
        """
        Extract data for transmission during ground station contact.
        PRIORITY DOWNLINK ORDER:
        1. Priority alerts (emergency hazard notifications)
        2. Processed science products (high science value)
        3. Raw observations (bulk telemetry)
        """
        if max_downlink_mb <= 0.0:
            return {"alerts": 0.0, "processed": 0.0, "raw": 0.0, "total": 0.0}

        budget = max_downlink_mb

        # 1. Priority alerts first
        dl_alerts = min(self.state.priority_alerts_mb, budget)
        self.state.priority_alerts_mb -= dl_alerts
        budget -= dl_alerts

        # 2. Processed science products
        dl_proc = min(self.state.processed_data_mb, budget)
        self.state.processed_data_mb -= dl_proc
        budget -= dl_proc

        # 3. Raw observations last
        dl_raw = min(self.state.raw_data_mb, budget)
        self.state.raw_data_mb -= dl_raw
        budget -= dl_raw

        total_extracted = dl_alerts + dl_proc + dl_raw
        self.state.total_read_mb += total_extracted
        self._update_state()

        return {
            "alerts": dl_alerts,
            "processed": dl_proc,
            "raw": dl_raw,
            "total": total_extracted,
        }

    def process_raw_pipeline(
        self,
        dt_seconds: float,
        profile: WorkloadProfile,
    ) -> float:
        """
        On-board compute task: process and compress raw observations into processed products.
        In FULL profile: 3.0:1 compression ratio, high throughput.
        In ECO profile: 2.0:1 compression ratio, moderate throughput.
        In SAFE profile: processing pipeline halted to conserve power.
        """
        if profile == WorkloadProfile.SAFE or self.state.raw_data_mb <= 0.0:
            return 0.0

        if profile == WorkloadProfile.FULL:
            compression_ratio = 3.0
            process_rate_mb_per_min = 20.0
        else:  # ECO
            compression_ratio = 2.0
            process_rate_mb_per_min = 10.0

        max_raw_to_process = process_rate_mb_per_min * (dt_seconds / 60.0)
        raw_consumed = min(self.state.raw_data_mb, max_raw_to_process)
        if raw_consumed <= 0.0:
            return 0.0

        self.state.raw_data_mb -= raw_consumed
        compressed_product = raw_consumed / compression_ratio
        self.state.processed_data_mb += compressed_product
        self.state.compression_ratio = compression_ratio

        self._update_state()
        return compressed_product

    def _update_state(self):
        total_used = self.state.raw_data_mb + self.state.processed_data_mb + self.state.priority_alerts_mb
        self.state.used_mb = total_used
        self.state.free_mb = max(0.0, self.config.capacity_mb - total_used)
        pct = (total_used / max(1.0, self.config.capacity_mb)) * 100.0
        self.state.used_pct = min(100.0, pct)
        self.state.storage_full_warning = pct > 90.0
        # Overflow risk based on free margin
        self.state.overflow_risk_pct = max(0.0, min(100.0, (pct - 70.0) * 3.33)) if pct > 70.0 else 0.0


@dataclass
class WorkloadModel:
    """
    Flight Computer Processor Workload Simulation Model.

    Manages computational task scheduling, CPU utilization, electrical power draw,
    and waste heat dissipation according to the active WorkloadProfile (FULL, ECO, SAFE).
    """
    config: WorkloadConfig = field(default_factory=WorkloadConfig)
    state: WorkloadState = field(default_factory=WorkloadState)
    tasks: list[ProcessingTask] = field(default_factory=list)

    def __post_init__(self):
        if not self.tasks:
            self.tasks = [
                ProcessingTask("housekeeping_fdir", priority=1, energy_w=5.0, heat_w=5.0, output_quality="high"),
                ProcessingTask("adcs_pointing", priority=2, energy_w=5.0, heat_w=5.0, output_quality="high"),
                ProcessingTask("thermal_control", priority=3, energy_w=2.0, heat_w=2.0, output_quality="standard"),
                ProcessingTask("payload_ingest", priority=5, energy_w=8.0, heat_w=8.0, output_quality="high"),
                ProcessingTask("compression_pipeline", priority=6, energy_w=15.0, heat_w=15.0, output_quality="high"),
            ]

    def set_profile(self, profile: WorkloadProfile | str) -> WorkloadProfile:
        """Switch user-facing operational profile (FULL, ECO, SAFE)."""
        if isinstance(profile, str):
            profile = WorkloadProfile(profile.upper())
        self.state.operational_profile = profile
        return profile

    def compute_workload(
        self,
        payload_active: bool = True,
        data_processing_active: bool = True,
        extra_tasks: Optional[list[str]] = None,
        profile: Optional[WorkloadProfile | str] = None,
    ) -> WorkloadState:
        """
        Evaluate processor CPU load, power consumption, and thermal dissipation.
        """
        if profile is not None:
            self.set_profile(profile)

        prof = self.state.operational_profile

        # Housekeeping baseline
        cpu = (
            self.config.base_housekeeping_cpu_pct
            + self.config.adcs_cpu_pct
            + self.config.thermal_cpu_pct
        )
        task_names = ["housekeeping_fdir", "adcs_pointing", "thermal_control"]

        if prof == WorkloadProfile.FULL:
            cpu_power = self.config.full_profile_cpu_draw_w
            output_quality = "high"
            if payload_active:
                cpu += 25.0
                task_names.append("payload_high_res_ingest")
            if data_processing_active:
                cpu += 30.0
                task_names.append("lossless_compression_feature_detect")
        elif prof == WorkloadProfile.ECO:
            cpu_power = self.config.eco_profile_cpu_draw_w
            output_quality = "standard"
            if payload_active:
                cpu += 15.0
                task_names.append("payload_duty_cycle_ingest")
            if data_processing_active:
                cpu += 15.0
                task_names.append("standard_compression")
        else:  # SAFE
            cpu_power = self.config.safe_profile_cpu_draw_w
            output_quality = "minimal"
            # Payload and compression suspended in SAFE profile
            cpu = self.config.base_housekeeping_cpu_pct

        if extra_tasks:
            cpu += len(extra_tasks) * 5.0
            task_names.extend(extra_tasks)

        cpu = min(100.0, max(5.0, cpu))
        overload = cpu > 90.0

        self.state = WorkloadState(
            operational_profile=prof,
            cpu_usage_pct=cpu,
            active_tasks=task_names,
            cpu_power_w=cpu_power,
            waste_heat_w=cpu_power,  # 100% of electrical CPU draw is dissipated as heat
            cpu_overload_warning=overload,
            processing_queue_items=len(task_names),
            output_quality=output_quality,
        )
        return self.state
