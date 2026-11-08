# LumenOS Authoritative Data & Scientific Sources Register

> **Scientific Transparency Standard**: LumenOS strictly distinguishes between real-world empirical observational data, simulation physics engine outputs, and artificial intelligence model predictions. External reference data is never confused with simulated spacecraft observations.

---

## 1. Semantic Data Provenance Framework

Every data record, telemetry packet, map overlay, and notification in LumenOS is classified into one of four canonical semantic categories:

| Provenance Category | Label / UI Badge | Authority Level | Origin & Description |
|:---|:---|:---|:---|
| `REAL_NASA_REFERENCE` | **REAL NASA / REFERENCE DATA** | **Authoritative Empirical** | Published empirical measurements from NASA, NOAA, ESA, or CelesTrak archives. Used for environment calibration, real-world event reference, and ground-truth validation. |
| `SIMULATED_SPACECRAFT` | **SIMULATED SPACECRAFT OBSERVATION** | **Simulated Sensor Output** | Telemetry and payload data acquired by the player's onboard satellite instruments (e.g. optical camera, thermal IR sensor, SAR radar, magnetometer). |
| `SIMULATED_ENVIRONMENT` | **SIMULATED ENVIRONMENT / GROUND TRUTH** | **Simulated World State** | The authoritative background ground truth maintained by the simulation physics runner (e.g. true ground target state, orbital state vector, shadow entry/exit). |
| `MODEL_PREDICTION` | **MODEL OR AI PREDICTION** | **Estimated / Uncertain** | Machine learning or heuristic predictions (e.g. orbit decay forecast, battery depletion prediction, weather forecast). Subject to epistemic uncertainty and potential error. |

> [!IMPORTANT]
> **NASA FIRMS Active Fire Detections Disclaimer**:
> NASA FIRMS active fire pixels are real-world empirical observations acquired by the VIIRS instrument on the Suomi NPP and NOAA-20 polar orbiters. They are **NOT** images captured by the fictional LumenOS spacecraft, and they do not represent infallible ground truth. In Wildfire Scout, FIRMS data serves as an external operational reference to validate satellite detections.

---

## 2. Authoritative Data & Sources Register

The register catalogs all external scientific products integrated into LumenOS:

### 2.1 NASA FIRMS VIIRS 375m Active Fire Detection Product
- **Source ID**: `nasa_firms_viirs`
- **Product Code & Version**: `VNP14IMGTDL_NRT` / v2.0NRT
- **Agency / Provider**: NASA LANCE / EOSDIS / University of Maryland
- **Temporal Coverage**: 2012–present (Suomi NPP), 2018–present (NOAA-20), ~3-hour near-real-time latency
- **Spatial Coverage**: Global active fire pixels at 375 m nadir resolution (I-band)
- **Physical Units**:
  - `brightness_temp_ti4`: Kelvin (K)
  - `brightness_temp_ti5`: Kelvin (K)
  - `fire_radiative_power`: Megawatts (MW)
  - `scan_km`, `track_km`: kilometers (km)
- **Quality / Confidence Flags**: `low` (<30%), `nominal` (30–80%), `high` (>80%)
- **License & Usage Rights**: NASA Open Data Policy (Public Domain / CC0-compatible). No commercial restrictions.
- **API Requirements**: MAP_KEY header/query parameter required for live queries from `https://firms.modaps.eosdis.nasa.gov/api/`. Offline bundled datasets require **zero credentials**.
- **Gameplay Role**: Calibrates active fire target coordinates, fire front intensity (MW), and smoke obscuration for the **Wildfire Scout — Eyes on Fire** scenario.
- **Offline Fallback**: Versioned local JSON snapshot in [`data/offline/nasa_firms_wildfire_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_firms_wildfire_sample.json).
- **Verification Status**: `verified`

### 2.2 NASA TSIS-1 Total Solar Irradiance (TSI) Level 3 Daily
- **Source ID**: `nasa_tsis1_tsi`
- **Product Code & Version**: `TSIS-1_TSI_L3` / v02r01
- **Agency / Provider**: NASA Goddard Space Flight Center / LASP (University of Colorado Boulder)
- **Temporal Coverage**: 2018–present, daily continuous solar irradiance
- **Spatial Coverage**: Top of Atmosphere (TOA) at 1 AU solar distance
- **Physical Units**:
  - `total_solar_irradiance`: Watts per square meter ($\text{W/m}^2$)
  - `measurement_uncertainty`: $\text{W/m}^2$ ($\pm 0.11 \text{ W/m}^2$)
- **Quality / Confidence Flags**: `nominal_science`, `provisional`, `uncertainty_evaluated`
- **License & Usage Rights**: NASA Open Data Policy (Public Domain).
- **API Requirements**: NASA Earthdata Login for direct NetCDF downloads; pre-compiled constants bundled offline.
- **Gameplay Role**: Calibrates direct solar flux constant ($S_0 = 1361.0 \text{ W/m}^2$) governing photovoltaic power generation and thermal radiation absorption across all scenarios.
- **Offline Fallback**: Versioned local dataset in [`data/offline/nasa_tsis_solar_irradiance_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_tsis_solar_irradiance_sample.json).
- **Verification Status**: `verified`

