"""Thermal Engine — spacecraft temperature state, thermal budget, and power reserves.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
Managing limited resources is the core challenge of any space mission. On a
spacecraft running an orbital AI data center there are three tightly-coupled
resource budgets the mission designer must balance:

* **Thermal budget** — how much heat the server generates vs. how much the
  radiator can reject. This is not constant: it varies every orbit as the
  radiator swings from deep space (3 K, excellent rejection) to Earth day-side
  (280 K, severely limited rejection). Each hardware design choice — radiator
  area, server chassis mass — directly shapes this budget.

* **Power budget** — solar array output in sunlight vs. battery reserves during
  eclipse. An empty battery forces a hard SHUTDOWN, destroying active compute.

* **Compute budget** — how many workloads can run before thermal or power limits
  are hit. A thermally-blind ("naive") OS burns through this budget carelessly.
  LumenOS preserves it via predictive pausing and mission-aware checkpointing.

This module implements the lumped-capacitance thermal model and battery state
tracker. It answers the mission-critical question every 30 seconds:

    "Is the spacecraft thermally safe to run the next workload?"

Lumped Capacitance Model (simplified for educational clarity):

    dT/dt = (Q_in - Q_out) / (m * Cp)

    Q_in  = base_heat (idle electronics) + workload_heat + (solar absorption)
    Q_out = radiator heat rejection (Stefan-Boltzmann, temperature-dependent)
    m     = spacecraft server block mass (kg)       — mission design variable
    Cp    = specific heat capacity (J/kg·K)

Integrated with explicit (forward) Euler steps:

    T_new = T_old + ((Q_in - Q_out) / (m * Cp)) * dt

Radiator heat rejection is evaluated at the server's *actual* temperature and
capped at the orbital engine's maximum capacity (the radiator's 340 K design
point). A cool spacecraft therefore rejects less heat than a hot one — which
is what stops idle hardware from drifting to the -20 °C floor and what makes
a radiator facing warm day-side Earth (280 K) genuinely mission-threatening.

Battery model (the eclipse survival sub-budget):
    The :class:`Battery` charges from excess solar power in sunlight and
    supplies up to 200 W during eclipse. An empty battery forces SHUTDOWN,
    destroying any in-progress computation — the ultimate mission failure.
"""

from __future__ import annotations

from typing import Any, Optional

from engine.orbital_engine import radiator_cooling_capacity

# Hardware temperature limits (°C) — the model never leaves this range.
MIN_TEMP_CELSIUS: float = -20.0
MAX_TEMP_CELSIUS: float = 120.0

# Thermal status thresholds (°C)
WARNING_THRESHOLD_CELSIUS: float = 60.0
CRITICAL_THRESHOLD_CELSIUS: float = 80.0
SHUTDOWN_THRESHOLD_CELSIUS: float = 95.0

NOMINAL = "NOMINAL"
WARNING = "WARNING"
CRITICAL = "CRITICAL"
SHUTDOWN = "SHUTDOWN"

KELVIN_OFFSET: float = 273.15
_PREDICTION_STEP_SECONDS: float = 30.0


def _clamp(temp_celsius: float) -> float:
    """Clamp a temperature to the hardware limits."""
    return max(MIN_TEMP_CELSIUS, min(MAX_TEMP_CELSIUS, temp_celsius))


