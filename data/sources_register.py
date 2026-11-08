"""
Authoritative Data & Sources Register for LumenOS.

Identifies all external scientific products integrated into the simulation,
documenting provenance, versions, coverage, units, licenses, update protocols,
and offline fallback strategies.
"""

from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, Field


class DataSourceRecord(BaseModel):
    """Immutable registry entry documenting an authoritative data source."""
    source_id: str = Field(description="Unique product identifier (e.g. 'nasa_firms_viirs')")
    name: str = Field(description="Full product title")
    agency: str = Field(description="Operating agency or science team")
    product_code: str = Field(description="Exact official product code or acronym")
    product_version: str = Field(description="Dataset / algorithm version")
    temporal_coverage: str = Field(description="Date range and temporal resolution / latency")
    spatial_coverage: str = Field(description="Geographic scope and spatial resolution")
    units: dict[str, str] = Field(description="Mapping of physical variable names to units")
    quality_flags: list[str] = Field(description="Standard data quality, validation, or confidence flags")
    update_method: str = Field(description="Ingestion and refresh methodology")
    api_requirements: str = Field(description="API endpoint, key requirements, or authentication notes")
    license_and_terms: str = Field(description="Usage rights, copyright, and citation requirements")
    processing_steps: list[str] = Field(description="Ordered transformation pipeline from raw product to game format")
    gameplay_role: str = Field(description="How this product affects scenarios, targets, or physics")
    fallback_strategy: str = Field(description="Offline local dataset bundled to guarantee zero-network operation")
    verification_status: str = Field(default="verified", description="'verified', 'planned', or 'assumed'")
    reference_url: str = Field(description="Official documentation or portal URL")
    offline_file: str = Field(description="Relative path to bundled offline sample data")


# ── Authoritative Catalog ───────────────────────────────────────────────────

