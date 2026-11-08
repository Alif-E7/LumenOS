# LumenOS Spacecraft Simulation Engine

The LumenOS simulation engine executes deterministic, discrete-step ($60\text{ s}$) physical integrations of orbital mechanics and spacecraft subsystems. Designed for aerospace education, every model is rooted in verified textbook equations and empirical constants.

---

## 1. Orbital Mechanics & Astrodynamics

- **Two-Body Keplerian Motion**: State vectors are propagated using Kepler's Equation solved iteratively via Newton-Raphson:
  $$M = E - e \sin E, \quad n = \sqrt{\frac{\mu_\oplus}{a^3}}$$
- **Earth Oblateness ($J_2$) Perturbations**: Secular drift in the Right Ascension of the Ascending Node (RAAN, $\dot{\Omega}$) and Argument of Periapsis ($\dot{\omega}$) are integrated at every step (Vallado Eq. 9-37 & 9-38):
  $$\dot{\Omega} = -\frac{3}{2} n J_2 \left(\frac{R_\oplus}{p}\right)^2 \cos i$$
- **Sun-Synchronous Orbit (SSO)**: Matched to the Earth's annual heliocentric mean motion ($\approx +0.9856^\circ/\text{day}$):
  $$\cos i_{\text{SSO}} = -\frac{2 \dot{\Omega}_{\text{SSO}} p^2}{3 n J_2 R_\oplus^2} \implies i \approx 97.6^\circ \text{ at } 550\text{ km}$$
- **Conical / Cylindrical Shadow Model**: Smooth penumbral transitions ($\Delta R_{\text{pen}} = 10.0\text{ km}$) calculate exact solar illumination fraction ($0.0 \le f_{\text{sun}} \le 1.0$), eliminating discrete step impulses in solar array power.

---

## 2. Electrical Power & Battery Subsystems

- **Photovoltaic Generation**:
  $$P_{\text{solar}} = S_0 \cdot A_{\text{pv}} \cdot \eta_{\text{pv}} \cdot \eta_{\text{deg}}(t) \cdot \cos(\theta_{\text{inc}}) \cdot f_{\text{sun}}$$
  - Solar constant $S_0 = 1,361.0\text{ W/m}^2$ (NASA TSIS-1 baseline).
  - Cell efficiency $\eta_{\text{pv}} = 0.30$ (Triple-junction GaAs cells).
  - Annual radiation degradation $\delta_{\text{deg}} = 0.75\%\text{ per year}$.
- **Coulomb Counting & Battery Degradation**:
  $$\frac{dE_{\text{batt}}}{dt} = \begin{cases} P_{\text{net}} \cdot \eta_{\text{chg}} & \text{if } P_{\text{net}} > 0 \quad (\eta_{\text{chg}} = 0.92) \\ P_{\text{net}} / \eta_{\text{dis}} & \text{if } P_{\text{net}} < 0 \quad (\eta_{\text{dis}} = 0.95) \end{cases}$$
  - Safe Operating Reserve: $20.0\%$ SoC
  - Critical Payload Cutoff: $10.0\%$ SoC (triggers emergency load shedding)
  - Equivalent Full Cycle (EFC) Wear: $0.00005$ capacity fade per complete charge-discharge equivalent. (LEO orbits are **not** counted as full battery cycles).

---

## 3. Lumped Capacitance Thermal Balance

- **Energy Conservation Differential Equation**:
  $$C_{\text{th}} \frac{dT}{dt} = Q_{\text{solar}} + Q_{\text{albedo}} + Q_{\text{EarthIR}} + Q_{\text{internal}} + Q_{\text{heater}} - Q_{\text{rad}}$$
  - Spacecraft thermal mass: $C_{\text{th}} = 50,000\text{ J/K}$ (aluminum bus structure).
- **Deep-Space Stefan-Boltzmann Radiative Sink**:
  $$Q_{\text{rad}} = \epsilon_{\text{rad}} \cdot \sigma \cdot A_{\text{rad}} \left(T^4 - T_{\text{space}}^4\right)$$
  where $\sigma = 5.67037 \times 10^{-8}\text{ W/(m}^2\cdot\text{K}^4)$, $T_{\text{space}} = 2.725\text{ K}$, $\epsilon = 0.85$.
- **Thermostatic Survival Heater**:
  - Automatically switches ON ($+30\text{ W}$) when $T \le 5.0^\circ\text{C}$.
  - Deactivates when $T \ge 8.0^\circ\text{C}$ ($3^\circ\text{C}$ deadband prevents high-frequency limit cycle chattering).

---

## 4. Communications & RF Link Geometry

- **Line-of-Sight Elevation Mask**:
  $$\sin(\theta_{\text{elev}}) = \frac{\mathbf{\rho} \cdot \hat{\mathbf{u}}_{\text{up}}}{\|\mathbf{\rho}\|}, \quad \text{Mask: } \theta_{\text{elev}} \ge 5.0^\circ$$
  Passes are valid only when the satellite rises $\ge 5^\circ$ above the local horizon.
- **Free-Space Path Loss (FSPL)**:
  $$\text{FSPL}_{\text{dB}} = 20\log_{10}(d) + 20\log_{10}(f) + 20\log_{10}\left(\frac{4\pi}{c}\right)$$
  Evaluated at $8.0\text{ GHz}$ X-band downlink ($170.51\text{ dB}$ at $1,000\text{ km}$).
- **Multi-Queue Priority Downlink**:
  Bandwidth drains strictly in descending order of urgency:
  $$\text{Priority 1 (Disaster Alerts)} \longrightarrow \text{Priority 2 (Processed Science)} \longrightarrow \text{Priority 3 (Raw Telemetry)}$$

---

## 5. Solid-State Data Recorder (SSDR) Storage

- **Multi-Queue Partitioning**: Segregated buffers for raw observation frames, compressed calibrated science, and critical emergency alerts.
- **Compression Profiles**:
  - `FULL`: High CPU throughput ($35\text{ W}$), $3.0:1$ compression ratio.
  - `ECO`: Power-saving CPU ($15\text{ W}$), $2.0:1$ compression ratio.
  - `SAFE`: Housekeeping only ($5\text{ W}$), instruments off, uncompressed bypass.
  *(Note: FULL, ECO, and SAFE are operational profile labels, not ML quantization levels.)*
- **Priority-Protected Overflow Policy**: When storage approaches capacity ($8,000\text{ MB}$), the system drops uncompressed raw frames first. High-priority disaster alerts and processed science within the $800\text{ MB}$ safe reserve are permanently protected from truncation.

---

## 6. Space Environment: Radiation & Orbital Debris

- **Total Ionizing Dose (TID)**: Computes ambient cosmic dose ($0.005\text{ rad/hr}$), augmented during South Atlantic Anomaly (SAA) crossings ($+0.50\text{ rad/hr}$) and polar auroral horn crossings ($+0.15\text{ rad/hr}$).
- **Orbital Debris Spatial Density**: Altitude flux distribution curve accurately peaking at $750–900\text{ km}$ (mirroring ESA MASTER and NASA ORDEM data resulting from Cosmos-2251/Iridium-33 and Fengyun-1C debris fragments). Active Whipple bumpers reduce collision risk by $60\%$.