# --------------------------------------------------------------------------- #
# Battery
# --------------------------------------------------------------------------- #
class Battery:
    """Simple energy-bucket battery.

    * **Sunlit:** the solar array powers the load; any excess solar charges
      the battery. If the load exceeds solar, the battery covers the deficit.
    * **Eclipse:** the battery is the only source and supplies at most
      ``max_discharge_watts`` (200 W by default).
    * **0 %:** no power at all — the system must SHUTDOWN.
    """

    def __init__(
        self,
        capacity_wh: float = 500,
        max_discharge_watts: float = 200,
        initial_percent: float = 100,
    ) -> None:
        """Create the battery.

        Args:
            capacity_wh: Usable capacity in watt-hours.
            max_discharge_watts: Maximum power the battery can deliver.
            initial_percent: Starting state of charge (0-100).

        Raises:
            ValueError: If capacity or discharge limit is not positive.
        """
        if capacity_wh <= 0:
            raise ValueError("capacity_wh must be positive")
        if max_discharge_watts <= 0:
            raise ValueError("max_discharge_watts must be positive")
        self.capacity_wh: float = float(capacity_wh)
        self.max_discharge_watts: float = float(max_discharge_watts)
        self.initial_percent: float = max(0.0, min(100.0, float(initial_percent)))
        self.charge_wh: float = self.capacity_wh * self.initial_percent / 100.0

    @property
    def percent(self) -> float:
        """State of charge in percent (0-100)."""
        return 100.0 * self.charge_wh / self.capacity_wh

    @property
    def is_depleted(self) -> bool:
        """``True`` when the battery is empty."""
        return self.charge_wh <= 1e-9

    def _max_discharge_for(self, dt_seconds: float) -> float:
        """Most power the battery can deliver for ``dt_seconds`` (rate + energy limited)."""
        return min(self.max_discharge_watts, self.charge_wh * 3600.0 / dt_seconds)

    def available_power(
        self, is_sunlit: bool, solar_power_watts: float, dt_seconds: float = 30
    ) -> float:
        """Total electrical power the bus can supply for the next step.

        Args:
            is_sunlit: Whether the satellite is in sunlight.
            solar_power_watts: Current solar array output.
            dt_seconds: Step length.

        Returns:
            Available power in watts (solar in sunlight, battery in eclipse).
        """
        if is_sunlit:
            return solar_power_watts
        return self._max_discharge_for(dt_seconds)

    def step(
        self,
        is_sunlit: bool,
        solar_power_watts: float,
        load_watts: float,
        dt_seconds: float = 30,
    ) -> float:
        """Charge or discharge for one time step.

        Args:
            is_sunlit: Whether the satellite is in sunlight.
            solar_power_watts: Current solar array output.
            load_watts: Total electrical load (base electronics + workload).
            dt_seconds: Step length.

        Returns:
            New state of charge in percent.
        """
        hours = dt_seconds / 3600.0
        supply = solar_power_watts if is_sunlit else 0.0
        net_watts = supply - load_watts
        if net_watts >= 0:
            self.charge_wh = min(self.capacity_wh, self.charge_wh + net_watts * hours)
        else:
            drawn = min(-net_watts, self._max_discharge_for(dt_seconds))
            self.charge_wh = max(0.0, self.charge_wh - drawn * hours)
        return self.percent

    def reset(self) -> None:
        """Restore the initial state of charge."""
        self.charge_wh = self.capacity_wh * self.initial_percent / 100.0