DATA_SOURCES_CATALOG: dict[str, DataSourceRecord] = {
    "nasa_firms_viirs": DataSourceRecord(
        source_id="nasa_firms_viirs",
        name="NASA FIRMS VIIRS 375m Active Fire Detection Product",
        agency="NASA LANCE / EOSDIS / University of Maryland",
        product_code="VNP14IMGTDL_NRT",
        product_version="2.0NRT",
        temporal_coverage="2012-present (Suomi NPP), 2018-present (NOAA-20), ~3-hour latency",
        spatial_coverage="Global active fire detection at 375m nadir pixel resolution",
        units={
            "brightness_temp_ti4": "Kelvin (K)",
            "brightness_temp_ti5": "Kelvin (K)",
            "fire_radiative_power": "Megawatts (MW)",
            "pixel_scan_km": "kilometers (km)",
            "pixel_track_km": "kilometers (km)",
        },
        quality_flags=["low", "nominal", "high"],
        update_method="Automated REST query with cached local offline fallback",
        api_requirements="MAP_KEY query parameter required for live NASA FIRMS API; offline bundle requires zero credentials",
        license_and_terms="NASA Open Data Policy (Public Domain / CC0-compatible). No commercial restrictions.",
        processing_steps=[
            "Ingest VIIRS I-band (375m) active fire detection records (CSV/JSON)",
            "Filter detections by scenario geographic bounding box (e.g. SE Australia -38.5° to -31.0° lat, 146.0° to 152.0° lon)",
            "Filter for confidence >= 'nominal' to exclude false alarms and solar glint",
            "Convert UTC date and 4-digit acquisition time to ISO 8601 UTC timestamp",
            "Compute target Fire Radiative Power (FRP) and cluster hotspots into mission target corridors",
        ],
        gameplay_role="Ground-truth active fire thermal anomalies, FRP validation benchmarks, and target coordinates for Wildfire Scout",
        fallback_strategy="Bundled versioned local JSON snapshot in data/offline/nasa_firms_wildfire_sample.json",
        verification_status="verified",
        reference_url="https://firms.modaps.eosdis.nasa.gov/",
        offline_file="data/offline/nasa_firms_wildfire_sample.json",
    ),

    "nasa_tsis1_tsi": DataSourceRecord(
        source_id="nasa_tsis1_tsi",
        name="NASA TSIS-1 Total Solar Irradiance (TSI) Level 3 Daily",
        agency="NASA Goddard Space Flight Center / LASP (Univ. of Colorado Boulder)",
        product_code="TSIS-1_TSI_L3",
        product_version="v02r01",
        temporal_coverage="2018-present, daily continuous measurements",
        spatial_coverage="Top of Earth Atmosphere (TOA) normalized to 1 Astronomical Unit (AU)",
        units={
            "total_solar_irradiance": "Watts per square meter (W/m²)",
            "measurement_uncertainty": "Watts per square meter (W/m²)",
        },
        quality_flags=["nominal_science", "provisional", "uncertainty_evaluated"],
        update_method="Periodic releases via NASA Earthdata and LASP TSI Science Center",
        api_requirements="NASA Earthdata Login for direct HDF5 download; pre-compiled constants in offline bundle",
        license_and_terms="NASA Open Data Policy (Public Domain / CC0-compatible)",
        processing_steps=[
            "Extract daily calibrated Total Solar Irradiance (TSI) from Level 3 NetCDF/ASCII files",
            "Calculate multi-year quiet-Sun baseline value (1361.0 W/m² at 1 AU)",
            "Verify solar cycle 25 variance range (1360.5 to 1362.2 W/m²)",
            "Integrate into simulation environment model with Earth-Sun distance (orbital eccentricity) scaling",
        ],
        gameplay_role="Calibrates the solar flux constant (S₀ = 1361.0 W/m²) used by solar panel power generation and thermal radiation models",
        fallback_strategy="Bundled reference constants in data/offline/nasa_tsis_solar_irradiance_sample.json",
        verification_status="verified",
        reference_url="https://lasp.colorado.edu/home/tsis/",
        offline_file="data/offline/nasa_tsis_solar_irradiance_sample.json",
    ),

    "nasa_ceres_ebaf": DataSourceRecord(
        source_id="nasa_ceres_ebaf",
        name="NASA CERES Energy Balanced and Filled (EBAF) TOA Fluxes",
        agency="NASA Langley Research Center (LaRC) ASDC",
        product_code="CERES_EBAF-TOA",
        product_version="Edition 4.2",
        temporal_coverage="2000-present, monthly 1°x1° global gridded products",
        spatial_coverage="Global 1.0° latitude × 1.0° longitude grid",
        units={
            "toa_sw_all_mon": "Watts per square meter (W/m²)",
            "toa_lw_all_mon": "Watts per square meter (W/m²)",
            "toa_albedo_all_mon": "dimensionless ratio [0.0, 1.0]",
            "toa_net_all_mon": "Watts per square meter (W/m²)",
        },
        quality_flags=["peer_reviewed_ed4.2", "energy_balanced_calibrated"],
        update_method="Quarterly science team release via NASA ASDC",
        api_requirements="NASA ASDC OpenDAP / direct HTTPS; pre-compiled zonal band tables in offline bundle",
        license_and_terms="NASA Open Data Policy (Public Domain)",
        processing_steps=[
            "Extract global monthly mean shortwave reflected flux, outgoing longwave radiation (OLR), and albedo",
            "Compute global multi-year area-weighted averages (Albedo = 0.298 ~ 0.30, Earth IR = 237.2 W/m²)",
            "Segment into zonal bands (Equatorial 0-23.5°, Mid-lat 23.5-60°, Polar 60-90°)",
            "Calibrate thermal equilibrium environment equations in simulation/physics/thermal.py",
        ],
        gameplay_role="Directly calibrates Earth albedo factor (0.30) and Earth outgoing infrared emission (237.0 W/m²) in spacecraft thermal balance",
        fallback_strategy="Bundled zonal radiation table in data/offline/nasa_ceres_radiation_sample.json",
        verification_status="verified",
        reference_url="https://ceres.larc.nasa.gov/data/",
        offline_file="data/offline/nasa_ceres_radiation_sample.json",
    ),

    "noaa_donki_space_weather": DataSourceRecord(
        source_id="noaa_donki_space_weather",
        name="NASA DONKI & NOAA SWPC Space Weather Notification Catalog",
        agency="NASA Community Coordinated Modeling Center (CCMC) / NOAA SWPC",
        product_code="DONKI_CME_FLR",
        product_version="API v2.0",
        temporal_coverage="2010-present, event-driven notifications",
        spatial_coverage="Heliosphere (Sun to Earth magnetosphere)",
        units={
            "cme_speed": "kilometers per second (km/s)",
            "cme_half_angle": "degrees",
            "flare_peak_flux": "Watts per square meter (W/m²) in 0.1-0.8 nm GOES X-ray band",
            "geomagnetic_kp": "dimensionless integer index [0-9]",
            "proton_flux_gt10mev": "proton flux units (pfu = protons/(cm²·s·sr))",
        },
        quality_flags=["real_time_automated", "desk_reviewed", "catalog_final"],
        update_method="REST API polling from api.nasa.gov with versioned local fallback",
        api_requirements="api.nasa.gov DEMO_KEY or registered key; offline bundle requires zero credentials",
        license_and_terms="US Government Open Work (Public Domain)",
        processing_steps=[
            "Query DONKI Solar Flare (FLR) and Coronal Mass Ejection (CME) endpoints",
            "Filter for M-class (>= 1.0e-5 W/m²) and X-class (>= 1.0e-4 W/m²) events",
            "Associate CME transit speeds (500 to 2500 km/s) and Earth arrival prediction times",
            "Scale Solar Storm Sentinel scenario event pool triggers, radiation dose rates, and safe mode prompts",
        ],
        gameplay_role="Provides authentic solar flare classifications (e.g. X8.7), CME speeds, and geomagnetic storm Kp indices for Solar Storm Sentinel",
        fallback_strategy="Bundled event catalog in data/offline/nasa_donki_solar_sample.json",
        verification_status="verified",
        reference_url="https://kauai.ccmc.gsfc.nasa.gov/DONKI/",
        offline_file="data/offline/nasa_donki_solar_sample.json",
    ),

    "copernicus_sentinel1_flood": DataSourceRecord(
        source_id="copernicus_sentinel1_flood",
        name="Copernicus Sentinel-1 SAR & Global Flood Database Reference",
        agency="Copernicus (ESA) / NASA ASF DAAC / Dartmouth Flood Observatory (DFO)",
        product_code="S1_GRD_DFO",
        product_version="v1.0",
        temporal_coverage="2014-present (Sentinel-1), 1985-present (DFO catalog)",
        spatial_coverage="Brahmaputra and Ganges river delta floodplains (India/Bangladesh)",
        units={
            "inundation_area_km2": "square kilometers (km²)",
            "radar_backscatter_db": "decibels (dB)",
            "duration_days": "days",
            "latitude_deg": "degrees North (WGS-84)",
            "longitude_deg": "degrees East (WGS-84)",
        },
        quality_flags=["ground_validated", "cloud_penetrating_sar", "optical_sar_confluence"],
        update_method="Archival extraction and event catalog releases",
        api_requirements="NASA Earthdata Login for direct ASF Vertex downloads; pre-packaged flood boundaries in offline bundle",
        license_and_terms="Creative Commons Attribution 4.0 International (CC BY 4.0) / Copernicus Free Data Policy",
        processing_steps=[
            "Extract Dartmouth Flood Observatory flood event polygons for Brahmaputra/Ganges basins",
            "Extract Sentinel-1 SAR C-band radar backscatter threshold separating standing water (<-18 dB) from land",
            "Calculate inundated basin area (km²) and emergency response delivery timelines",
            "Formulate swath boundaries and data storage load for Flood Scout scenario",
        ],
        gameplay_role="Ground-truth flood inundation swaths, radar imagery volume calibration, and target coordinates for Flood Scout",
        fallback_strategy="Bundled flood boundary polygons in data/offline/nasa_asf_flood_sample.json",
        verification_status="verified",
        reference_url="https://asf.alaska.edu/data-sets/sar-data-sets/sentinel-1/",
        offline_file="data/offline/nasa_asf_flood_sample.json",
    ),

    "tropomi_modvolc_volcano": DataSourceRecord(
        source_id="tropomi_modvolc_volcano",
        name="Sentinel-5P TROPOMI SO2 & MODVOLC Thermal Alert Anomaly Reference",
        agency="Copernicus / NASA GES DISC / University of Hawaii HIGP",
        product_code="TROPOMI_SO2_MODVOLC",
        product_version="Level 2 v2.0 / MODVOLC v1.0",
        temporal_coverage="2018-present (TROPOMI), 2000-present (MODVOLC)",
        spatial_coverage="Active volcanic targets: Mount Merapi (Java) and Anak Krakatau (Sunda Strait)",
        units={
            "so2_column_density": "Dobson Units (DU)",
            "thermal_radiance": "Watts per square meter steradian micrometer (W/(m²·sr·µm))",
            "plume_altitude": "kilometers (km)",
        },
        quality_flags=["qa_value_gt_0.5", "modvolc_verified_hotspot"],
        update_method="Orbit-by-orbit Level 2 atmospheric data ingest",
        api_requirements="NASA Earthdata Login for GES DISC; pre-compiled anomaly records in offline bundle",
        license_and_terms="Copernicus Open Access / NASA Open Data Policy (CC0-compatible)",
        processing_steps=[
            "Filter TROPOMI Level 2 SO2 column density pixels where qa_value >= 0.5",
            "Identify volcanic plume anomalies exceeding 5.0 DU above background threshold",
            "Correlate with MODVOLC 4µm thermal emission radiance alerts at caldera coordinates",
            "Establish observation objectives and urgent aviation advisory triggers for Volcano Watch",
        ],
        gameplay_role="Ground-truth SO2 column density anomalies, thermal radiance levels, and target locations for Volcano Watch",
        fallback_strategy="Bundled volcanic records in data/offline/nasa_tropomi_so2_volcano_sample.json",
        verification_status="verified",
        reference_url="https://disc.gsfc.nasa.gov/datasets/S5P_L2__SO2____2/summary",
        offline_file="data/offline/nasa_tropomi_so2_volcano_sample.json",
    ),

    "nasa_norad_tle_ephemeris": DataSourceRecord(
        source_id="nasa_norad_tle_ephemeris",
        name="NASA & NORAD Earth Observation Satellite Two-Line Element (TLE) Reference",
        agency="NASA Flight Dynamics Facility / 18th Space Defense Squadron via CelesTrak",
        product_code="NORAD_TLE_EO",
        product_version="Standard NORAD 2-Line Ephemeris Format",
        temporal_coverage="Continuous daily epoch updates",
        spatial_coverage="Low Earth Orbit (LEO) orbital state vectors",
        units={
            "mean_motion": "revolutions per day (rev/day)",
            "inclination": "degrees",
            "eccentricity": "dimensionless ratio [0.0, 1.0)",
            "semi_major_axis": "kilometers (km)",
            "raan": "degrees",
            "altitude_above_ellipsoid": "kilometers (km)",
        },
        quality_flags=["operational_spacetrack", "validated_sso"],
        update_method="Automated ephemeris refresh via CelesTrak / Space-Track",
        api_requirements="Public CelesTrak endpoints; bundled offline TLE catalog requires zero credentials",
        license_and_terms="Public Domain (US Government satellite ephemeris data)",
        processing_steps=[
            "Ingest standard 69-character Two-Line Element sets for benchmark satellites (Terra, Aqua, Suomi NPP, Sentinel-1A)",
            "Verify checksums and parse inclination, RAAN, eccentricity, argument of perigee, and mean motion",
            "Compute derived semi-major axis a = (μ / n²)^(1/3) and orbital period",
            "Validate LumenOS Keplerian + J₂ orbital propagation numerical accuracy against published ephemeris",
        ],
        gameplay_role="Numerical benchmarks used to validate simulation orbital propagation, ground tracks, and SSO node precession against real satellites",
        fallback_strategy="Bundled benchmark TLE sets in data/offline/nasa_tle_orbital_sample.json",
        verification_status="verified",
        reference_url="https://celestrak.org/",
        offline_file="data/offline/nasa_tle_orbital_sample.json",
    ),
}


