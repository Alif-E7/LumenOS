# 🚀 LumenOS: Orbital Mission Trade-off Simulator

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)](https://www.python.org/)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.36%2B-FF4B4B?logo=streamlit&logoColor=white)](https://streamlit.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NASA Space Apps 2026](https://img.shields.io/badge/NASA-Space_Apps_2026-0B3D91?logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/)

> **"No fans. No air. No second chances."**  
> *LumenOS is an orbital thermodynamics-aware hypervisor and mission design simulator for next-generation space-based AI data centers.*

---

## 🎯 The Challenge: Space Mission Design Game

Space mission design is fundamentally an unforgiving game of multi-variable engineering trade-offs:
- **Mass vs. Heat**: Larger radiators dump heat but add punishing launch mass.
- **Power vs. Darkness**: Larger batteries survive long eclipses but steal payload capacity.
- **Compute Throughput vs. Meltdown**: Pushing AI GPUs in microgravity risks thermal runaway.

**LumenOS** addresses the **NASA Space Apps 2026 "Space Mission Design Game"** challenge by transforming celestial mechanics and satellite thermodynamics into an interactive, real-time trade-off simulator. Mission designers can architect spacecraft hardware, choose their operating system, and test whether their orbital data center thrives or melts down under extreme space conditions.

### 🎮 Why a Game for Data Centers?

> While our core technology (LumenOS) is designed to solve the critical thermal bottleneck for future Orbital AI Data Centers, we built this interactive simulator to make those complex engineering trade-offs accessible. By gamifying the deployment of a space data center, students and engineers can experience firsthand how power, mass, and thermal constraints shape the success of a mission. LumenOS isn't just a game; it's the operational blueprint for the next generation of space-based computing.

---

## 💡 The Problem: Why Space Data Centers Overheat

In Earth-bound data centers, cooling is easy: blow air across heatsinks or pump chilled liquid. In the vacuum of space, cooling is an existential crisis:

1. **The Vacuum Trap**: Convection is physically impossible. There is no air or atmosphere to carry heat away.
2. **Radiation Only**: Heat rejection occurs exclusively via thermal radiation governed by the **Stefan-Boltzmann Law**:
   $$Q_{\text{out}} = \varepsilon \cdot \sigma \cdot A_{\text{rad}} \cdot (T_{\text{server}}^4 - T_{\text{sink}}^4)$$
3. **Orbital Thermal Rollercoaster**: As a satellite orbits, its radiative sink temperature swings violently:
   - 🌌 **Deep Space** ($3\text{ K}$): Pristine cooling sink ($\sim 900\text{ W}$ heat rejection).
   - 🌑 **Earth Night** ($220\text{ K}$): Moderate cooling sink ($\sim 750\text{ W}$ heat rejection).
   - ☀️ **Earth Day** ($280\text{ K}$): **Danger Zone** ($\sim 490\text{ W}$ heat rejection) — warm Earth albedo drastically chokes cooling.
   - 🌘 **Eclipse Passes**: Solar array power drops to $0\text{ W}$, forcing systems onto constrained battery reserves.
4. **The Meltdown**: Legacy ground schedulers (Kubernetes, Slurm) are **thermally blind**. They schedule heavy AI workloads whenever power is present. When radiator cooling drops while passing warm day-side Earth, hardware temperatures surge past **$95^\circ\text{C}$**, triggering catastrophic thermal shutdowns, losing uncheckpointed training progress, and leaving satellite electronics dark.

---

## 🧠 The Solution: LumenOS Thermodynamics-Aware Hypervisor

LumenOS replaces blind job execution with orbital physics and thermodynamic look-ahead scheduling. Every 30 seconds, LumenOS evaluates:

> *"Given where we are in orbit, how hot the chassis is, and available battery reserves, which AI workload can safely execute without triggering thermal shutdown?"*

### Core Hypervisor Capabilities:
- 🔮 **5-Minute Predictive Look-Ahead**: Evaluates numerical forward-Euler thermal predictions ($\frac{dT}{dt} = \frac{Q_{\text{in}} - Q_{\text{out}}}{m \cdot C_p}$) to predict overheating *before* tasks are launched.
- 🌡️ **Status-Gated Workload Profiling**:
  - **NOMINAL** ($<60^\circ\text{C}$): Dispatches **HEAVY** workloads (LLM Fine-Tuning, NeRF 3D Reconstruction).
  - **WARNING** ($60\text{--}80^\circ\text{C}$): Throttles to **MEDIUM** workloads (Multispectral Earth Observation, Vision Transformers).
  - **CRITICAL** ($80\text{--}95^\circ\text{C}$): Drops to **COLD** workloads (Telemetry Filtering, Model Quantization).
  - **SHUTDOWN AVOIDED**: Preemptively pauses jobs and saves execution state via checkpointing.
- 🔋 **Intelligent Battery & Eclipse Orchestration**: Prioritizes battery health during eclipse and leverages cold deep-space windows for high-throughput batch bursts.

---

## 🎮 How to Play the Simulator

Launch the interactive dashboard and test your mission architecture:

1. **🌐 Select Mission Scenario (Sidebar)**:
   - **🌍 LEO Earth Observer** (550 km, 53° incl): Standard Low-Earth Orbit with ~35-minute eclipses.
   - **🌕 Lunar Gateway (NRHO)** (High NRHO, 90° incl): Extended orbital periods, critical battery margins, $0.65\times$ solar flux.
   - **🔴 Mars Transit (Heliocentric)** (Deep Space Cruise): $0.43\times$ solar flux, continuous radiation load, zero planetary eclipse.
2. **⚙️ Configure Hardware Parameters (Sidebar)**:
   - **Radiator Area**: $0.5\text{ to }3.0\text{ m}^2$ (determines Stefan-Boltzmann thermal rejection).
   - **Battery Capacity**: $200\text{ to }1500\text{ Wh}$ (buffers electronics during eclipse).
   - **Server Chassis Mass**: $5\text{ to }30\text{ kg}$ (thermal inertia buffering rapid temperature swings).
3. **🖥️ Choose Operating System**:
   - **Naive Scheduler (Legacy)**: Blind greedy execution (triggers meltdown and lost compute).
   - **LumenOS (AI-Aware)**: Predictive, status-gated hypervisor with checkpointing.
4. **📊 Analyze Mission Results**:
   - Inspect the **Mission Report Card** (Success / Thermal Shutdown / Marginal).
   - Review the **+30% to +50% Compute Efficiency Gain** metric.
   - Track live spacecraft position on the **3D Orbital Globe** alongside synchronous thermal timelines.

---

## 🛠️ Tech Stack

- **Core Engine**: Python 3.11+
- **Astrodynamics & Ephemeris**: [Skyfield](https://rhodesmill.org/skyfield/), [SGP4](https://pypi.org/project/sgp4/)
- **Numerical Physics**: [NumPy](https://numpy.org/), [SciPy](https://scipy.org/)
- **Mission Simulator UI**: [Streamlit](https://streamlit.io/)
- **Data Visualization**: [Plotly Graph Objects](https://plotly.com/python/), [Matplotlib](https://matplotlib.org/)

---

## 📂 Project Structure

```text
LumenOS/
├── dashboard/
│   ├── app.py              # Main interactive Mission Design Simulator (Streamlit)
│   ├── orbit_view.py       # 3D interactive Earth globe and orbit visualization
│   └── thermal_graph.py    # Synchronized dual-timeline thermal charts
├── engine/
│   ├── __init__.py         # Package exports
│   ├── orbital_engine.py   # SGP4 orbit propagation, eclipse & view-factor physics
│   ├── thermal_engine.py   # Lumped-capacitance thermal & battery state model
│   ├── workload_profiler.py# AI workload catalogue (Heavy, Medium, Cold tasks)
│   └── lumen_scheduler.py  # Thermodynamics-aware scheduler & predictive lookahead
├── tests/
│   ├── test_orbital.py     # Astrodynamics & solar/cooling validation tests
│   └── test_scheduler.py   # LumenOS vs. Naive baseline comparison tests
├── make_demo_video.py      # Automated 120s 24fps MP4 mission scenario generator
├── requirements.txt        # Python dependency manifest (UTF-8)
└── README.md               # Project documentation
```

---

## 🚀 How to Run Locally

### 1. Clone the Repository
```bash
git clone https://github.com/Alif-E7/LumenOS.git
cd LumenOS
```

### 2. Set Up Virtual Environment & Dependencies
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Launch the Mission Simulator Dashboard
```bash
streamlit run dashboard/app.py
```
Open your browser at `http://localhost:8501`.

### 4. Run the Physics Test Suite
```bash
python tests/test_scheduler.py
python tests/test_orbital.py
```

---

## 📊 NASA Data Sources & Physical Principles

- **JPL Horizons Ephemeris**: Reference planetary positions and solar vector derivations.
- **ISS Thermal Control System (TCS)**: Baseline radiative view factor approximations and thermal interface boundaries.
- **Stefan-Boltzmann Radiation Equation**: Rigorous non-linear blackbody radiation physics.
- **NASA SP-8005**: Solar electromagnetic radiation flux and albedo modeling guidelines.

---

## 👥 The Crew — Team LumenOS

| Name | Role | Responsibilities |
|---|---|---|
| **Member 1** | 🚀 Mission Architect & Systems Lead | Overall architecture, systems trade-offs, mission scenario definitions |
| **Member 2** | 🪐 Astrodynamics & Thermal Engineer | Orbital mechanics, SGP4 propagation, Stefan-Boltzmann thermodynamic model |
| **Member 3** | 🧠 Hypervisor & Backend Lead | Predictive scheduling engine, workload profiler, checkpointing logic |
| **Member 4** | 🎨 UI/UX & Visualization Engineer | Streamlit interactive dashboard, 3D Plotly globe, real-time animation |
| **Member 5** | 📝 Technical Writer & Communications | Documentation, NASA challenge alignment, project presentation & video |

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
