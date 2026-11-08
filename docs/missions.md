# LumenOS Mission Scenarios & Campaign Content

LumenOS features exactly four data-driven scenario families sharing the underlying orbital mechanics and subsystem physics engine. Each scenario challenges the crew with a distinct operational tradeoff.

---

## Scenario 1: Wildfire Scout — Eyes on Fire

- **Codename**: `wildfire`
- **Scientific Contract**: Rapid detection and characterization of active wildfire thermal anomalies across Southeastern Australia (Blue Mountains, Gippsland Ridge, Hunter Valley).
- **Orbit Baseline**: Sun-Synchronous Orbit (SSO), Altitude: $550\text{ km}$, Inclination: $97.6^\circ$, Period: $95.5\text{ min}$.
- **Primary Objectives**:
  1. Detect and map at least 3 active fire thermal anomalies.
  2. Downlink emergency hazard alerts with $<30\text{ min}$ latency from acquisition.
- **Optional Objectives**:
  - Maintain battery Depth of Discharge (DoD) $<40\%$ across all eclipse cycles.
  - Deliver high-resolution multispectral perimeter maps for Gippsland Ridge.
- **Key Operational Tradeoff**: Balancing heavy thermal imaging power draw against dense pyrocumulonimbus smoke attenuation and short ground-station contact windows.
- **Permitted Payload**: Mid-Wave Infrared (MWIR / LWIR) thermal cameras, optical survey imager.
- **Reference Data**: NASA FIRMS VIIRS active fire detections (`VNP14IMGTDL_NRT`).

---

## Scenario 2: Flood Scout — Rising Waters

- **Codename**: `flood`
- **Scientific Contract**: All-weather inundation mapping across the Brahmaputra River Basin and Ganges Delta to support disaster relief coordination.
- **Orbit Baseline**: Low Earth Orbit (LEO), Altitude: $580\text{ km}$, Inclination: $98.2^\circ$, Period: $96.1\text{ min}$.
- **Primary Objectives**:
  1. Map flood boundary polygons covering $>1,500\text{ km}^2$.
  2. Downlink calibrated Synthetic Aperture Radar (SAR) products prior to regional ground-station loss of signal.
- **Optional Objectives**:
  - Avoid any Solid-State Data Recorder (SSDR) buffer overflow drops.
  - Execute onboard compression with $\ge 2.5:1$ ratio on all raw radar swaths.
- **Key Operational Tradeoff**: High SAR radar power demand ($400\text{ W}$) and massive data volume generating severe storage backlog during orbital passes with limited ground station visibility.
- **Permitted Payload**: C-band Synthetic Aperture Radar (SAR), Wide-Swath Optical Sensor.
- **Reference Data**: Copernicus Sentinel-1 / NASA Alaska Satellite Facility (ASF) SAR flood extents.

---

## Scenario 3: Solar Storm Sentinel — Watch the Sun

- **Codename**: `solar_storm`
- **Scientific Contract**: Heliophysics and space-weather monitoring, tracking Coronal Mass Ejections (CMEs) and solar flares threatening Earth-orbiting infrastructure.
- **Orbit Baseline**: High-Inclination Polar Orbit, Altitude: $700\text{ km}$, Inclination: $98.5^\circ$, Period: $98.7\text{ min}$.
- **Primary Objectives**:
  1. Measure solar extreme-ultraviolet (EUV) irradiance and detect X-class flare onset.
  2. Transition bus subsystems into protective Safe Mode before high-energy Solar Energetic Particle (SEP) storm arrival.
- **Optional Objectives**:
  - Keep cumulative Total Ionizing Dose (TID) $<0.50\text{ rad}$.
  - Maintain solar array sun-pointing within $2^\circ$ off-pointing error.
- **Key Operational Tradeoff**: High solar irradiance generates maximum photovoltaic power, but ionizing radiation storms cause severe memory single-event upsets (SEUs) and bus overheating.
- **Permitted Payload**: Extreme Ultraviolet (EUV) Photometer, Magnetometer, Particle Radiation Monitor.
- **Reference Data**: NOAA Space Weather Prediction Center / NASA DONKI solar event catalogs.

---

## Scenario 4: Volcano Watch — Fire Beneath the Earth

- **Codename**: `volcano`
- **Scientific Contract**: Volcanic eruption early warning, tracking sulfur dioxide ($\text{SO}_2$) gas plumes and thermal caldera hotspots at Mount Merapi and Anak Krakatau.
- **Orbit Baseline**: Low-Inclination Equatorial LEO, Altitude: $500\text{ km}$, Inclination: $28.5^\circ$, Period: $94.6\text{ min}$.
- **Primary Objectives**:
  1. Characterize atmospheric $\text{SO}_2$ plume concentration ($>50\text{ Dobson Units}$).
  2. Issue rapid aviation hazard alert packages before plume disperses into international flight corridors.
- **Optional Objectives**:
  - Avoid orbital debris collision hazards in dense equatorial debris shells.
  - Complete mission with $>20\%$ propellant reserves remaining.
- **Key Operational Tradeoff**: Rapidly prioritizing high-speed spectrometer data processing while performing collision avoidance trim maneuvers.
- **Permitted Payload**: Hyperspectral UV/VIS Spectrometer, Thermal Infrared Imager.
- **Reference Data**: Copernicus Sentinel-5P TROPOMI & MODVOLC active volcanic thermal records.

