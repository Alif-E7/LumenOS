"""
Spacecraft configuration CRUD endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.database import SpacecraftConfigRow, get_session
from api.models.spacecraft import (
    SpacecraftCreate,
    SpacecraftResponse,
    SpacecraftUpdate,
    SpacecraftValidation,
)

router = APIRouter(prefix="/spacecraft", tags=["spacecraft"])


# ── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_response(row: SpacecraftConfigRow) -> SpacecraftResponse:
    """Convert a DB row into a SpacecraftResponse."""
    from api.models.spacecraft import (
        CommsSubsystem,
        PayloadSubsystem,
        PowerSubsystem,
        PropulsionSubsystem,
        StructureSubsystem,
        ThermalSubsystem,
    )

    structure = StructureSubsystem(dry_mass_kg=row.dry_mass_kg, fuel_mass_kg=row.fuel_mass_kg)
    power = PowerSubsystem(solar_panel_area_m2=row.solar_panel_area_m2,
                           battery_capacity_wh=row.battery_capacity_wh)
    thermal = ThermalSubsystem(radiator_area_m2=row.radiator_area_m2)
    comms = CommsSubsystem(antenna_gain_dbi=row.antenna_gain_dbi,
                           transmit_power_w=row.transmit_power_w)
    propulsion = PropulsionSubsystem(isp_s=row.isp_s, thrust_n=row.thrust_n)
    payload = PayloadSubsystem(payload_type=row.payload_type,
                               mass_kg=row.payload_mass_kg,
                               power_w=row.payload_power_w)

    total_mass = row.dry_mass_kg + row.fuel_mass_kg + row.payload_mass_kg

    return SpacecraftResponse(
        id=row.id,
        name=row.name,
        description=row.description or "",
        structure=structure,
        power=power,
        thermal=thermal,
        comms=comms,
        propulsion=propulsion,
        payload=payload,
        total_mass_kg=total_mass,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SpacecraftResponse])
async def list_spacecraft(session: AsyncSession = Depends(get_session)):
    """List all saved spacecraft configurations."""
    result = await session.execute(select(SpacecraftConfigRow))
    rows = result.scalars().all()
    return [_row_to_response(r) for r in rows]


@router.post("", response_model=SpacecraftResponse, status_code=status.HTTP_201_CREATED)
async def create_spacecraft(body: SpacecraftCreate,
                            session: AsyncSession = Depends(get_session)):
    """Create a new spacecraft configuration."""
    now = datetime.now(timezone.utc)
    row = SpacecraftConfigRow(
        id=str(uuid4()),
        name=body.name,
        description=body.description,
        dry_mass_kg=body.structure.dry_mass_kg,
        fuel_mass_kg=body.structure.fuel_mass_kg,
        solar_panel_area_m2=body.power.solar_panel_area_m2,
        battery_capacity_wh=body.power.battery_capacity_wh,
        radiator_area_m2=body.thermal.radiator_area_m2,
        antenna_gain_dbi=body.comms.antenna_gain_dbi,
        transmit_power_w=body.comms.transmit_power_w,
        isp_s=body.propulsion.isp_s,
        thrust_n=body.propulsion.thrust_n,
        payload_type=body.payload.payload_type.value,
        payload_mass_kg=body.payload.mass_kg,
        payload_power_w=body.payload.power_w,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@router.get("/{spacecraft_id}", response_model=SpacecraftResponse)
async def get_spacecraft(spacecraft_id: str,
                         session: AsyncSession = Depends(get_session)):
    """Get a spacecraft configuration by ID."""
    result = await session.execute(
        select(SpacecraftConfigRow).where(SpacecraftConfigRow.id == spacecraft_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Spacecraft configuration not found")
    return _row_to_response(row)


@router.put("/{spacecraft_id}", response_model=SpacecraftResponse)
async def update_spacecraft(spacecraft_id: str,
                            body: SpacecraftUpdate,
                            session: AsyncSession = Depends(get_session)):
    """Update an existing spacecraft configuration."""
    result = await session.execute(
        select(SpacecraftConfigRow).where(SpacecraftConfigRow.id == spacecraft_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Spacecraft configuration not found")

    if body.name is not None:
        row.name = body.name
    if body.description is not None:
        row.description = body.description
    if body.structure is not None:
        row.dry_mass_kg = body.structure.dry_mass_kg
        row.fuel_mass_kg = body.structure.fuel_mass_kg
    if body.power is not None:
        row.solar_panel_area_m2 = body.power.solar_panel_area_m2
        row.battery_capacity_wh = body.power.battery_capacity_wh
    if body.thermal is not None:
        row.radiator_area_m2 = body.thermal.radiator_area_m2
    if body.comms is not None:
        row.antenna_gain_dbi = body.comms.antenna_gain_dbi
        row.transmit_power_w = body.comms.transmit_power_w
    if body.propulsion is not None:
        row.isp_s = body.propulsion.isp_s
        row.thrust_n = body.propulsion.thrust_n
    if body.payload is not None:
        row.payload_type = body.payload.payload_type.value
        row.payload_mass_kg = body.payload.mass_kg
        row.payload_power_w = body.payload.power_w

    row.updated_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return _row_to_response(row)


@router.delete("/{spacecraft_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_spacecraft(spacecraft_id: str,
                            session: AsyncSession = Depends(get_session)):
    """Delete a spacecraft configuration."""
    result = await session.execute(
        select(SpacecraftConfigRow).where(SpacecraftConfigRow.id == spacecraft_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Spacecraft configuration not found")
    await session.delete(row)
    await session.commit()


@router.post("/{spacecraft_id}/validate", response_model=SpacecraftValidation)
async def validate_spacecraft(spacecraft_id: str,
                              session: AsyncSession = Depends(get_session)):
    """Validate a spacecraft design — check mass, power, and thermal budgets."""
    result = await session.execute(
        select(SpacecraftConfigRow).where(SpacecraftConfigRow.id == spacecraft_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Spacecraft configuration not found")

    warnings: list[str] = []
    errors: list[str] = []

    total_mass = row.dry_mass_kg + row.fuel_mass_kg + row.payload_mass_kg

    # Mass budget check
    if total_mass > 3000:
        errors.append(f"Total mass {total_mass:.1f} kg exceeds 3000 kg launch limit")
    elif total_mass > 2000:
        warnings.append(f"Total mass {total_mass:.1f} kg is high — consider reducing")

    # Power budget: rough estimate of generation vs consumption
    # Solar panel output ≈ area × 300 W/m² (avg accounting for eclipse)
    power_generation = row.solar_panel_area_m2 * 300.0
    base_power_draw = 50.0  # bus housekeeping
    total_power_draw = base_power_draw + row.payload_power_w + row.transmit_power_w
    power_margin = power_generation - total_power_draw

    if power_margin < 0:
        errors.append(
            f"Negative power margin: generating ~{power_generation:.0f} W "
            f"but consuming ~{total_power_draw:.0f} W"
        )
    elif power_margin < total_power_draw * 0.2:
        warnings.append(f"Power margin is thin ({power_margin:.0f} W surplus)")

    # Thermal margin: radiator area vs heat load
    # Rough: radiator can reject ≈ σ·ε·A·T⁴ ≈ 300 W/m² at ~300 K
    thermal_rejection = row.radiator_area_m2 * 300.0
    thermal_margin_pct = ((thermal_rejection - total_power_draw) / total_power_draw) * 100 \
        if total_power_draw > 0 else 100.0

    if thermal_margin_pct < 0:
        errors.append("Radiator area insufficient to reject waste heat")
    elif thermal_margin_pct < 20:
        warnings.append(f"Thermal margin is low ({thermal_margin_pct:.0f}%)")

    valid = len(errors) == 0

    return SpacecraftValidation(
        valid=valid,
        warnings=warnings,
        errors=errors,
        mass_budget_kg=total_mass,
        power_budget_w=power_margin,
        thermal_margin_pct=thermal_margin_pct,
    )

