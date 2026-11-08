"""
Benchmark API Router (Prompt 13).
==================================
Exposes endpoints for running fair three-way comparative benchmarks across:
  - Manual Flight Crew
  - Traditional Reactive Autopilot
  - LumenOS Predictive Control
"""

from __future__ import annotations

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from game.benchmark import benchmark_harness, BenchmarkComparisonResult
from api.routers.missions import _load_missions


router = APIRouter(prefix="/benchmark", tags=["benchmark"])

# Cache latest benchmark comparison result
_latest_benchmark_result: Optional[dict[str, Any]] = None


class RunBenchmarkRequest(BaseModel):
    scenario_id: str = Field(default="wildfire", description="Scenario ID to benchmark")
    seed: int = Field(default=42, description="Random seed for identical-input evaluation")
    max_steps: int = Field(default=60, ge=10, le=1440, description="Number of simulation steps")


class RunSuiteRequest(BaseModel):
    scenarios: list[str] = Field(default=["wildfire", "solar_storm"])
    seeds: list[int] = Field(default=[42, 101])
    max_steps: int = Field(default=50, ge=10, le=500)


@router.get("/scenarios")
def get_benchmark_scenarios() -> list[dict[str, Any]]:
    """Return list of scenarios available for three-way flight control benchmarking."""
    missions = _load_missions()
    return [
        {
            "id": m.id,
            "name": m.name,
            "description": m.description,
            "difficulty": m.difficulty,
            "duration_hours": m.duration_hours,
            "orbit_altitude_km": m.orbit_altitude_km,
            "objectives_count": len(m.objectives),
        }
        for m in missions.values()
    ]


@router.post("/run")
def run_benchmark_trial(req: RunBenchmarkRequest) -> dict[str, Any]:
    """
    Execute a fair three-way comparative benchmark trial across Manual, Reactive,
    and Predictive control on identical inputs and precomputed exogenous events.
    """
    global _latest_benchmark_result
    try:
        comparison = benchmark_harness.run_comparison(
            scenario_id=req.scenario_id,
            seed=req.seed,
            max_steps=req.max_steps,
        )
        res_dict = comparison.model_dump()
        _latest_benchmark_result = res_dict
        return res_dict
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmark execution failed: {str(e)}")


@router.post("/suite")
def run_benchmark_suite(req: RunSuiteRequest) -> dict[str, Any]:
    """Execute repeated multi-scenario, multi-seed benchmark matrix."""
    try:
        return benchmark_harness.run_multi_seed_benchmark(
            scenarios=req.scenarios,
            seeds=req.seeds,
            max_steps=req.max_steps,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Suite execution failed: {str(e)}")


@router.get("/latest")
def get_latest_benchmark() -> dict[str, Any]:
    """Retrieve the most recent benchmark comparison result."""
    global _latest_benchmark_result
    if not _latest_benchmark_result:
        # Run default wildfire seed 42 trial if none cached
        comparison = benchmark_harness.run_comparison(scenario_id="wildfire", seed=42, max_steps=50)
        _latest_benchmark_result = comparison.model_dump()
    return _latest_benchmark_result