### 2.3 NASA CERES Energy Balanced and Filled (EBAF) TOA Fluxes
- **Source ID**: `nasa_ceres_ebaf`
- **Product Code & Version**: `CERES_EBAF-TOA` / Edition 4.2
- **Agency / Provider**: NASA Langley Research Center (LaRC) Atmospheric Science Data Center (ASDC)
- **Temporal Coverage**: 2000–present, monthly 1° × 1° global gridded products
- **Spatial Coverage**: Global 1.0° latitude × 1.0° longitude grid
- **Physical Units**:
  - `toa_sw_all_mon`: $\text{W/m}^2$ (reflected shortwave)
  - `toa_lw_all_mon`: $\text{W/m}^2$ (outgoing longwave infrared)
  - `toa_albedo_all_mon`: dimensionless ratio [0.0, 1.0]
- **Quality / Confidence Flags**: `peer_reviewed_ed4.2`, `energy_balanced_calibrated`
- **License & Usage Rights**: NASA Open Data Policy (Public Domain).
- **API Requirements**: NASA ASDC OpenDAP / direct HTTPS; pre-compiled zonal band tables in offline bundle.
- **Gameplay Role**: Calibrates planetary albedo ($a = 0.30$) and Earth outgoing infrared emission ($q_{\text{EarthIR}} = 237.0 \text{ W/m}^2$) in the spacecraft single-node thermal equilibrium model.
- **Offline Fallback**: Versioned zonal tables in [`data/offline/nasa_ceres_radiation_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_ceres_radiation_sample.json).
- **Verification Status**: `verified`

### 2.4 NASA DONKI & NOAA SWPC Space Weather Notification Catalog
- **Source ID**: `noaa_donki_space_weather`
- **Product Code & Version**: `DONKI_CME_FLR` / API v2.0
- **Agency / Provider**: NASA Community Coordinated Modeling Center (CCMC) / NOAA SWPC
- **Temporal Coverage**: 2010–present, event-driven notifications
- **Spatial Coverage**: Heliosphere (Sun to Earth magnetosphere)
- **Physical Units**:
  - `cme_speed`: kilometers per second ($\text{km/s}$)
  - `flare_peak_flux`: $\text{W/m}^2$ in 0.1–0.8 nm GOES X-ray band
  - `geomagnetic_kp`: dimensionless integer index [0–9]
  - `proton_flux_gt10mev`: proton flux units ($\text{pfu} = \text{protons}/(\text{cm}^2 \cdot \text{s} \cdot \text{sr})$)
- **Quality / Confidence Flags**: `real_time_automated`, `desk_reviewed`, `catalog_final`
- **License & Usage Rights**: US Government Open Work (Public Domain).
- **API Requirements**: `api.nasa.gov` API key; bundled offline events work with zero keys.
- **Gameplay Role**: Drives extreme solar flare (M- and X-class) and Coronal Mass Ejection (CME) event sequences, high-latitude radiation dose spikes, and safe-mode procedures for **Solar Storm Sentinel — Watch the Sun**.
- **Offline Fallback**: Versioned event catalog in [`data/offline/nasa_donki_solar_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_donki_solar_sample.json).
- **Verification Status**: `verified`

### 2.5 Copernicus Sentinel-1 SAR & Global Flood Database Reference
- **Source ID**: `copernicus_sentinel1_flood`
- **Product Code & Version**: `S1_GRD_DFO` / v1.0
- **Agency / Provider**: Copernicus (ESA) / NASA ASF DAAC / Dartmouth Flood Observatory (DFO)
- **Temporal Coverage**: 2014–present (Sentinel-1), 1985–present (DFO catalog)
- **Spatial Coverage**: Brahmaputra and Ganges river delta floodplains (India/Bangladesh)
- **Physical Units**:
  - `inundation_area_km2`: square kilometers ($\text{km}^2$)
  - `radar_backscatter_db`: decibels ($\text{dB}$)
  - `coordinates`: decimal degrees (WGS-84)
