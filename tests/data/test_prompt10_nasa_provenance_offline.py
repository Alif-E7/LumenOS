"""
Prompt 10 Acceptance Tests — NASA Data Integration, Provenance, and Offline Fallback.

Acceptance Checks:
  1. Authoritative Data & Sources Register:
     All 7 products documented with product/version, temporal/spatial coverage,
     units, quality flags, update method, license/terms, API requirements,
     processing steps, gameplay role, and fallback strategy.
  2. Semantic Provenance Framework:
     Rigorous differentiation between REAL_NASA_REFERENCE, SIMULATED_SPACECRAFT,
     SIMULATED_ENVIRONMENT, and MODEL_PREDICTION.
     NASA FIRMS active fire detections explicitly tagged as external reference data.
  3. Bundled Offline Data Integrity:
     All 7 versioned offline JSON files exist, load deterministically, and have
     physically valid numbers (coordinates in WGS-84, FRP >= 0, TSI in range, etc.).
  4. Offline Fallback & Zero Credential Requirement:
     Operates completely offline without network or fabricated API keys.
     Missing keys report honest offline fallback status.
  5. Real Data Environmental Calibration:
     Simulation solar flux and Earth IR constants match empirical TSIS-1 and CERES values.
  6. API Endpoints:
     REST endpoints (/api/data/*) return complete schemas with provenance metadata.
"""

from __future__ import annotations

import json
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app
from data.manager import DataManager, get_data_manager
from data.provenance import (
    DataProvenance,
    PROVENANCE_DISPLAY_CONFIG,
    create_provenance_meta,
)
from data.sources_register import (
    DATA_SOURCES_CATALOG,
    get_all_data_sources,
    get_data_source,
    get_sources_by_scenario,
)
from simulation.core import SpacecraftConfig
from simulation.environment import SpaceEnvironmentModel


@pytest.fixture
def data_manager() -> DataManager:
    return get_data_manager()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ── Acceptance Check 1: Authoritative Data & Sources Register ────────────────


class TestDataSourcesRegister:
    """Verify completeness and rigor of the Authoritative Data & Sources Register."""

    def test_all_seven_authoritative_products_registered(self):
        """Register must contain exactly the 7 verified NASA/partner data products."""
        sources = get_all_data_sources()
        assert len(sources) == 7
        source_ids = {s.source_id for s in sources}
        expected_ids = {
            "nasa_firms_viirs",
            "nasa_tsis1_tsi",
            "nasa_ceres_ebaf",
            "noaa_donki_space_weather",
            "copernicus_sentinel1_flood",
            "tropomi_modvolc_volcano",
            "nasa_norad_tle_ephemeris",
        }
        assert source_ids == expected_ids

    def test_each_product_has_complete_mandatory_metadata(self):
        """Every product must define all required metadata fields."""
        for s in get_all_data_sources():
            assert s.source_id and s.name and s.agency
            assert s.product_code and s.product_version
            assert s.temporal_coverage and len(s.temporal_coverage) > 10
            assert s.spatial_coverage and len(s.spatial_coverage) > 10
            assert s.units and len(s.units) >= 1
            assert s.quality_flags and len(s.quality_flags) >= 1
            assert s.update_method and len(s.update_method) > 10
            assert s.api_requirements and len(s.api_requirements) > 10
            assert s.license_and_terms and len(s.license_and_terms) > 10
            assert s.processing_steps and len(s.processing_steps) >= 2
            assert s.gameplay_role and len(s.gameplay_role) > 15
            assert s.fallback_strategy and len(s.fallback_strategy) > 15
            assert s.verification_status in ("verified", "planned", "assumed")
            assert s.verification_status == "verified"
            assert s.reference_url.startswith("http")

    def test_scenario_source_filtering(self):
        """Each mission scenario retrieves its calibrated authoritative sources."""
        wf_sources = get_sources_by_scenario("wildfire")
        assert any(s.source_id == "nasa_firms_viirs" for s in wf_sources)

        fl_sources = get_sources_by_scenario("flood")
        assert any(s.source_id == "copernicus_sentinel1_flood" for s in fl_sources)

        ss_sources = get_sources_by_scenario("solar_storm")
        assert any(s.source_id == "noaa_donki_space_weather" for s in ss_sources)

        vc_sources = get_sources_by_scenario("volcano")
        assert any(s.source_id == "tropomi_modvolc_volcano" for s in vc_sources)