# ── Registry Helper Functions ───────────────────────────────────────────────

def get_all_data_sources() -> list[DataSourceRecord]:
    """Return all authoritative data sources in the register."""
    return list(DATA_SOURCES_CATALOG.values())


def get_data_source(source_id: str) -> Optional[DataSourceRecord]:
    """Retrieve a specific data source by its unique ID."""
    return DATA_SOURCES_CATALOG.get(source_id)


def get_sources_by_scenario(scenario_id: str) -> list[DataSourceRecord]:
    """Return data sources applicable to a given mission scenario."""
    mapping: dict[str, list[str]] = {
        "wildfire": ["nasa_firms_viirs", "nasa_tsis1_tsi", "nasa_ceres_ebaf", "nasa_norad_tle_ephemeris"],
        "flood": ["copernicus_sentinel1_flood", "nasa_tsis1_tsi", "nasa_ceres_ebaf", "nasa_norad_tle_ephemeris"],
        "solar_storm": ["noaa_donki_space_weather", "nasa_tsis1_tsi", "nasa_ceres_ebaf", "nasa_norad_tle_ephemeris"],
        "volcano": ["tropomi_modvolc_volcano", "nasa_tsis1_tsi", "nasa_ceres_ebaf", "nasa_norad_tle_ephemeris"],
    }
    source_ids = mapping.get(scenario_id.lower(), ["nasa_tsis1_tsi", "nasa_ceres_ebaf"])
    return [DATA_SOURCES_CATALOG[sid] for sid in source_ids if sid in DATA_SOURCES_CATALOG]
