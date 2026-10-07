# LumenOS 🚀

![Python](https://img.shields.io/badge/Python-3.11%2B-blue?logo=python&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)
![NASA Space Apps 2026](https://img.shields.io/badge/NASA-Space_Apps_2026-blue?logo=nasa&logoColor=white)

LumenOS is the thermodynamics-aware operating system designed for the next generation of orbital data centers.

## 🎯 Problem Statement
In 2026, the push for space-based AI data centers is constrained by a physical reality: **there is no air in space**. 
Without convection, cooling relies entirely on radiators glowing infrared into the vacuum. A $2 billion AI server can melt in just 14 minutes if its radiator is facing the sunlit Earth. Traditional schedulers (like Kubernetes) only check for available power and CPU, ignoring the thermal environment. They are thermally blind.

## 💡 Solution
LumenOS solves the thermal bottleneck by making scheduling decisions based on orbital mechanics and thermodynamics. Every 30 seconds, it asks:
> *"Given where we are in orbit, how hot we are, and how much power we have, which job can run right now without pushing the hardware toward a thermal shutdown?"*

By looking ahead and predicting temperatures based on radiator orientation (Deep Space vs. Earth Day vs. Earth Night), LumenOS pauses heavy workloads *before* critical thresholds are reached and resumes them when cooling conditions improve, effectively preventing hard thermal shutdowns.

## 🏗️ Architecture
LumenOS consists of four core modules:
1. **Orbital Engine (`orbital_engine.py`)**: Uses SGP4 propagation and celestial mechanics to determine satellite position, sunlight/eclipse state, and radiator view factor (Deep Space, Earth Day, Earth Night).
2. **Thermal Engine (`thermal_engine.py`)**: A lumped capacitance model simulating the server's temperature, heat generation, Stefan-Boltzmann heat rejection, and battery charge states.
3. **Workload Profiler (`workload_profiler.py`)**: Manages the catalog of AI workloads (Heavy, Medium, Cold) with precise power draws and thermal limits.
4. **Lumen Scheduler (`lumen_scheduler.py`)**: The brain of the system. It preemptively schedules tasks using a 5-minute thermal lookahead and status-gated rules, gracefully checkpointing tasks before the system overheats.

## 🚀 How to Run

1. Clone the repository and navigate to the root directory.
2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the interactive Streamlit dashboard:
   ```bash
   python -m streamlit run dashboard/app.py
   ```

## 📊 NASA Data Sources Used
- **JPL Horizons**: Orbital mechanics and solar ephemeris models.
- **ISS TCS (Thermal Control System)**: Reference parameters for orbital thermal dissipation and radiator efficiency.
- **NASA POWER API**: Solar irradiance approximations for power generation in LEO.

## 🏆 Impact
- **Unlocks Orbital Computing**: Solves the #1 bottleneck of 2026 orbital infrastructure by maximizing useful compute time.
- **Open-Source Standard**: Provides an open-source alternative to proprietary, closed-source space schedulers.
- **Hardware Longevity**: Extends hardware lifespan and prevents catastrophic failures by drastically reducing deep thermal cycling and hard shutdowns.

## 👥 Team
*Add your team details here!*

## 📜 License
This project is licensed under the MIT License - see the LICENSE file for details.