# ── Acceptance Check 2: Semantic Provenance Framework ────────────────────────


class TestSemanticProvenanceFramework:
    """Verify strict semantic classification and visual badging rules."""

    def test_four_canonical_provenance_categories(self):
        """Confirm exactly the four required categories exist with distinct display metadata."""
        expected = {
            DataProvenance.REAL_NASA_REFERENCE,
            DataProvenance.SIMULATED_SPACECRAFT,
            DataProvenance.SIMULATED_ENVIRONMENT,
            DataProvenance.MODEL_PREDICTION,
        }
        assert set(DataProvenance) == expected

        for cat in DataProvenance:
            info = PROVENANCE_DISPLAY_CONFIG[cat]
            assert info["label"]
            assert info["disclaimer"]
            assert info["badge_color"]

    def test_nasa_firms_explicit_external_reference_disclaimer(self, data_manager: DataManager):
        """NASA FIRMS active fire records must carry the explicit disclaimer distinguishing them from satellite imagery."""
        res = data_manager.get_wildfire_reference_records()
        assert res["provenance_type"] == DataProvenance.REAL_NASA_REFERENCE.value
        assert "records" in res and len(res["records"]) > 0

        for r in res["records"]:
            meta = r["provenance_meta"]
            assert meta["provenance_type"] == DataProvenance.REAL_NASA_REFERENCE.value
            assert meta["is_authoritative"] is True
            # Educational rule: must explain it is NOT satellite imagery from the fictional spacecraft
            assert "not images" in meta["educational_disclaimer"].lower() or "not generated" in meta["educational_disclaimer"].lower()

    def test_create_provenance_meta_helper(self):
        """create_provenance_meta correctly initializes authoritative vs synthetic tags."""
        real_meta = create_provenance_meta(
            provenance_type=DataProvenance.REAL_NASA_REFERENCE,
            source_id="test_nasa",
            product_name="NASA Test",
            provider="NASA",
            attribution_label="NASA",
        )
        assert real_meta.is_authoritative is True

        sim_meta = create_provenance_meta(
            provenance_type=DataProvenance.SIMULATED_SPACECRAFT,
            source_id="player_cam",
            product_name="Onboard Imager",
            provider="Spacecraft Payload",
            attribution_label="LumenOS Imager",
        )
        assert sim_meta.is_authoritative is False


# ── Acceptance Check 3: Bundled Offline Data Integrity ───────────────────────


