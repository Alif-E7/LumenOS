"""
Data Sources & Provenance API Router — /api/data/* endpoints.

Provides programmatic access to the Authoritative Data & Sources Register,
semantic data provenance categories, offline status, and verified NASA/partner
reference datasets.
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query

from data.manager import get_data_manager
from data.provenance import (
    DataProvenance,
    PROVENANCE_DISPLAY_CONFIG,
)
from data.sources_register import DataSourceRecord

router = APIRouter(prefix="/data", tags=["data-sources"])


# ── Data & Sources Register Endpoints ────────────────────────────────────────

@router.get("/sources", response_model=list[DataSourceRecord])
async def list_data_sources():
    """Return all authoritative scientific data sources in the register."""
    dm = get_data_manager()
    return dm.get_sources_register()


@router.get("/sources/{source_id}", response_model=DataSourceRecord)
async def get_data_source_detail(source_id: str):
    """Retrieve full documentation for a specific authoritative data source."""
    dm = get_data_manager()
    source = dm.get_source_details(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source '{source_id}' not found in registry")
    return source


@router.get("/sources/scenario/{scenario_id}", response_model=list[DataSourceRecord])
async def get_sources_for_scenario(scenario_id: str):
    """Retrieve all data sources applicable to a mission scenario."""
    dm = get_data_manager()
    return dm.get_scenario_sources(scenario_id)


# ── Provenance Categories & Status Endpoints ─────────────────────────────────

@router.get("/provenance/categories")
async def get_provenance_categories():
    """
    Return the canonical 4-tier semantic provenance categories
    with UI display badges, colors, and educational disclaimers.
    """
    return {
        cat.value: {
            "key": cat.value,
            **PROVENANCE_DISPLAY_CONFIG[cat],
        }
        for cat in DataProvenance
    }


@router.get("/status")
async def get_api_and_offline_status():
    """
    Report real external API configuration status and offline bundle readiness.
    Never fabricates API keys or simulated successful auth.
    """
    dm = get_data_manager()
    return dm.get_api_status()


# ── Reference Dataset Endpoints ──────────────────────────────────────────────

@router.get("/wildfire/reference")
async def get_wildfire_reference(
    min_confidence: str = Query(default="nominal", description="Filter: 'low', 'nominal', 'high'"),
    target_zone: Optional[str] = Query(default=None, description="Optional target zone filter"),
):
    """
    Return verified NASA FIRMS VIIRS 375m active fire detection records.
    Every record carries explicit REAL_NASA_REFERENCE provenance metadata.
    """
    dm = get_data_manager()
    return dm.get_wildfire_reference_records(
        min_confidence=min_confidence,
        target_zone=target_zone,
    )


@router.get("/solar/reference")
async def get_solar_irradiance_reference():
    """Return NASA TSIS-1 Total Solar Irradiance baseline constants and monthly means."""
    dm = get_data_manager()
    return dm.get_solar_irradiance_reference()


@router.get("/radiation/reference")
async def get_radiation_reference():
    """Return NASA CERES planetary albedo and outgoing longwave infrared fluxes."""
    dm = get_data_manager()
    return dm.get_earth_radiation_reference()


@router.get("/space-weather/reference")
async def get_space_weather_reference():
    """Return NASA DONKI and NOAA SWPC solar flare and CME event notifications."""
    dm = get_data_manager()
    return dm.get_solar_storm_reference_events()


@router.get("/flood/reference")
async def get_flood_reference():
    """Return Dartmouth Flood Observatory and Sentinel-1 SAR flood inundation boundaries."""
    dm = get_data_manager()
    return dm.get_flood_reference_events()


@router.get("/volcano/reference")
async def get_volcano_reference():
    """Return Sentinel-5P TROPOMI SO2 column density and MODVOLC volcanic thermal anomaly records."""
    dm = get_data_manager()
    return dm.get_volcano_reference_records()


@router.get("/orbit/reference")
async def get_orbit_tle_reference():
    """Return NASA/NORAD Earth observation satellite TLE sets for orbital propagator verification."""
    dm = get_data_manager()
    return dm.get_tle_reference()
