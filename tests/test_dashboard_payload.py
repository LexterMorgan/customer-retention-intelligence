"""Focused tests for the analytics-to-dashboard JSON payload layer.

Run from the repository root:
    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = REPO_ROOT / "analysis"
if str(ANALYSIS_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYSIS_DIR))

import dashboard_payload as dp  # noqa: E402

SOURCE_CSV = REPO_ROOT / "data" / "processed" / "customers_clean.csv"

REQUIRED_TOP_LEVEL = {
    "metadata",
    "kpis",
    "by_contract",
    "by_tenure",
    "by_internet",
    "by_offer",
    "by_billing",
    "by_demographics",
    "churn_reasons",
    "risk_tiers",
    "segments",
    "contract_tenure_matrix",
    "mrvl",
    "scenario",
    "filter_dimensions",
}

REQUIRED_KPI_KEYS = {
    "total_customers",
    "existing_customers",
    "churned_customers",
    "retained_customers",
    "churn_rate_pct",
    "retention_rate_pct",
    "mrvl",
}


class PayloadSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = dp.build_and_validate(source_path=SOURCE_CSV, write=False)

    def test_top_level_keys(self):
        self.assertEqual(REQUIRED_TOP_LEVEL, set(self.payload.keys()))

    def test_kpi_keys_include_seven_primary(self):
        self.assertTrue(REQUIRED_KPI_KEYS.issubset(set(self.payload["kpis"].keys())))

    def test_filter_dimensions(self):
        dims = self.payload["filter_dimensions"]
        for key in (
            "contract",
            "tenure_band",
            "internet_type",
            "offer",
            "payment_method",
            "descriptive_churn_risk_tier",
        ):
            self.assertIn(key, dims)
            self.assertGreater(len(dims[key]), 0)

    def test_breakdown_list_shapes(self):
        self.assertEqual(len(self.payload["by_contract"]), 3)
        self.assertEqual(len(self.payload["by_tenure"]), 6)
        self.assertEqual(len(self.payload["by_internet"]), 4)
        self.assertEqual(len(self.payload["by_offer"]), 6)
        self.assertEqual(len(self.payload["risk_tiers"]), 4)
        self.assertEqual(len(self.payload["segments"]), 6)
        self.assertEqual(len(self.payload["contract_tenure_matrix"]), 18)

    def test_billing_and_demographics_sections(self):
        billing = self.payload["by_billing"]
        demo = self.payload["by_demographics"]
        self.assertIn("payment_method", billing)
        self.assertIn("paperless_billing", billing)
        self.assertIn("charge_band", billing)
        self.assertIn("age_band", demo)
        self.assertIn("gender", demo)
        self.assertIn("married", demo)
        self.assertIn("dependents", demo)

    def test_churn_reasons_pareto_structure(self):
        reasons = self.payload["churn_reasons"]
        self.assertEqual(reasons["total_churned"], 1869)
        self.assertEqual(len(reasons["categories"]), 5)
        self.assertGreaterEqual(len(reasons["top_reasons"]), 5)
        self.assertEqual(len(reasons["top_5_reasons"]), 5)
        # Cumulative share is non-decreasing.
        cumulative = [r["cumulative_pct_of_churners"] for r in reasons["reasons"]]
        self.assertEqual(cumulative, sorted(cumulative))


class PayloadBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = dp.build_and_validate(source_path=SOURCE_CSV, write=False)
        cls.kpis = cls.payload["kpis"]

    def test_core_kpi_benchmarks(self):
        self.assertEqual(self.kpis["total_customers"], 7043)
        self.assertEqual(self.kpis["existing_customers"], 6589)
        self.assertEqual(self.kpis["churned_customers"], 1869)
        self.assertEqual(self.kpis["retained_customers"], 4720)
        self.assertEqual(self.kpis["joined_customers"], 454)
        self.assertAlmostEqual(self.kpis["churn_rate_pct"], 28.37, places=2)
        self.assertAlmostEqual(self.kpis["retention_rate_pct"], 71.63, places=2)
        self.assertAlmostEqual(self.kpis["mrvl"], 137086.65, places=2)

    def test_contract_m2m_benchmark(self):
        m2m = next(r for r in self.payload["by_contract"] if r["category"] == "Month-to-Month")
        self.assertEqual(m2m["existing_customers"], 3202)
        self.assertEqual(m2m["churned_customers"], 1655)
        self.assertAlmostEqual(m2m["churn_rate_pct"], 51.69, places=2)

    def test_tenure_early_benchmark(self):
        early = next(r for r in self.payload["by_tenure"] if r["category"] == "0-6 months")
        self.assertEqual(early["existing_customers"], 1016)
        self.assertEqual(early["churned_customers"], 784)
        self.assertAlmostEqual(early["churn_rate_pct"], 77.17, places=2)

    def test_fiber_benchmark(self):
        fiber = next(r for r in self.payload["by_internet"] if r["category"] == "Fiber Optic")
        self.assertEqual(fiber["existing_customers"], 2934)
        self.assertEqual(fiber["churned_customers"], 1236)
        self.assertAlmostEqual(fiber["churn_rate_pct"], 42.13, places=2)


class PayloadSegmentRiskTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = dp.build_and_validate(source_path=SOURCE_CSV, write=False)

    def test_high_risk_intersection_segment(self):
        seg = next(
            r
            for r in self.payload["segments"]
            if r["segment"] == "M2M + 0-6 months + Fiber Optic"
        )
        self.assertEqual(seg["existing_customers"], 487)
        self.assertEqual(seg["churned_customers"], 444)
        self.assertAlmostEqual(seg["churn_rate_pct"], 91.17, places=2)

    def test_risk_tier_benchmarks(self):
        expected = {
            "Very High": (2156, 66.51),
            "High": (1259, 20.65),
            "Medium": (1714, 7.29),
            "Low": (1460, 3.42),
        }
        for tier, (n, rate) in expected.items():
            row = next(r for r in self.payload["risk_tiers"] if r["tier"] == tier)
            self.assertEqual(row["existing_customers"], n, tier)
            self.assertAlmostEqual(row["churn_rate_pct"], rate, places=2, msg=tier)

    def test_scenario_benchmarks(self):
        scenario = self.payload["scenario"]
        self.assertTrue(scenario["illustrative_only"])
        self.assertEqual(scenario["scenario_retained_customers"], 44)
        self.assertAlmostEqual(scenario["scenario_monthly_preserved"], 3524.68, places=2)
        self.assertAlmostEqual(scenario["scenario_annual_preserved"], 42296.22, places=2)

    def test_competitor_reason_category(self):
        competitor = next(
            r
            for r in self.payload["churn_reasons"]["categories"]
            if r["category"] == "Competitor"
        )
        self.assertEqual(competitor["churner_count"], 841)


class DeterminismTests(unittest.TestCase):
    def test_payload_bytes_are_stable_across_builds(self):
        a = dp.build_and_validate(source_path=SOURCE_CSV, write=False)
        b = dp.build_and_validate(source_path=SOURCE_CSV, write=False)
        self.assertEqual(dp.dumps_payload(a), dp.dumps_payload(b))

    def test_written_json_round_trip_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "dashboard_payload.json"
            payload = dp.build_and_validate(
                source_path=SOURCE_CSV, output_path=out, write=True
            )
            written = out.read_text(encoding="utf-8")
            self.assertEqual(written, dp.dumps_payload(payload))
            reloaded = json.loads(written)
            self.assertEqual(dp.dumps_payload(reloaded), written)

    def test_validate_rejects_drifted_kpi(self):
        payload = dp.build_and_validate(source_path=SOURCE_CSV, write=False)
        payload["kpis"]["churned_customers"] = 0
        with self.assertRaises(dp.PayloadValidationError):
            dp.validate_payload(payload)


if __name__ == "__main__":
    unittest.main()
