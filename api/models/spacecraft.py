"""
Pydantic schemas for Spacecraft configuration.

These models are used for API validation, serialization, and as the shared
"contract" between frontend ↔ backend ↔ simulation engine.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ───────────────────────────────────────────────────────────────────

class PayloadType(str, Enum):
    """Supported payload sensor types."""
    MULTISPECTRAL_IMAGER = "multispectral_imager"
    THERMAL_IMAGER = "thermal_imager"
    THERMAL_INFRARED = "thermal_infrared"
    SAR = "synthetic_aperture_radar"
    UV_SPECTROMETER = "uv_spectrometer"
    UV_CORONAGRAPH = "uv_coronagraph"
    MAGNETOMETER = "magnetometer"
    OPTICAL_CAMERA = "optical_camera"


# ── Subsystem schemas ──────────────────────────────────────────────────────

class PowerSubsystem(BaseModel):
    """Electrical power subsystem parameters."""
    solar_panel_area_m2: float = Field(default=6.0, ge=0.5, le=50.0,
                                       description="Solar panel area in m²")
    battery_capacity_wh: float = Field(default=2000.0, ge=100.0, le=20000.0,
                                        description="Battery capacity in Wh")


class ThermalSubsystem(BaseModel):
    """Thermal control subsystem parameters."""
    radiator_area_m2: float = Field(default=2.0, ge=0.1, le=20.0,
                                     description="Radiator area in m²")


class CommsSubsystem(BaseModel):
    """Communications subsystem parameters."""
    antenna_gain_dbi: float = Field(default=25.0, ge=5.0, le=50.0,
                                     description="Antenna gain in dBi")
    transmit_power_w: float = Field(default=10.0, ge=1.0, le=100.0,
                                     description="Transmitter power in watts")


class PropulsionSubsystem(BaseModel):
    """Propulsion subsystem parameters."""
    isp_s: float = Field(default=220.0, ge=50.0, le=5000.0,
                          description="Specific impulse in seconds")
    thrust_n: float = Field(default=1.0, ge=0.001, le=500.0,
                             description="Thrust in Newtons")


class PayloadSubsystem(BaseModel):
    """Payload / instrument parameters."""
    payload_type: PayloadType = PayloadType.MULTISPECTRAL_IMAGER
    mass_kg: float = Field(default=30.0, ge=1.0, le=200.0)
    power_w: float = Field(default=80.0, ge=5.0, le=500.0,
                            description="Power draw when active in watts")


class StructureSubsystem(BaseModel):
    """Structural / mass properties."""
    dry_mass_kg: float = Field(default=500.0, ge=50.0, le=5000.0,
                                description="Dry mass (without fuel) in kg")
    fuel_mass_kg: float = Field(default=50.0, ge=0.0, le=1000.0,
                                 description="Fuel mass in kg")


# ── Spacecraft aggregate ───────────────────────────────────────────────────

class SpacecraftCreate(BaseModel):
    """Request body for creating a spacecraft configuration."""
    name: str = Field(..., min_length=1, max_length=120)
    description: str = ""
    structure: StructureSubsystem = StructureSubsystem()
    power: PowerSubsystem = PowerSubsystem()
    thermal: ThermalSubsystem = ThermalSubsystem()
    comms: CommsSubsystem = CommsSubsystem()
    propulsion: PropulsionSubsystem = PropulsionSubsystem()
    payload: PayloadSubsystem = PayloadSubsystem()


class SpacecraftUpdate(BaseModel):
    """Partial update for a spacecraft configuration."""
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    description: Optional[str] = None
    structure: Optional[StructureSubsystem] = None
    power: Optional[PowerSubsystem] = None
    thermal: Optional[ThermalSubsystem] = None
    comms: Optional[CommsSubsystem] = None
    propulsion: Optional[PropulsionSubsystem] = None
    payload: Optional[PayloadSubsystem] = None


class SpacecraftResponse(BaseModel):
    """Full spacecraft configuration returned from the API."""
    id: str
    name: str
    description: str
    structure: StructureSubsystem
    power: PowerSubsystem
    thermal: ThermalSubsystem
    comms: CommsSubsystem
    propulsion: PropulsionSubsystem
    payload: PayloadSubsystem
    total_mass_kg: float = Field(description="Computed: dry + fuel + payload mass")
    created_at: datetime
    updated_at: datetime


class SpacecraftValidation(BaseModel):
    """Result of spacecraft design validation."""
    valid: bool
    warnings: list[str] = []
    errors: list[str] = []
    mass_budget_kg: float
    power_budget_w: float
    thermal_margin_pct: float

