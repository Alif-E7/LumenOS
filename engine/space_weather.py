"""Space Weather — live solar/geomagnetic conditions for mission-safe scheduling.

NASA Space Apps 2026 — "Space Mission Design Game"
===================================================
A mission OS that ignores space weather is as blind as one that ignores heat.
Geomagnetic storms (high planetary K index, ``Kp``) do two things to an
orbital compute mission:

* charged particles and a heated, expanded upper atmosphere raise drag and
  sensor noise, and can damage unshielded electronics;
* operational doctrine for the whole satellite changes — heavy AI workloads
  are paused and battery is reserved for communications and commanding while
  the storm passes, so the spacecraft can be commanded if things go wrong.

This module turns that doctrine into data. It fetches the live *planetary
K index* from NOAA's Space Weather Prediction Center (SWPC) and classifies it
on the NOAA G-scale:

======  ======  ==========================
G-level  Kp      Meaning
======  ======  ==========================
G0       < 5    quiet conditions
G1–G2    5–6    minor to moderate storm
G3       7      strong storm  -> **safe mode**
G4–G5    8–9    severe to extreme storm
======  ======  ==========================

The data source is the public endpoint
``https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json``.
The feed has historically used two JSON shapes and both are supported:
a list of objects (``{"time_tag": ..., "Kp": 2.33, ...}``) and a list of
rows with a header line (``["time_tag", "Kp", ...]``). The last entry is the
current estimate. The Kp index is used directly because NOAA's G-scale is a
Kp-derived label — parsing Kp keeps the threshold logic physical.

The fetch is deliberately tiny and strictly non-fatal: if the network is
unreachable (offline demo, CI, hackathon venue Wi-Fi), the module degrades
gracefully to an ``"OFFLINE"`` status that assumes quiet conditions, so the
game never blocks on the internet. ``force="quiet"`` / ``force="storm"``
create deterministic statuses for demos and tests.
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

#: NOAA SWPC planetary K index feed (JSON).
SWPC_KP_URL: str = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"

#: Kp at or above this value triggers emergency safe mode (NOAA G3 storm).
STORM_KP_THRESHOLD: float = 7.0

#: Default network timeout for the feed, in seconds.
DEFAULT_TIMEOUT_S: float = 4.0


@dataclass(frozen=True)
class SpaceWeatherStatus:
    """One snapshot of space weather conditions.

    Attributes:
        kp_index: Planetary K index (0-9); ``None`` when the feed is offline.
        storm_level: NOAA G-scale integer (0-5).
        safe_mode: ``True`` when Kp >= :data:`STORM_KP_THRESHOLD` — the
            scheduler must pause heavy workloads and reserve battery.
        source: ``"NOAA SWPC"``, ``"SIMULATED"`` or ``"OFFLINE"``.
        updated_utc: Feed timestamp (ISO string) or fetch time for simulated.
        note: Short human-readable status line for the dashboard badge.
    """

    kp_index: Optional[float]
    storm_level: int
    safe_mode: bool
    source: str
    updated_utc: str
    note: str


def _g_level_for_kp(kp: float) -> int:
    """Map a Kp index to its NOAA G-scale storm level (0-5)."""
    if kp >= 9.0:
        return 5
    if kp >= 8.0:
        return 4
    if kp >= 7.0:
        return 3
    if kp >= 6.0:
        return 2
    if kp >= 5.0:
        return 1
    return 0


def _classify(kp: Optional[float], source: str, updated_utc: str) -> SpaceWeatherStatus:
    """Build a status object from a Kp value (or ``None`` for offline)."""
    if kp is None:
        return SpaceWeatherStatus(
            kp_index=None,
            storm_level=0,
            safe_mode=False,
            source=source,
            updated_utc=updated_utc,
            note="feed unavailable — quiet conditions assumed",
        )
    level = _g_level_for_kp(kp)
    safe = kp >= STORM_KP_THRESHOLD
    if safe:
        note = f"G{level} geomagnetic storm — safe mode: heavy tasks paused, battery reserved for comms"
    elif kp >= 5.0:
        note = f"G{level} minor storm — elevated drag and radiation, monitoring"
    else:
        note = f"G{level} quiet — nominal operations"
    return SpaceWeatherStatus(
        kp_index=float(kp),
        storm_level=level,
        safe_mode=safe,
        source=source,
        updated_utc=updated_utc,
        note=note,
    )


def simulated_space_weather(kp_index: float = 2.0) -> SpaceWeatherStatus:
    """Deterministic status for demos & tests (no network access)."""
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return _classify(float(kp_index), "SIMULATED", stamp)


def parse_latest_kp(payload: Any) -> tuple[Optional[float], str]:
    """Extract the latest ``(Kp, time_tag)`` from an SWPC payload.

    Supports both JSON shapes served by SWPC for this product:

    * list of objects — ``[{"time_tag": ..., "Kp": 2.33, ...}, ...]``
    * list of rows with a header — ``[["time_tag", "Kp", ...], [...], ...]``

    Returns ``(None, "")`` when no usable entry is found; never raises.
    """
    if not isinstance(payload, (list, tuple)) or not payload:
        return None, ""
    try:
        last = payload[-1]
        if isinstance(last, dict):
            if "Kp" not in last:
                return None, ""
            return float(last["Kp"]), str(last.get("time_tag", ""))
        if isinstance(last, (list, tuple)) and len(last) >= 2:
            if str(last[0]).lower() == "time_tag":
                return None, ""
            return float(last[1]), str(last[0])
    except (TypeError, ValueError, KeyError):
        return None, ""
    return None, ""


def fetch_space_weather(
    timeout: float = DEFAULT_TIMEOUT_S,
    force: Optional[str] = None,
) -> SpaceWeatherStatus:
    """Fetch the current planetary K index from NOAA SWPC.

    Args:
        timeout: Network timeout in seconds.
        force: ``"quiet"`` or ``"storm"`` to skip the network and return a
            deterministic demo status; ``None`` fetches live data.

    Returns:
        A :class:`SpaceWeatherStatus`. On any network/parse failure the
        function returns an ``"OFFLINE"`` status assuming quiet conditions —
        it never raises.
    """
    if force is not None:
        token = str(force).strip().lower()
        if token in ("storm", "drill", "emergency"):
            return simulated_space_weather(kp_index=7.7)
        if token in ("quiet", "nominal", "sim"):
            return simulated_space_weather(kp_index=2.0)

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        request = urllib.request.Request(
            SWPC_KP_URL,
            headers={"User-Agent": "LumenOS-Mission-OS/2.0 (NASA Space Apps hackathon project)"},
        )
        with urllib.request.urlopen(request, timeout=float(timeout)) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return _classify(None, "OFFLINE", stamp)

    kp_value, time_tag = parse_latest_kp(payload)
    if kp_value is None:
        return _classify(None, "OFFLINE", stamp)
    return _classify(kp_value, "NOAA SWPC", time_tag or stamp)


if __name__ == "__main__":
    status = fetch_space_weather()
    print(f"source={status.source}  kp={status.kp_index}  G{status.storm_level}  "
          f"safe_mode={status.safe_mode}")
    print(status.note)