- **Quality / Confidence Flags**: `ground_validated`, `cloud_penetrating_sar`, `optical_sar_confluence`
- **License & Usage Rights**: Creative Commons Attribution 4.0 International (CC BY 4.0).
- **API Requirements**: NASA Earthdata Login for direct ASF Vertex downloads; pre-packaged flood boundaries in offline bundle.
- **Gameplay Role**: Calibrates ground-truth flood inundation boundaries, C-band SAR backscatter thresholds ($<-18\text{ dB}$ for open water), and storage volume demands for **Flood Scout — Rising Waters**.
- **Offline Fallback**: Versioned flood boundary polygons in [`data/offline/nasa_asf_flood_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_asf_flood_sample.json).
- **Verification Status**: `verified`

### 2.6 Sentinel-5P TROPOMI SO2 & MODVOLC Thermal Anomaly Reference
- **Source ID**: `tropomi_modvolc_volcano`
- **Product Code & Version**: `TROPOMI_SO2_MODVOLC` / Level 2 v2.0 & MODVOLC v1.0
- **Agency / Provider**: Copernicus / NASA GES DISC / University of Hawaii HIGP
- **Temporal Coverage**: 2018–present (TROPOMI), 2000–present (MODVOLC)
- **Spatial Coverage**: Active volcanic targets: Mount Merapi (Java) and Anak Krakatau (Sunda Strait)
- **Physical Units**:
  - `so2_column_density`: Dobson Units ($\text{DU}$, $1\text{ DU} = 2.69 \times 10^{16}\text{ molecules/cm}^2$)
  - `thermal_radiance`: $\text{W}/(\text{m}^2 \cdot \text{sr} \cdot \mu\text{m})$ (at 4 µm)
  - `plume_altitude`: kilometers ($\text{km}$)
- **Quality / Confidence Flags**: `qa_value_gt_0.5`, `modvolc_verified_hotspot`
- **License & Usage Rights**: Copernicus Open Access / NASA Open Data Policy (CC0-compatible).
- **API Requirements**: NASA Earthdata Login for GES DISC; pre-compiled anomaly records in offline bundle.
- **Gameplay Role**: Calibrates sulfur dioxide plume anomaly thresholds ($>5.0\text{ DU}$), thermal radiance levels, and aviation advisory warnings for **Volcano Watch — Fire Beneath the Earth**.
- **Offline Fallback**: Versioned anomaly records in [`data/offline/nasa_tropomi_so2_volcano_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_tropomi_so2_volcano_sample.json).
- **Verification Status**: `verified`

### 2.7 NASA & NORAD Earth Observation Satellite TLE Ephemeris Reference
- **Source ID**: `nasa_norad_tle_ephemeris`
- **Product Code & Version**: `NORAD_TLE_EO` / Standard 2-Line Ephemeris Format
- **Agency / Provider**: NASA Flight Dynamics Facility / 18th Space Defense Squadron via CelesTrak
- **Temporal Coverage**: Published continuously (daily epochs)
- **Spatial Coverage**: Low Earth Orbit (LEO) orbital state vectors
- **Physical Units**:
  - `mean_motion`: revolutions per day ($\text{rev/day}$)
  - `inclination`: degrees (°)
  - `eccentricity`: dimensionless ratio [0.0, 1.0)
  - `semi_major_axis`: kilometers ($\text{km}$)
  - `altitude_above_ellipsoid`: kilometers ($\text{km}$)
- **Quality / Confidence Flags**: `operational_spacetrack`, `validated_sso`
- **License & Usage Rights**: Public Domain (US Government satellite ephemeris data).
- **API Requirements**: Public CelesTrak endpoints; bundled offline TLE catalog requires zero credentials.
- **Gameplay Role**: Serves as numerical reference benchmarks for validating LumenOS Keplerian + $J_2$ orbital propagation accuracy against real satellites (Terra, Aqua, Suomi NPP, Sentinel-1A).
- **Offline Fallback**: Versioned benchmark TLE sets in [`data/offline/nasa_tle_orbital_sample.json`](file:///d:/projects/LumenOS/data/offline/nasa_tle_orbital_sample.json).
- **Verification Status**: `verified`

---

## 3. Offline-First Architecture & Zero Credential Requirement

LumenOS is architected to be completely operational in air-gapped, offline, classroom, or test environments:
1. **Bundled Offline Datasets**: All 7 reference products are stored as validated, versioned JSON files in [`data/offline/`](file:///d:/projects/LumenOS/data/offline/).
2. **Graceful Fallback**: If external network calls fail or API credentials are not set, the application operates normally with bundled datasets without throwing unhandled exceptions.
3. **No Credential Fabrication**: LumenOS never fabricates API tokens or simulated successful API responses. If an API key is missing, the system explicitly reports:
   ```json
   {
     "status": "offline_fallback_active",
     "note": "Free registration MAP_KEY required for live NASA FIRMS API; offline bundle active."
   }
   ```

