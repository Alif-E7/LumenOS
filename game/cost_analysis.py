"""
Educational Cost-Per-Useful-Result Analysis ("Is It Worth It?") — Prompt 15.

Computes pro-rated satellite lifecycle economics:
- Amortizes Spacecraft Bus development + rideshare launch Capex over design lifespan (e.g. 3 years / 15,768 orbits).
- Combines with operational in-mission expenditure (ground network passes + operations).
- Calculates exact Cost per Useful Science Megabyte downlinked and Cost per Anomaly Alert delivered.
- Contrasts against traditional monolithic flagship satellite economics to demonstrate the value of edge processing.
"""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class LifecycleCostModel(BaseModel):
    """Pro-rated economic analysis of mission utility and lifecycle return."""
    # Spacecraft & Launch CapEx
    bus_development_cost_usd: float = 14_000_000.0
    launch_rideshare_cost_usd: float = 6_000_000.0
    total_capex_usd: float = 20_000_000.0

    # Lifespan
    design_lifespan_years: float = 3.0
    design_lifetime_orbits: int = 15_768  # 3 yrs * 365.25 * 14.4 orbits/day
    amortized_capex_per_orbit_usd: float = 1_268.39

    # Current Mission Scope
    orbits_evaluated: float = 1.0
    amortized_mission_capex_usd: float = 1_268.39
    mission_operational_spent_usd: float = 2_500.0
    total_amortized_mission_cost_usd: float = 3_768.39

    # Deliverables & Efficiency
    data_downlinked_mb: float = 0.0
    alerts_delivered: int = 0
    cost_per_mb_usd: float = 0.0
    cost_per_alert_usd: float = 0.0

    # Comparative Benchmark
    benchmark_flagship_cost_per_mb_usd: float = 185.00  # Legacy monolithic Earth observation
    cost_efficiency_gain_pct: float = 0.0
    cost_efficiency_multiplier: float = 1.0

    # Documented Educational Assumptions
    educational_assumptions: list[str] = Field(default_factory=list)


def calculate_cost_per_useful_result(
    data_downlinked_mb: float,
    alerts_delivered: int,
    budget_spent_credits: float,
    steps_elapsed: int,
    time_step_seconds: float = 60.0,
    orbital_period_seconds: float = 6000.0,  # ~100 min SSO Earth observation orbit (~14.4 orbits/day)
    bus_capex_usd: float = 14_000_000.0,
    launch_capex_usd: float = 6_000_000.0,
    design_lifespan_years: float = 3.0,
) -> LifecycleCostModel:
    """
    Compute lifecycle cost-per-result with rigorous, documented amortization.
    """
    total_capex = bus_capex_usd + launch_capex_usd
    total_orbits = int(design_lifespan_years * 365.25 * (86400.0 / orbital_period_seconds))
    capex_per_orbit = total_capex / max(total_orbits, 1)

    # Mission duration in orbits
    mission_seconds = steps_elapsed * time_step_seconds
    orbits_in_mission = max(round(mission_seconds / orbital_period_seconds, 2), 0.5)

    amortized_mission_capex = round(capex_per_orbit * orbits_in_mission, 2)
    # 1 game budget credit = 1 USD operational expenditure (ground station link time + analyst team)
    operational_spent = round(max(budget_spent_credits, 500.0), 2)
    total_mission_cost = round(amortized_mission_capex + operational_spent, 2)

    # Unit costs
    downlinked = max(data_downlinked_mb, 0.0)
    alerts = max(alerts_delivered, 0)

    if downlinked > 0:
        cost_per_mb = round(total_mission_cost / downlinked, 2)
    else:
        cost_per_mb = total_mission_cost  # If 0 MB downlinked, entire cost per MB is total cost

    if alerts > 0:
        cost_per_alert = round(total_mission_cost / alerts, 2)
    else:
        cost_per_alert = round(total_mission_cost, 2)

    # Comparison against traditional monolithic flagship satellite (e.g. $1.5B program at ~$185/MB)
    benchmark_flagship = 185.00
    if cost_per_mb < benchmark_flagship and cost_per_mb > 0:
        mult = round(benchmark_flagship / cost_per_mb, 1)
        gain_pct = round(((benchmark_flagship - cost_per_mb) / benchmark_flagship) * 100.0, 1)
    else:
        mult = 1.0
        gain_pct = 0.0

    assumptions = [
        f"CapEx Amortization: ${total_capex/1e6:.1f}M capital investment (bus + launch) is pro-rated across a {design_lifespan_years:.0f}-year operational lifespan ({total_orbits:,} orbits) at ${capex_per_orbit:,.2f} per orbit.",
        f"Mission Scope: This {mission_seconds/3600:.1f}-hour run corresponds to {orbits_in_mission:.2f} orbital passes, allocating ${amortized_mission_capex:,.2f} in capital asset wear.",
        f"Operational Expense (OpEx): In-mission spending (${operational_spent:,.2f}) covers ground tracking network contact passes and flight control staffing.",
        f"Edge Processing Value: LumenOS onboard inference and lossless compression filter out empty frames, reducing bandwidth consumption while delivering high-confidence alerts.",
        f"Benchmark Context: Legacy flagship satellites without onboard edge processing average ~$185/MB due to massive satellite bus overhead and uncompressed downlink.",
    ]

    return LifecycleCostModel(
        bus_development_cost_usd=bus_capex_usd,
        launch_rideshare_cost_usd=launch_capex_usd,
        total_capex_usd=total_capex,
        design_lifespan_years=design_lifespan_years,
        design_lifetime_orbits=total_orbits,
        amortized_capex_per_orbit_usd=round(capex_per_orbit, 2),
        orbits_evaluated=orbits_in_mission,
        amortized_mission_capex_usd=amortized_mission_capex,
        mission_operational_spent_usd=operational_spent,
        total_amortized_mission_cost_usd=total_mission_cost,
        data_downlinked_mb=round(downlinked, 1),
        alerts_delivered=alerts,
        cost_per_mb_usd=cost_per_mb,
        cost_per_alert_usd=cost_per_alert,
        benchmark_flagship_cost_per_mb_usd=benchmark_flagship,
        cost_efficiency_gain_pct=gain_pct,
        cost_efficiency_multiplier=mult,
        educational_assumptions=assumptions,
    )
