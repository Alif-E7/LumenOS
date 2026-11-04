"""
Storage & Workload Model — Onboard data storage and processor workload.

Models:
- Data storage usage (observations collected vs capacity)
- Processor workload for data processing, attitude control, thermal regulation
- Processing queue management
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StorageConfig:
    """Onboard data storage configuration."""
    capacity_mb: float = 4000.0         # 4 GB solid-state recorder
    write_speed_mbps: float = 50.0      # Write speed
    read_speed_mbps: float = 100.0      # Read speed


@dataclass
class WorkloadConfig:
    """Processor workload configuration."""
    max_cpu_pct: float = 100.0
    base_cpu_pct: float = 15.0          # Housekeeping always running
    attitude_cpu_pct: float = 10.0
    thermal_cpu_pct: float = 5.0
    data_processing_cpu_pct: float = 20.0
    payload_cpu_pct: float = 25.0


@dataclass
class StorageState:
    """Storage subsystem state."""
    used_mb: float = 0.0
    free_mb: float = 4000.0
    used_pct: float = 0.0
    total_written_mb: float = 0.0
    total_read_mb: float = 0.0
    storage_full_warning: bool = False


@dataclass
class WorkloadState:
    """Processor workload state."""
    cpu_usage_pct: float = 15.0
    active_tasks: list[str] = field(default_factory=list)
    cpu_overload_warning: bool = False
    processing_queue_items: int = 0


@dataclass
class StorageModel:
    """Onboard storage simulation model."""
    config: StorageConfig = field(default_factory=StorageConfig)
    state: StorageState = field(default_factory=StorageState)

    def __post_init__(self):
        self.state.free_mb = self.config.capacity_mb

    def write(self, amount_mb: float) -> float:
        """Write data to storage. Returns amount actually written."""
        available = self.config.capacity_mb - self.state.used_mb
        written = min(amount_mb, available)
        self.state.used_mb += written
        self.state.total_written_mb += written
        self._update_state()
        return written

    def read(self, amount_mb: float) -> float:
        """Read/delete data from storage. Returns amount actually read."""
        readable = min(amount_mb, self.state.used_mb)
        self.state.used_mb -= readable
        self.state.total_read_mb += readable
        self._update_state()
        return readable

    def _update_state(self):
        self.state.free_mb = self.config.capacity_mb - self.state.used_mb
        self.state.used_pct = (self.state.used_mb / self.config.capacity_mb) * 100.0
        self.state.storage_full_warning = self.state.used_pct > 90.0


@dataclass
class WorkloadModel:
    """Processor workload simulation model."""
    config: WorkloadConfig = field(default_factory=WorkloadConfig)
    state: WorkloadState = field(default_factory=WorkloadState)

    def compute_workload(
        self,
        payload_active: bool = True,
        data_processing_active: bool = True,
        extra_tasks: list[str] | None = None,
    ) -> WorkloadState:
        """Calculate current CPU workload."""
        cpu = self.config.base_cpu_pct + self.config.attitude_cpu_pct + self.config.thermal_cpu_pct

        tasks = ["housekeeping", "attitude_control", "thermal_regulation"]

        if payload_active:
            cpu += self.config.payload_cpu_pct
            tasks.append("payload_acquisition")

        if data_processing_active:
            cpu += self.config.data_processing_cpu_pct
            tasks.append("data_processing")

        if extra_tasks:
            cpu += len(extra_tasks) * 5.0
            tasks.extend(extra_tasks)

        cpu = min(cpu, 100.0)

        self.state = WorkloadState(
            cpu_usage_pct=cpu,
            active_tasks=tasks,
            cpu_overload_warning=cpu > 90.0,
        )
        return self.state

