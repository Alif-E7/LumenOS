"""
Data-driven Spacecraft Component & Subsystem Catalog.

Educational assumptions:
- Values represent realistic mid-TRL aerospace engineering approximations for educational simulation.
- Solar flux is standard 1361 W/m² in Earth orbit; solar cell efficiency assumed 28% triple-junction GaAs.
- Radiator heat rejection modeled via Stefan-Boltzmann law (sigma * epsilon * A * T^4) at nominal 295 K operating temperature.
- RF downlink bandwidth modeled via Friis transmission equation with standard ground station reception (Svalbard / White Sands / Wallops).
- Costs are denominated in educational Mission Budget Credits.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class SubsystemType(str, Enum):
    LAUNCHER = "launcher"
    ORBIT = "orbit"
    INSTRUMENT = "instrument"
    COMPUTER = "computer"
    BATTERY = "battery"
    SOLAR = "solar"
    THERMAL = "thermal"
    COMMS = "comms"
    STORAGE = "storage"
    SHIELDING = "shielding"


class CatalogItem(BaseModel):
    """A data-driven catalog entry for the spacecraft designer."""
    id: str
    name: str
    subsystem: SubsystemType
    category_label: str
    description: str
    mass_kg: float = Field(..., ge=0.0)
    cost_credits: float = Field(..., ge=0.0)
    power_draw_w: float = Field(default=0.0, ge=0.0)
    power_generation_w: float = Field(default=0.0, ge=0.0)
    heat_contribution_w: float = Field(default=0.0, ge=0.0)
    data_rate_kbps: float = Field(default=0.0, ge=0.0)
    storage_capacity_mb: float = Field(default=0.0, ge=0.0)
    battery_capacity_wh: float = Field(default=0.0, ge=0.0)
    processing_mips: float = Field(default=0.0, ge=0.0)
    heat_rejection_w: float = Field(default=0.0, ge=0.0)
    performance_score: float = Field(default=1.0, ge=0.1, le=5.0)
    reliability: float = Field(default=0.98, ge=0.80, le=1.0)
    science_multiplier: float = Field(default=1.0, ge=0.5, le=3.0)
    compatible_missions: list[str] = Field(default_factory=list)
    incompatible_components: list[str] = Field(default_factory=list)
    required_components: list[str] = Field(default_factory=list)
    educational_notes: str = ""
    assumptions_and_units: str = ""


# ── Launchers ────────────────────────────────────────────────────────────────

LAUNCHERS: list[CatalogItem] = [
    CatalogItem(
        id="launcher_smallsat_rideshare",
        name="SmallSat Rideshare (Micro-Rocket)",
        subsystem=SubsystemType.LAUNCHER,
        category_label="Launch Vehicle",
        description="Low-cost rideshare launch to Low Earth Orbit. Strict mass and volume envelope.",
        mass_kg=0.0,  # Launcher mass is external to spacecraft
        cost_credits=1200.0,
        performance_score=1.0,
        reliability=0.94,
        educational_notes="Rideshares save money by piggybacking on primary launches, but you cannot choose your exact orbit time.",
        assumptions_and_units="Max payload: 250 kg. Fairing diameter: 1.2 m. Insertion orbit: LEO 400-500 km only.",
    ),
    CatalogItem(
        id="launcher_dedicated_light",
        name="Dedicated Light Launcher",
        subsystem=SubsystemType.LAUNCHER,
        category_label="Launch Vehicle",
        description="Dedicated two-stage light orbital rocket with flexible SSO and polar insertion.",
        mass_kg=0.0,
        cost_credits=2800.0,
        performance_score=2.0,
        reliability=0.97,
        educational_notes="A dedicated booster lets your mission choose the exact orbital plane, inclination, and launch window.",
        assumptions_and_units="Max payload: 600 kg. Fairing diameter: 1.8 m. Insertion orbit: LEO, SSO, Polar up to 800 km.",
    ),
    CatalogItem(
        id="launcher_medium_lift",
        name="Medium-Lift Rocket (Workhorse)",
        subsystem=SubsystemType.LAUNCHER,
        category_label="Launch Vehicle",
        description="Reliable multi-engine orbital rocket capable of launching heavy payloads to high-energy orbits.",
        mass_kg=0.0,
        cost_credits=5500.0,
        performance_score=3.5,
        reliability=0.99,
        educational_notes="Generous payload margins allow heavier batteries, large radar antennas, and redundant avionics.",
        assumptions_and_units="Max payload: 1600 kg. Fairing diameter: 3.0 m. Insertion orbit: All LEO, SSO, MEO.",
    ),
    CatalogItem(
        id="launcher_heavy_lift",
        name="Heavy-Lift Exploration Booster",
        subsystem=SubsystemType.LAUNCHER,
        category_label="Launch Vehicle",
        description="Massive multi-core launch system for deep space, geostationary, or super-heavy constellations.",
        mass_kg=0.0,
        cost_credits=9000.0,
        performance_score=5.0,
        reliability=0.995,
        educational_notes="Maximum lift capacity at high budget cost. Typically reserved for flagship observatories.",
        assumptions_and_units="Max payload: 4000 kg. Fairing diameter: 5.0 m. Insertion orbit: Any Earth orbit.",
    ),
]

LAUNCHER_CAPACITIES_KG: dict[str, float] = {
    "launcher_smallsat_rideshare": 250.0,
    "launcher_dedicated_light": 600.0,
    "launcher_medium_lift": 1600.0,
    "launcher_heavy_lift": 4000.0,
}


# ── Orbit Configurations ────────────────────────────────────────────────────

ORBIT_OPTIONS: list[CatalogItem] = [
    CatalogItem(
        id="orbit_leo_400",
        name="400 km Circular LEO (ISS Altitude)",
        subsystem=SubsystemType.ORBIT,
        category_label="Orbit Trajectory",
        description="Low Earth Orbit at 51.6° inclination. Rapid ground revisit and low launch delta-v.",
        mass_kg=0.0,
        cost_credits=0.0,
        performance_score=1.5,
        educational_notes="Low altitude yields high ground resolution, but atmospheric drag slowly decays the orbit.",
        assumptions_and_units="Altitude: 400 km. Period: 92.5 min. Eclipse: 36 min/orbit. Contact: ~8 min/pass.",
    ),
    CatalogItem(
        id="orbit_sso_650",
        name="650 km Sun-Synchronous Orbit (SSO)",
        subsystem=SubsystemType.ORBIT,
        category_label="Orbit Trajectory",
        description="Polar retrograde orbit at 98.0° inclination where Earth's oblateness precesses the orbital plane to track the Sun.",
        mass_kg=0.0,
        cost_credits=200.0,
        performance_score=3.0,
        science_multiplier=1.2,
        compatible_missions=["wildfire", "volcano", "flood"],
        educational_notes="SSO satellites pass over any given point on Earth at the exact same local solar time, providing consistent shadows for imagery.",
        assumptions_and_units="Altitude: 650 km. Inclination: 98.0°. Period: 97.7 min. Eclipse: 35 min/orbit. J2 nodal precession: 0.9856 deg/day.",
    ),
    CatalogItem(
        id="orbit_polar_800",
        name="800 km High Polar Orbit",
        subsystem=SubsystemType.ORBIT,
        category_label="Orbit Trajectory",
        description="High-inclination 85.0° orbit that covers Earth's auroral zones and polar caps.",
        mass_kg=0.0,
        cost_credits=400.0,
        performance_score=3.5,
        science_multiplier=1.3,
        compatible_missions=["solar_storm"],
        educational_notes="Polar orbits cross magnetic field lines directly, making them the best vantage point for detecting space weather and solar storms.",
        assumptions_and_units="Altitude: 800 km. Inclination: 85.0°. Period: 100.8 min. Eclipse: 34 min/orbit. Radiation: Crosses outer Van Allen belt.",
    ),
]


# ── Instruments / Payloads ──────────────────────────────────────────────────

INSTRUMENTS: list[CatalogItem] = [
    CatalogItem(
        id="inst_thermal_infrared",
        name="Multi-Band Thermal Infrared Imager (TIR)",
        subsystem=SubsystemType.INSTRUMENT,
        category_label="Sensor Payload",
        description="Cooled infrared sensor that detects surface heat anomalies, active wildfire perimeters, and burn scars.",
        mass_kg=28.0,
        cost_credits=1400.0,
        power_draw_w=85.0,
        heat_contribution_w=80.0,
        data_rate_kbps=450.0,
        science_multiplier=1.5,
        compatible_missions=["wildfire", "volcano"],
        educational_notes="Infrared detectors must be cooled to reject internal thermal noise so faint fire signatures can be distinguished.",
        assumptions_and_units="Spectral band: 3.7 to 12.0 μm. Resolution: 30 m GSD from 650 km. Mass: 28 kg.",
    ),
    CatalogItem(
        id="inst_sar_radar",
        name="Synthetic Aperture Radar (SAR C-Band)",
        subsystem=SubsystemType.INSTRUMENT,
        category_label="Sensor Payload",
        description="Active radar sensor that penetrates clouds, storm fronts, and darkness to generate high-resolution flood maps.",
        mass_kg=95.0,
        cost_credits=2600.0,
        power_draw_w=310.0,
        heat_contribution_w=290.0,
        data_rate_kbps=2800.0,
        science_multiplier=2.0,
        compatible_missions=["flood"],
        required_components=["proc_edge_ai_quad", "proc_dual_core_space"],
        educational_notes="Active radars beam microwave pulses down to Earth and measure reflected echoes. They use substantial electrical power.",
        assumptions_and_units="Frequency: 5.4 GHz (C-band). Pulse power: 1.5 kW peak. Resolution: 10 m stripmap.",
    ),
    CatalogItem(
        id="inst_uv_spectrometer",
        name="Solar UV & EUV Spectrometer",
        subsystem=SubsystemType.INSTRUMENT,
        category_label="Sensor Payload",
        description="High-precision ultraviolet spectrometer tracking solar flare flux, coronal mass ejections, and atmospheric ozone.",
        mass_kg=35.0,
        cost_credits=1900.0,
        power_draw_w=95.0,
        heat_contribution_w=85.0,
        data_rate_kbps=650.0,
        science_multiplier=1.8,
        compatible_missions=["solar_storm"],
        educational_notes="Extreme Ultraviolet (EUV) light does not reach Earth's surface due to atmospheric absorption, so it can only be observed from space.",
        assumptions_and_units="Spectral range: 17 to 105 nm. Grating resolution: 0.1 nm. Pointing accuracy required: < 0.05 deg.",
    ),
    CatalogItem(
        id="inst_multispectral_imager",
        name="Multispectral Hazard Sensor (VNIR/SWIR)",
        subsystem=SubsystemType.INSTRUMENT,
        category_label="Sensor Payload",
        description="12-band optical and short-wave infrared imager designed to track sulfur dioxide plumes and volcanic ash clouds.",
        mass_kg=42.0,
        cost_credits=1750.0,
        power_draw_w=115.0,
        heat_contribution_w=105.0,
        data_rate_kbps=1400.0,
        science_multiplier=1.6,
        compatible_missions=["volcano", "wildfire"],
        educational_notes="Short-wave infrared (SWIR) penetrates smoke and thin volcanic ash that completely block visible human vision.",
        assumptions_and_units="12 spectral bands (400 nm - 2200 nm). Swath width: 150 km. Pixel size: 15 m.",
    ),
    CatalogItem(
        id="inst_optical_survey_camera",
        name="High-Res Optical Survey Camera",
        subsystem=SubsystemType.INSTRUMENT,
        category_label="Sensor Payload",
        description="Telescopic RGB camera for high-detail surface reconnaissance and disaster response validation.",
        mass_kg=30.0,
        cost_credits=1100.0,
        power_draw_w=60.0,
        heat_contribution_w=55.0,
        data_rate_kbps=1800.0,
        science_multiplier=1.3,
        compatible_missions=["wildfire", "flood", "volcano"],
        educational_notes="Optical cameras produce crisp natural color pictures, but they are blinded at night and cannot see through thick clouds.",
        assumptions_and_units="Aperture: 200 mm. Ground Sampling Distance (GSD): 2.5 m. Bayer color sensor.",
    ),
]


# ── Processors / Onboard Computers ──────────────────────────────────────────

COMPUTERS: list[CatalogItem] = [
    CatalogItem(
        id="proc_rad_hard_micro",
        name="Radiation-Hardened Microcontroller",
        subsystem=SubsystemType.COMPUTER,
        category_label="Command & Data Handling",
        description="Single-core silicon-on-insulator flight processor. Extremely resilient against single-event upsets.",
        mass_kg=4.0,
        cost_credits=450.0,
        power_draw_w=12.0,
        heat_contribution_w=12.0,
        processing_mips=150.0,
        reliability=0.999,
        educational_notes="Rad-hard processors use older, larger silicon lithography nodes that are physically impervious to heavy ion strikes.",
        assumptions_and_units="Clock speed: 50 MHz. SEU immunity: > 100 krad(Si). Processing: 150 MIPS.",
    ),
    CatalogItem(
        id="proc_dual_core_space",
        name="Dual-Core Aerospace Processor",
        subsystem=SubsystemType.COMPUTER,
        category_label="Command & Data Handling",
        description="LEON4-class dual-core flight computer with hardware fault detection and payload packet handling.",
        mass_kg=8.5,
        cost_credits=900.0,
        power_draw_w=38.0,
        heat_contribution_w=38.0,
        processing_mips=900.0,
        reliability=0.99,
        educational_notes="A balanced flight computer capable of simultaneously running attitude control and basic payload data framing.",
        assumptions_and_units="Dual cores @ 250 MHz. Error-correcting ECC RAM. Processing: 900 MIPS.",
    ),
    CatalogItem(
        id="proc_edge_ai_quad",
        name="Quad-Core Neural Edge Computer",
        subsystem=SubsystemType.COMPUTER,
        category_label="Command & Data Handling",
        description="High-throughput accelerator for onboard image segmentation, wildfire detection, and radar compression.",
        mass_kg=16.0,
        cost_credits=1600.0,
        power_draw_w=110.0,
        heat_contribution_w=110.0,
        processing_mips=4500.0,
        reliability=0.96,
        science_multiplier=1.25,
        educational_notes="Processing images onboard reduces the amount of raw data you need to downlink by 70%, but generates significant heat.",
        assumptions_and_units="Quad cores + tensor coprocessor. Power: 110 W. Processing: 4500 MIPS.",
    ),
]


# ── Batteries (Energy Storage) ───────────────────────────────────────────────

BATTERIES: list[CatalogItem] = [
    CatalogItem(
        id="bat_li_ion_compact_1k",
        name="Compact Li-Ion Battery Pack (1000 Wh)",
        subsystem=SubsystemType.BATTERY,
        category_label="Electrical Power System",
        description="Lightweight lithium-ion battery bank for small satellites with modest power draws.",
        mass_kg=12.0,
        cost_credits=450.0,
        battery_capacity_wh=1000.0,
        educational_notes="In Low Earth Orbit, batteries undergo 16 charge-discharge cycles every single day. Keep Depth of Discharge under 60% for cell longevity.",
        assumptions_and_units="Energy: 1000 Wh. Max discharge rate: 350 W. Specific energy: 83 Wh/kg.",
    ),
    CatalogItem(
        id="bat_li_ion_standard_2k",
        name="Standard Li-Ion Battery Array (2200 Wh)",
        subsystem=SubsystemType.BATTERY,
        category_label="Electrical Power System",
        description="Nominal multi-cell flight battery bank capable of powering bus and payload through a 36-minute eclipse.",
        mass_kg=24.0,
        cost_credits=950.0,
        battery_capacity_wh=2200.0,
        educational_notes="Sufficient capacity to sustain high-power sensors through eclipse without dipping into emergency reserves.",
        assumptions_and_units="Energy: 2200 Wh. Max discharge rate: 800 W. Specific energy: 91 Wh/kg.",
    ),
    CatalogItem(
        id="bat_li_sulfur_heavy_4k",
        name="High-Capacity Solid-State Battery (4500 Wh)",
        subsystem=SubsystemType.BATTERY,
        category_label="Electrical Power System",
        description="Heavy-duty energy reservoir designed for power-hungry radar instruments or extended polar dark passes.",
        mass_kg=44.0,
        cost_credits=1800.0,
        battery_capacity_wh=4500.0,
        educational_notes="Higher capacity provides great thermal heater resilience and payload uptime, but requires more rocket payload mass.",
        assumptions_and_units="Energy: 4500 Wh. Max discharge rate: 1600 W. Specific energy: 102 Wh/kg.",
    ),
]


# ── Solar Power Generation ──────────────────────────────────────────────────

SOLAR_ARRAYS: list[CatalogItem] = [
    CatalogItem(
        id="solar_body_mounted_2m",
        name="Body-Mounted Solar Panels (2.0 m²)",
        subsystem=SubsystemType.SOLAR,
        category_label="Electrical Power System",
        description="Flush-mounted solar cells on spacecraft chassis. No deployment mechanisms, ultra-simple.",
        mass_kg=10.0,
        cost_credits=350.0,
        power_generation_w=320.0,
        educational_notes="Body-mounted panels cannot rotate toward the Sun. Their output depends directly on spacecraft orientation.",
        assumptions_and_units="Area: 2.0 m². Nominal output in sunlight: 320 W. Efficiency: 24%.",
    ),
    CatalogItem(
        id="solar_deployable_flat_5m",
        name="Deployable Rigid Solar Panels (5.0 m²)",
        subsystem=SubsystemType.SOLAR,
        category_label="Electrical Power System",
        description="Spring-deployed solar wings that unfold after launcher fairing separation.",
        mass_kg=24.0,
        cost_credits=850.0,
        power_generation_w=850.0,
        educational_notes="Deployable panels provide 2.5x more area than the bus skin, enabling high-power imaging payloads.",
        assumptions_and_units="Area: 5.0 m². Nominal output in sunlight: 850 W. Efficiency: 28% GaAs.",
    ),
    CatalogItem(
        id="solar_articulated_dual_wing_8m",
        name="Articulated Sun-Tracking Wings (8.5 m²)",
        subsystem=SubsystemType.SOLAR,
        category_label="Electrical Power System",
        description="Dual solar array wings with motor-driven Solar Array Drive Mechanisms (SADM) that rotate continuously to track the Sun.",
        mass_kg=42.0,
        cost_credits=1550.0,
        power_generation_w=1450.0,
        educational_notes="Sun-tracking motors ensure the solar panels stay perpendicular to the sun vector (cos theta = 1.0) all orbit long.",
        assumptions_and_units="Area: 8.5 m². Nominal output: 1450 W. Single-axis tracking gimbal included.",
    ),
]


# ── Thermal Control & Radiators ─────────────────────────────────────────────

THERMAL_SYSTEMS: list[CatalogItem] = [
    CatalogItem(
        id="therm_passive_paint_1m",
        name="Passive Thermal Coating & Radiator (1.0 m²)",
        subsystem=SubsystemType.THERMAL,
        category_label="Thermal Control System",
        description="White silicone thermal control paint with high infrared emissivity and low solar absorptance.",
        mass_kg=6.0,
        cost_credits=220.0,
        heat_rejection_w=240.0,
        educational_notes="Passive systems have no moving parts and reject heat directly into cold deep space (2.7 Kelvin).",
        assumptions_and_units="Radiator area: 1.0 m². Emissivity epsilon: 0.88. Heat rejection: 240 W @ 20°C.",
    ),
    CatalogItem(
        id="therm_heatpipe_radiator_2m",
        name="Embedded Heatpipe Radiator Panel (2.2 m²)",
        subsystem=SubsystemType.THERMAL,
        category_label="Thermal Control System",
        description="Ammonia loop heatpipes that conduct heat from avionics and payload directly to a flat radiator panel.",
        mass_kg=15.0,
        cost_credits=650.0,
        heat_rejection_w=600.0,
        educational_notes="Heatpipes evaporate and condense fluid to transfer thermal energy 100x faster than solid copper conductors.",
        assumptions_and_units="Radiator area: 2.2 m². Emissivity: 0.90. Heat rejection: 600 W @ 20°C.",
    ),
    CatalogItem(
        id="therm_louvered_array_4m",
        name="Trimmable Louvered Radiator (4.0 m²)",
        subsystem=SubsystemType.THERMAL,
        category_label="Thermal Control System",
        description="Bi-metallic louver blades that open when hot to dump heat and close in eclipse to prevent overcooling.",
        mass_kg=28.0,
        cost_credits=1250.0,
        heat_rejection_w=1150.0,
        educational_notes="Louvers act like window blinds. They prevent spacecraft electronics from freezing during deep 35-minute eclipses.",
        assumptions_and_units="Radiator area: 4.0 m². Variable rejection: 150 W closed / 1150 W open.",
    ),
]


# ── Communications Subsystem ────────────────────────────────────────────────

COMMS_SYSTEMS: list[CatalogItem] = [
    CatalogItem(
        id="comm_sband_patch",
        name="Omnidirectional S-Band Patch Transceiver",
        subsystem=SubsystemType.COMMS,
        category_label="Communications & RF",
        description="Wide-beam antenna for command uplink, basic housekeeping telemetry, and emergency recovery.",
        mass_kg=3.5,
        cost_credits=350.0,
        power_draw_w=15.0,
        heat_contribution_w=15.0,
        data_rate_kbps=250.0,
        educational_notes="Omni antennas don't need to point at the ground station to talk, but their data rate is too slow for big radar images.",
        assumptions_and_units="Frequency: 2.2 GHz (S-Band). Gain: 6 dBi. Downlink throughput: 250 kbps (~15 MB/pass).",
    ),
    CatalogItem(
        id="comm_xband_horn",
        name="Directional X-Band Horn Antenna",
        subsystem=SubsystemType.COMMS,
        category_label="Communications & RF",
        description="Medium-gain horn antenna capable of downlinking scientific imagery during ground station passes.",
        mass_kg=9.0,
        cost_credits=850.0,
        power_draw_w=50.0,
        heat_contribution_w=50.0,
        data_rate_kbps=2200.0,
        educational_notes="X-Band is the standard frequency used by NASA and ESA Earth observation satellites for mission science downlink.",
        assumptions_and_units="Frequency: 8.4 GHz. Gain: 24 dBi. Downlink throughput: 2200 kbps (~130 MB/pass).",
    ),
    CatalogItem(
        id="comm_kaband_steerable_dish",
        name="Steerable High-Gain Ka-Band Dish (0.6 m)",
        subsystem=SubsystemType.COMMS,
        category_label="Communications & RF",
        description="Motor-steered parabolic dish for high-speed broadband data dumps to polar ground stations.",
        mass_kg=18.0,
        cost_credits=1600.0,
        power_draw_w=105.0,
        heat_contribution_w=105.0,
        data_rate_kbps=15000.0,
        educational_notes="Ka-Band provides massive bandwidth (15 Mbps), but requires gimbal motors to track the ground station across the sky.",
        assumptions_and_units="Frequency: 26 GHz. Gain: 38 dBi. Downlink throughput: 15,000 kbps (~900 MB/pass).",
    ),
]


# ── Data Storage / Recorders ────────────────────────────────────────────────

STORAGE_SYSTEMS: list[CatalogItem] = [
    CatalogItem(
        id="stor_solid_state_64gb",
        name="Solid-State Flight Recorder (64 GB)",
        subsystem=SubsystemType.STORAGE,
        category_label="Data Storage",
        description="Compact flash storage module for orbital sensor buffering between ground passes.",
        mass_kg=2.5,
        cost_credits=250.0,
        power_draw_w=5.0,
        heat_contribution_w=5.0,
        storage_capacity_mb=64000.0,
        educational_notes="Satellites only fly over ground stations for ~8 minutes per orbit. Storage buffers your science until in line-of-sight.",
        assumptions_and_units="Capacity: 64,000 MB. Write speed: 100 MB/s. Radiation scrubbing included.",
    ),
    CatalogItem(
        id="stor_flash_array_256gb",
        name="High-Reliability Flash Array (256 GB)",
        subsystem=SubsystemType.STORAGE,
        category_label="Data Storage",
        description="Triple-modular redundant flash buffer capable of holding multiple orbits of high-rate radar or multispectral data.",
        mass_kg=6.0,
        cost_credits=650.0,
        power_draw_w=12.0,
        heat_contribution_w=12.0,
        storage_capacity_mb=256000.0,
        educational_notes="TMR (Triple Modular Redundancy) writes data to three separate chips and uses a voting circuit to eliminate bit flips.",
        assumptions_and_units="Capacity: 256,000 MB. Write speed: 300 MB/s. Fault-tolerant TMR architecture.",
    ),
    CatalogItem(
        id="stor_nvme_high_speed_1tb",
        name="Mass Storage NVMe Array (1024 GB)",
        subsystem=SubsystemType.STORAGE,
        category_label="Data Storage",
        description="Enterprise-class space storage for continuous multi-day SAR or hyperspectral mapping missions.",
        mass_kg=11.0,
        cost_credits=1250.0,
        power_draw_w=28.0,
        heat_contribution_w=28.0,
        storage_capacity_mb=1024000.0,
        educational_notes="Massive storage allows satellites to collect data over remote areas (like oceans or Antarctica) with no ground stations nearby.",
        assumptions_and_units="Capacity: 1,024,000 MB (1 TB). Sustained throughput: 800 MB/s.",
    ),
]


# ── Radiation Shielding & Armor ─────────────────────────────────────────────

SHIELDING_SYSTEMS: list[CatalogItem] = [
    CatalogItem(
        id="shield_mylar_blanket",
        name="Multi-Layer Insulation (MLI) Blanket",
        subsystem=SubsystemType.SHIELDING,
        category_label="Structure & Shielding",
        description="Aluminized Mylar and Dacron foil layers. Excellent thermal insulation and basic micrometeorite bumper.",
        mass_kg=5.0,
        cost_credits=180.0,
        performance_score=1.0,
        educational_notes="Gold or silver foil wrapped around spacecraft is MLI. It bounces radiative solar heat away like a thermos flask.",
        assumptions_and_units="15-layer aluminized polyimide. Areal density: 0.6 kg/m². Micrometeoroid protection up to 1 mm particles.",
    ),
    CatalogItem(
        id="shield_standard_aluminum",
        name="Aluminum Enclosure Armor (3 mm)",
        subsystem=SubsystemType.SHIELDING,
        category_label="Structure & Shielding",
        description="Standard 6061-T6 aluminum avionics vault. Absorbs trapped low-energy electrons and cosmic rays.",
        mass_kg=20.0,
        cost_credits=550.0,
        performance_score=2.5,
        reliability=0.99,
        educational_notes="A 3 mm aluminum hull stops 95% of Low Earth Orbit radiation and prevents single-event latchups in standard avionics.",
        assumptions_and_units="Thickness: 3 mm Al-equivalent. Absorbs up to 2 MeV electrons and 30 MeV protons.",
    ),
    CatalogItem(
        id="shield_graded_z_heavy",
        name="Graded-Z Heavy Radiation Vault (10 mm)",
        subsystem=SubsystemType.SHIELDING,
        category_label="Structure & Shielding",
        description="Laminated sandwich of Tantalum, Tin, and Aluminum. Stops Bremsstrahlung X-rays in high radiation belts.",
        mass_kg=48.0,
        cost_credits=1350.0,
        performance_score=4.5,
        reliability=0.998,
        compatible_missions=["solar_storm"],
        educational_notes="Graded-Z materials use high-Z metals (Tantalum) to stop high-energy particles and low-Z metals (Aluminum) to absorb secondary X-rays.",
        assumptions_and_units="10 mm Graded-Z alloy. Essential for Van Allen radiation belt transit or solar storm monitoring.",
    ),
]


# ── Full Master Catalog Map ─────────────────────────────────────────────────

ALL_CATALOG_ITEMS: list[CatalogItem] = (
    LAUNCHERS
    + ORBIT_OPTIONS
    + INSTRUMENTS
    + COMPUTERS
    + BATTERIES
    + SOLAR_ARRAYS
    + THERMAL_SYSTEMS
    + COMMS_SYSTEMS
    + STORAGE_SYSTEMS
    + SHIELDING_SYSTEMS
)

CATALOG_BY_ID: dict[str, CatalogItem] = {item.id: item for item in ALL_CATALOG_ITEMS}


def get_catalog_item(item_id: str) -> Optional[CatalogItem]:
    """Retrieve an item from the catalog by ID."""
    return CATALOG_BY_ID.get(item_id)


def get_items_by_subsystem(subsystem: SubsystemType | str) -> list[CatalogItem]:
    """Filter catalog by subsystem category."""
    sub_str = subsystem.value if isinstance(subsystem, SubsystemType) else str(subsystem)
    return [i for i in ALL_CATALOG_ITEMS if i.subsystem.value == sub_str]