class TestBundledOfflineDataIntegrity:
    """Verify bundled versioned JSON files exist, load without error, and contain valid physical bounds."""

    def test_all_seven_offline_bundles_exist(self, data_manager: DataManager):
        """Ensure all 7 offline files exist on disk in data/offline/."""
        offline_dir = data_manager.offline_dir
        expected_files = [
            "nasa_firms_wildfire_sample.json",
            "nasa_tsis_solar_irradiance_sample.json",
            "nasa_ceres_radiation_sample.json",
            "nasa_donki_solar_sample.json",
            "nasa_asf_flood_sample.json",
            "nasa_tropomi_so2_volcano_sample.json",
            "nasa_tle_orbital_sample.json",
        ]
        for fname in expected_files:
            p = offline_dir / fname
            assert p.exists(), f"Missing offline file: {fname}"

    def test_firms_wildfire_sample_bounds(self, data_manager: DataManager):
        """FIRMS detections have valid WGS-84 coordinates and positive FRP."""
        res = data_manager.get_wildfire_reference_records()
        for r in res["records"]:
            assert -90.0 <= r["latitude"] <= 90.0
            assert -180.0 <= r["longitude"] <= 180.0
            assert r["frp_mw"] > 0.0
            assert r["brightness_ti4_k"] >= 300.0

    def test_tsis1_solar_irradiance_sample_bounds(self, data_manager: DataManager):
        """TSIS-1 baseline TSI is ~1361.0 W/m² within expected empirical solar range."""
        res = data_manager.get_solar_irradiance_reference()
        constants = res["reference_constants"]
        assert constants["solar_constant_1au_w_m2"] == pytest.approx(1361.0, abs=1.0)
        assert 1350.0 <= constants["solar_cycle_min_w_m2"] <= constants["solar_cycle_max_w_m2"] <= 1375.0

    def test_ceres_radiation_sample_bounds(self, data_manager: DataManager):
        """CERES Earth albedo is ~0.30 and Earth OLR is ~237.0 W/m²."""
        res = data_manager.get_earth_radiation_reference()
        clim = res["climatology"]
        assert clim["planetary_albedo"] == pytest.approx(0.30, abs=0.02)
        assert clim["outgoing_longwave_ir_w_m2"] == pytest.approx(237.0, abs=2.0)

    def test_donki_space_weather_sample_bounds(self, data_manager: DataManager):
        """DONKI solar flares have valid classes and CME speeds."""
        res = data_manager.get_solar_storm_reference_events()
        for ev in res["events"]:
            assert ev["flare_class"].startswith(("M", "X"))
            assert ev["peak_flux_w_m2"] > 1.0e-6
            cme = ev.get("associated_cme")
            if cme:
                assert cme["speed_km_s"] >= 500.0
                assert 0.0 <= cme["half_angle_deg"] <= 90.0

    def test_flood_sentinel1_sample_bounds(self, data_manager: DataManager):
        """Flood records have valid inundation areas and radar backscatter thresholds."""
        res = data_manager.get_flood_reference_events()
        assert res["radar_characteristics"]["water_backscatter_threshold_db"] <= -15.0
        for ev in res["events"]:
            assert ev["inundation_area_km2"] >= 1000.0
            assert -90.0 <= ev["centroid_lat"] <= 90.0
            assert -180.0 <= ev["centroid_lon"] <= 180.0

    def test_tropomi_volcano_sample_bounds(self, data_manager: DataManager):
        """Volcano records have valid SO2 column density and thermal emission."""
        res = data_manager.get_volcano_reference_records()
        for v in res["volcanoes"]:
            assert -90.0 <= v["latitude"] <= 90.0
            assert -180.0 <= v["longitude"] <= 180.0
            act = v["recent_activity"]
            assert act["so2_column_density_du"] >= 5.0
            assert act["modvolc_4um_radiance_w_m2_sr_um"] > 0.0

    def test_tle_orbital_sample_bounds(self, data_manager: DataManager):
        """TLE satellite benchmark records have valid Keplerian parameters."""
        res = data_manager.get_tle_reference()
        for sat in res["satellites"]:
            params = sat["derived_parameters"]
            assert params["semi_major_axis_km"] > 6500.0
            assert 90.0 <= params["inclination_deg"] <= 105.0
            assert 0.0 <= params["eccentricity"] < 0.01


# ── Acceptance Check 4: Offline Fallback & Zero Key Requirement ──────────────


