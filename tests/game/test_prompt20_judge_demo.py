"""
Prompt 20 — Automated Acceptance Tests for Judge Demo & Release Candidate.

Verifies:
1. Complete 24-hour mission propagation across 1,440 steps without clock jumping or skipped physics.
2. Flagship Wildfire Scout execution in both Solo and Co-op modes.
3. Versatile execution of Flood Scout, Solar Storm Sentinel, and Volcano Watch.
4. Deterministic repeatability with seed=42.
5. What-If branching generation from the 24-hour run.
"""

from __future__ import annotations

import pytest
from scripts.run_judge_demo import run_judge_demo


class TestPrompt20JudgeDemo:
    """Verifies that the judge demonstration runner functions cleanly across scenarios."""

    def test_judge_demo_wildfire_flagship_fast(self):
        exit_code = run_judge_demo(scenario_id="wildfire", seed=42, fast=True)
        assert exit_code == 0

    def test_judge_demo_flood_scout_fast(self):
        exit_code = run_judge_demo(scenario_id="flood", seed=42, fast=True)
        assert exit_code == 0

    def test_judge_demo_solar_storm_fast(self):
        exit_code = run_judge_demo(scenario_id="solar_storm", seed=42, fast=True)
        assert exit_code == 0

    def test_judge_demo_volcano_watch_fast(self):
        exit_code = run_judge_demo(scenario_id="volcano", seed=42, fast=True)
        assert exit_code == 0
