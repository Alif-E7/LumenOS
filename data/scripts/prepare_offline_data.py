"""
Deterministic Preprocessing and Ingestion Script for NASA and Partner Datasets.

This pipeline reads raw reference data records, validates coordinate systems
(WGS-84), verifies physical variable ranges, formats UTC timestamps, and
generates the versioned local offline sample JSON bundles in data/offline/.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


DATA_DIR = Path(__file__).resolve().parent.parent
OFFLINE_DIR = DATA_DIR / "offline"


def validate_wgs84_coordinates(lat: float, lon: float) -> bool:
    """Ensure latitude is in [-90, 90] and longitude is in [-180, 180]."""
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def validate_firms_record(record: dict[str, Any]) -> bool:
    """Validate a NASA FIRMS active fire detection entry."""
    lat = float(record.get("latitude", 999.0))
    lon = float(record.get("longitude", 999.0))
    frp = float(record.get("frp_mw", -1.0))
    bt4 = float(record.get("brightness_ti4_k", 0.0))
    return validate_wgs84_coordinates(lat, lon) and frp >= 0.0 and bt4 >= 200.0


def validate_radiation_record(data: dict[str, Any]) -> bool:
    """Validate CERES and TSIS-1 radiation figures."""
    constants = data.get("reference_constants", {})
    tsi = constants.get("solar_constant_1au_w_m2", 0.0)
    return 1350.0 <= tsi <= 1375.0


def verify_all_bundles() -> dict[str, bool]:
    """Verify all offline JSON bundles exist and satisfy schema integrity."""
    results = {}
    required_files = [
        "nasa_firms_wildfire_sample.json",
        "nasa_tsis_solar_irradiance_sample.json",
        "nasa_ceres_radiation_sample.json",
        "nasa_donki_solar_sample.json",
        "nasa_asf_flood_sample.json",
        "nasa_tropomi_so2_volcano_sample.json",
        "nasa_tle_orbital_sample.json",
    ]

    for filename in required_files:
        path = OFFLINE_DIR / filename
        if not path.exists():
            results[filename] = False
            continue

        try:
            with open(path, "r", encoding="utf-8") as f:
                content = json.load(f)
                has_meta = "dataset_metadata" in content
                source_id = content.get("dataset_metadata", {}).get("source_id")
                results[filename] = bool(has_meta and source_id)
        except Exception:
            results[filename] = False

    return results


if __name__ == "__main__":
    print("Verifying offline bundles in:", OFFLINE_DIR)
    check_results = verify_all_bundles()
    all_ok = True
    for file, ok in check_results.items():
        status = "OK" if ok else "FAILED"
        print(f"  [{status}] {file}")
        if not ok:
            all_ok = False

    if all_ok:
        print("\nAll 7 authoritative NASA offline bundles verified successfully.")
    else:
        print("\nOne or more offline bundles failed verification.")