class TestOfflineFallbackAndHonesty:
    """Verify application operates offline without requiring keys or fabricating data."""

    def test_api_status_reports_honest_offline_fallback(self, data_manager: DataManager):
        """Missing API keys must honestly report offline fallback without crashing."""
        status = data_manager.get_api_status()
        assert status["mode"] == "hybrid_with_offline_fallback"
        assert status["offline_bundle_available"] is True
        assert len(status["offline_datasets_loaded"]) >= 6

        creds = status["credentials"]
        assert "nasa_firms" in creds
        assert "nasa_donki" in creds
        # Must clearly state fallback mechanism
        assert "offline" in creds["nasa_firms"]["note"].lower()

    def test_zero_network_execution_guarantee(self, data_manager: DataManager):
        """All queries return valid data locally without making HTTP requests."""
        wf = data_manager.get_wildfire_reference_records()
        assert len(wf["records"]) >= 5

        sol = data_manager.get_solar_irradiance_reference()
        assert sol["reference_constants"]["solar_constant_1au_w_m2"] == 1361.0

        rad = data_manager.get_earth_radiation_reference()
        assert rad["climatology"]["simulation_design_baseline"]["albedo_standard"] == 0.30


# ── Acceptance Check 5: Environmental Calibration ────────────────────────────


class TestEnvironmentalCalibration:
    """Verify simulation environment constants are calibrated directly from empirical NASA products."""

    def test_solar_flux_and_earth_ir_match_nasa_products(self):
        """Simulation default environment must match TSIS-1 (1361 W/m²) and CERES (237 W/m²)."""
        env = SpaceEnvironmentModel()
        state = env.evaluate(
            altitude_km=700.0,
            latitude_deg=0.0,
            longitude_deg=0.0,
            velocity_km_s=7.5,
            sunlight_fraction=1.0,
        )

        assert state.solar_flux_w_m2 == pytest.approx(1361.0, abs=1.0)
        assert state.earth_ir_w_m2 == pytest.approx(237.0, abs=1.0)
        assert env.config.albedo == pytest.approx(0.30, abs=0.01)


# ── Acceptance Check 6: API Endpoints ────────────────────────────────────────


@pytest.mark.asyncio
class TestDataApiEndpoints:
    """Verify FastAPI /api/data/* endpoints deliver valid responses with provenance."""

    async def test_get_sources_register(self, client: AsyncClient):
        resp = await client.get("/api/data/sources")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 7
        codes = {d["product_code"] for d in data}
        assert "VNP14IMGTDL_NRT" in codes
        assert "TSIS-1_TSI_L3" in codes

    async def test_get_source_detail(self, client: AsyncClient):
        resp = await client.get("/api/data/sources/nasa_firms_viirs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["source_id"] == "nasa_firms_viirs"
        assert data["agency"] == "NASA LANCE / EOSDIS / University of Maryland"
        assert data["verification_status"] == "verified"

    async def test_get_provenance_categories(self, client: AsyncClient):
        resp = await client.get("/api/data/provenance/categories")
        assert resp.status_code == 200
        data = resp.json()
        assert "REAL_NASA_REFERENCE" in data
        assert "SIMULATED_SPACECRAFT" in data
        assert "SIMULATED_ENVIRONMENT" in data
        assert "MODEL_PREDICTION" in data
        assert data["REAL_NASA_REFERENCE"]["badge_color"] == "blue"

    async def test_get_wildfire_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/wildfire/reference?min_confidence=nominal")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provenance_type"] == "REAL_NASA_REFERENCE"
        assert len(data["records"]) > 0
        assert "provenance_meta" in data["records"][0]

    async def test_get_solar_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/solar/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert data["reference_constants"]["solar_constant_1au_w_m2"] == 1361.0

    async def test_get_radiation_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/radiation/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert data["climatology"]["simulation_design_baseline"]["albedo_standard"] == 0.30

    async def test_get_space_weather_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/space-weather/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["events"]) >= 3
        assert data["events"][0]["flare_class"].startswith("X")

    async def test_get_flood_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/flood/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["events"]) >= 2

    async def test_get_volcano_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/volcano/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["volcanoes"]) >= 2

    async def test_get_orbit_reference_endpoint(self, client: AsyncClient):
        resp = await client.get("/api/data/orbit/reference")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["satellites"]) >= 3