# --------------------------------------------------------------------------- #
# Thermal engine
# --------------------------------------------------------------------------- #
class ThermalEngine:
    """Lumped-capacitance thermal model of the orbital server block, plus its battery.

    Example:
        >>> thermal = ThermalEngine()
        >>> thermal.update_temperature(q_in_watts=1000, q_out_watts=550, dt_seconds=30)
        26.0
        >>> thermal.get_thermal_status(thermal.current_temp_celsius)
        'NOMINAL'
    """

    def __init__(
        self,
        mass_kg: float = 15,
        specific_heat: float = 900,
        initial_temp_celsius: float = 25,
        base_heat_watts: float = 100,
        battery_capacity_wh: float = 500,
        battery_discharge_watts: float = 200,
        initial_battery_percent: float = 100,
        *,
        server_mass: Optional[float] = None,
        server_mass_kg: Optional[float] = None,
        battery_capacity: Optional[float] = None,
        **kwargs: Any,
    ) -> None:
        """Create the thermal model.

        Args:
            mass_kg: Mass of the server block (default 15 kg of aluminium).
            specific_heat: Specific heat capacity Cp in J/kg.K (aluminium ~900).
            initial_temp_celsius: Starting temperature in °C.
            base_heat_watts: Idle electronics heat (and electrical draw) in watts.
            battery_capacity_wh: Battery capacity in watt-hours.
            battery_discharge_watts: Maximum battery output (eclipse supply).
            initial_battery_percent: Starting battery charge (0-100).
            server_mass: Alias for mass_kg.
            server_mass_kg: Alias for mass_kg.
            battery_capacity: Alias for battery_capacity_wh.

        Raises:
            ValueError: If mass, specific heat or base heat is invalid.
        """
        if server_mass is not None:
            mass_kg = float(server_mass)
        elif server_mass_kg is not None:
            mass_kg = float(server_mass_kg)

        if battery_capacity is not None:
            battery_capacity_wh = float(battery_capacity)

        if mass_kg <= 0:
            raise ValueError("mass_kg must be positive")
        if specific_heat <= 0:
            raise ValueError("specific_heat must be positive")
        if base_heat_watts < 0:
            raise ValueError("base_heat_watts must be non-negative")

        self.mass_kg: float = float(mass_kg)
        self.specific_heat: float = float(specific_heat)
        self.base_heat_watts: float = float(base_heat_watts)
        self.initial_temp_celsius: float = _clamp(float(initial_temp_celsius))
        self.current_temp_celsius: float = self.initial_temp_celsius
        self.battery: Battery = Battery(
            capacity_wh=battery_capacity_wh,
            max_discharge_watts=battery_discharge_watts,
            initial_percent=initial_battery_percent,
        )

    @property
    def heat_capacity_j_per_k(self) -> float:
        """Total thermal mass ``m * Cp`` in J/K (energy needed to warm the block by 1 K)."""
        return self.mass_kg * self.specific_heat

    def total_heat_input(
        self, ai_heat_watts: float, solar_heat_absorbed_watts: float = 0.0
    ) -> float:
        """Combine heat sources into ``Q_in`` (base electronics + AI + solar).

        Args:
            ai_heat_watts: Heat generated by running AI workloads.
            solar_heat_absorbed_watts: Solar heat absorbed by the structure.

        Returns:
            ``Q_in`` in watts.
        """
        return self.base_heat_watts + ai_heat_watts + solar_heat_absorbed_watts

    def radiator_heat_rejection(
        self,
        sink_temperature_kelvin: float,
        max_cooling_capacity_watts: float,
        temp_celsius: Optional[float] = None,
    ) -> float:
        """Heat the radiator actually rejects at a given hardware temperature.

        ``Q_out = min(max_capacity, eps * sigma * A * (T^4 - T_sink^4))``

        Args:
            sink_temperature_kelvin: What the radiator sees (3 / 220 / 280 K).
            max_cooling_capacity_watts: Cap from the orbital engine (design point).
            temp_celsius: Hardware temperature; defaults to the current temperature.

        Returns:
            ``Q_out`` in watts.
        """
        temp = self.current_temp_celsius if temp_celsius is None else temp_celsius
        actual = radiator_cooling_capacity(sink_temperature_kelvin, temp + KELVIN_OFFSET)
        return min(max_cooling_capacity_watts, actual)

    def update_temperature(
        self,
        q_in_watts: float,
        q_out_watts: float,
        dt_seconds: float = 30,
    ) -> float:
        """Advance the model by one time step.

        ``T_new = T_old + ((q_in - q_out) / (m * Cp)) * dt``, clamped to
        [-20 °C, 120 °C].

        Args:
            q_in_watts: Total heat entering the block (base + AI + solar).
            q_out_watts: Heat rejected by the radiator.
            dt_seconds: Step length in seconds.

        Returns:
            The new temperature in °C (also stored in ``current_temp_celsius``).
        """
        delta = (q_in_watts - q_out_watts) / self.heat_capacity_j_per_k * dt_seconds
        self.current_temp_celsius = _clamp(self.current_temp_celsius + delta)
        return self.current_temp_celsius

    def get_thermal_status(self, current_temp_celsius: float) -> str:
        """Classify a temperature into a thermal status.

        Args:
            current_temp_celsius: Temperature in °C.

        Returns:
            ``"NOMINAL"`` (< 60), ``"WARNING"`` (60-80), ``"CRITICAL"`` (80-95)
            or ``"SHUTDOWN"`` (>= 95, or battery at 0 %).
        """
        if current_temp_celsius >= SHUTDOWN_THRESHOLD_CELSIUS or self.battery.is_depleted:
            return SHUTDOWN
        if current_temp_celsius >= CRITICAL_THRESHOLD_CELSIUS:
            return CRITICAL
        if current_temp_celsius >= WARNING_THRESHOLD_CELSIUS:
            return WARNING
        return NOMINAL

    def predict_temperature(
        self,
        current_temp: float,
        planned_task_heat: float,
        cooling_capacity: float,
        duration_minutes: float = 15,
        solar_heat_absorbed_watts: float = 0.0,
        sink_temperature_kelvin: Optional[float] = None,
    ) -> float:
        """Predict the temperature after running a task, WITHOUT changing state.

        Used by the scheduler to look ahead before starting a task. Base heat is
        always included. Orbital conditions are assumed constant over the window.

        * Without ``sink_temperature_kelvin``: ``cooling_capacity`` is treated as
          a constant ``Q_out`` (closed-form, linear).
        * With it: ``Q_out`` follows the temperature-dependent radiator model
          (capped at ``cooling_capacity``), integrated in 30 s steps — the same
          physics the simulation uses.

        Args:
            current_temp: Starting temperature in °C.
            planned_task_heat: Heat the task generates, in watts.
            cooling_capacity: Radiator cooling (or its cap), in watts.
            duration_minutes: How long the task would run.
            solar_heat_absorbed_watts: Extra solar heat load, in watts.
            sink_temperature_kelvin: Radiator sink temperature, enables the
                temperature-dependent model.

        Returns:
            Predicted temperature in °C, clamped to hardware limits.
        """
        q_in = self.total_heat_input(planned_task_heat, solar_heat_absorbed_watts)
        total_seconds = duration_minutes * 60.0

        if sink_temperature_kelvin is None:
            delta = (q_in - cooling_capacity) / self.heat_capacity_j_per_k * total_seconds
            return _clamp(current_temp + delta)

        temp = current_temp
        elapsed = 0.0
        while elapsed < total_seconds:
            dt = min(_PREDICTION_STEP_SECONDS, total_seconds - elapsed)
            q_out = self.radiator_heat_rejection(sink_temperature_kelvin, cooling_capacity, temp)
            temp = _clamp(temp + (q_in - q_out) / self.heat_capacity_j_per_k * dt)
            elapsed += dt
        return temp

    def reset(self) -> None:
        """Restore initial temperature and battery charge (before a new simulation run)."""
        self.current_temp_celsius = self.initial_temp_celsius
        self.battery.reset()
