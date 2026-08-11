"""Focused tests for the data-cleaning layer (analysis/data_cleaning.py).

Run from the repository root:
    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = REPO_ROOT / "analysis"
if str(ANALYSIS_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYSIS_DIR))

import data_cleaning as dc  # noqa: E402

RAW_CUSTOMERS = REPO_ROOT / "data" / "raw" / "telecom_customer_churn.csv"
RAW_ZIP = REPO_ROOT / "data" / "raw" / "telecom_zipcode_population.csv"


def _sample_raw_df() -> pd.DataFrame:
    """Small representative raw frame covering internet/phone/no-service cases."""
    addons = {
        addon: [None, None, None]
        for addon in dc.INTERNET_ADDON_COLS
    }
    addons["Online Security"] = ["Yes", None, None]
    addons["Online Backup"] = ["Yes", None, None]
    return pd.DataFrame(
        {
            "Customer ID": ["A", "B", "C"],
            "Gender": ["Female", "Male", "Female"],
            "Married": ["Yes", "No", "Yes"],
            "Age": [30, 40, 50],
            "Number of Dependents": [1, 0, 2],
            "City": ["X", "Y", "Z"],
            "Zip Code": [90001, 90002, 90003],
            "Latitude": [34.0, 34.1, 34.2],
            "Longitude": [-118.0, -118.1, -118.2],
            "Number of Referrals": [0, 1, 2],
            "Tenure in Months": [6, 12, 72],
            "Offer": [None, "Offer A", "None"],
            "Phone Service": ["Yes", "Yes", "No"],
            "Avg Monthly Long Distance Charges": [5.0, None, None],
            "Multiple Lines": ["No", None, None],
            "Internet Service": ["Yes", "Yes", "No"],
            "Internet Type": ["Fiber Optic", None, None],
            "Avg Monthly GB Download": [100.0, None, None],
            **addons,
            "Contract": ["Month-to-Month", "One Year", "Two Year"],
            "Paperless Billing": ["Yes", "No", "Yes"],
            "Payment Method": ["Credit Card", "Bank Withdrawal", "Mailed Check"],
            "Monthly Charge": [70.0, 60.0, 50.0],
            "Total Charges": [500.0, 1000.0, 3000.0],
            "Total Refunds": [0.0, 0.0, 0.0],
            "Total Extra Data Charges": [0, 0, 0],
            "Total Long Distance Charges": [0.0, 0.0, 0.0],
            "Total Revenue": [500.0, 1000.0, 3000.0],
            "Customer Status": ["Stayed", "Churned", "Joined"],
            "Churn Category": [None, "Competitor", None],
            "Churn Reason": [None, "Competitor made better offer", None],
        }
    )


def _apply_transforms(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Apply the cleaning transforms up to (but not including) the zip join."""
    df = dc.strip_string_columns(raw_df)
    df = dc.standardize_categories(df)
    df = dc.preserve_zip_code_as_text(df)
    df = dc.create_churn_flags(df)
    df = dc.create_quality_flags(df)
    df = dc.create_analytical_bands(df)
    df = dc.create_add_on_count(df)
    return df


def _run_pipeline(raw_df: pd.DataFrame, zip_df: pd.DataFrame):
    """Apply the cleaning transforms in the canonical order (no file writes)."""
    df = _apply_transforms(raw_df)
    df, join_stats = dc.join_zip_population(df, zip_df)
    return df, join_stats


class CustomerGrainTests(unittest.TestCase):
    def test_validate_customer_grain_accepts_unique(self):
        df = _sample_raw_df()
        dc.validate_customer_grain(df, "test")  # must not raise

    def test_validate_customer_grain_rejects_duplicates(self):
        df = pd.concat([_sample_raw_df(), _sample_raw_df().iloc[[0]]], ignore_index=True)
        with self.assertRaises(ValueError):
            dc.validate_customer_grain(df, "test")


class LoaderTests(unittest.TestCase):
    def test_load_raw_customers_expected_shape(self):
        raw = dc.load_raw_customers(RAW_CUSTOMERS)
        self.assertEqual(len(raw), dc.EXPECTED_ROW_COUNT)
        self.assertEqual(len(raw.columns), dc.EXPECTED_RAW_COLUMN_COUNT)

    def test_load_zip_population_rejects_duplicate_zips(self):
        dup = pd.DataFrame({"Zip Code": ["90001", "90001", "90002"], "Population": [1, 2, 3]})
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "zip_dup.csv"
            dup.to_csv(path, index=False)
            with self.assertRaises(ValueError):
                dc.load_zip_population(path)


class CategoryStandardizationTests(unittest.TestCase):
    def test_offer_none_recoded(self):
        df = dc.standardize_categories(_sample_raw_df())
        self.assertEqual(df.loc[0, "Offer"], "None")
        self.assertEqual(df.loc[1, "Offer"], "Offer A")

    def test_internet_na_and_addons(self):
        df = dc.standardize_categories(_sample_raw_df())
        # Row 2 has no internet -> all internet-dependent fields become N/A.
        self.assertEqual(df.loc[2, "Internet Type"], "N/A")
        self.assertEqual(df.loc[2, "Avg Monthly GB Download"], "N/A")
        for addon in dc.INTERNET_ADDON_COLS:
            self.assertEqual(df.loc[2, addon], "N/A")
        # Internet customers with missing add-ons become "No".
        self.assertEqual(df.loc[1, "Online Backup"], "No")
        self.assertEqual(df.loc[0, "Online Security"], "Yes")

    def test_phone_na(self):
        df = dc.standardize_categories(_sample_raw_df())
        self.assertEqual(df.loc[2, "Avg Monthly Long Distance Charges"], "N/A")
        self.assertEqual(df.loc[2, "Multiple Lines"], "N/A")
        self.assertEqual(df.loc[1, "Multiple Lines"], "No")


class DerivedFieldTests(unittest.TestCase):
    def test_create_churn_flags(self):
        df = dc.create_churn_flags(_sample_raw_df())
        self.assertEqual(df["Is_Churned"].tolist(), [0, 1, 0])
        self.assertEqual(df["Is_Retained"].tolist(), [1, 0, 0])

    def test_tenure_band_boundaries(self):
        df = _sample_raw_df()
        df = dc.create_analytical_bands(df)
        self.assertEqual(df.loc[0, "Tenure_Band"], "0-6 months")   # 6
        self.assertEqual(df.loc[1, "Tenure_Band"], "7-12 months")  # 12
        self.assertEqual(df.loc[2, "Tenure_Band"], "49-72 months")  # 72

    def test_age_band_boundaries(self):
        df = dc.create_analytical_bands(_sample_raw_df())
        self.assertEqual(df.loc[0, "Age_Band"], "30-39")
        self.assertEqual(df.loc[2, "Age_Band"], "50-59")

    def test_charge_band_boundaries(self):
        df = _sample_raw_df()
        df["Monthly Charge"] = [-5.0, 30.0, 90.0]
        df = dc.create_analytical_bands(df)
        self.assertEqual(df.loc[0, "Charge_Band"], "Credit (<$0)")
        self.assertEqual(df.loc[1, "Charge_Band"], "$30-49")
        self.assertEqual(df.loc[2, "Charge_Band"], "$90+")

    def test_add_on_count_internet_only(self):
        df = dc.standardize_categories(_sample_raw_df())
        df = dc.create_add_on_count(df)
        self.assertEqual(int(df.loc[0, "Add_On_Count"]), 2)
        self.assertEqual(int(df.loc[1, "Add_On_Count"]), 0)
        self.assertTrue(pd.isna(df.loc[2, "Add_On_Count"]))


class ZipJoinTests(unittest.TestCase):
    def test_join_preserves_grain_and_population(self):
        zip_df = pd.DataFrame({"Zip Code": ["90001", "90002", "90003"], "Population": [100, 200, 300]})
        df, join_stats = _run_pipeline(_sample_raw_df(), zip_df)
        self.assertEqual(len(df), 3)
        self.assertEqual(df["Zip_Population"].tolist(), [100, 200, 300])
        self.assertEqual(join_stats["unmatched_rows"], 0)

    def test_join_rejects_duplicate_lookup(self):
        dup = pd.DataFrame({"Zip Code": ["90001", "90001", "90002"], "Population": [1, 2, 3]})
        pre_join = _apply_transforms(_sample_raw_df())
        with self.assertRaises(ValueError):
            dc.join_zip_population(pre_join, dup)


class ValidationContractTests(unittest.TestCase):
    """run_validation must flag tampering but accept the canonical clean output."""

    @classmethod
    def setUpClass(cls):
        raw = dc.load_raw_customers(RAW_CUSTOMERS)
        zip_df = dc.load_zip_population(RAW_ZIP)
        cls.raw = raw
        cls.zip_df = zip_df
        cls.clean, cls.join_stats = _run_pipeline(raw, zip_df)

    def test_canonical_clean_output_has_no_issues(self):
        report, issues = dc.run_validation(self.raw, self.clean, self.join_stats)
        self.assertEqual(issues, [])
        self.assertTrue(all(report["checks"].values()))
        self.assertTrue(all(report["benchmarks"].values()))

    def test_duplicate_rows_flagged(self):
        tampered = pd.concat([self.clean, self.clean.iloc[[0]]], ignore_index=True)
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("grain") for i in issues))

    def test_schema_drift_flagged(self):
        tampered = self.clean.copy()
        tampered["Bogus_Column"] = 0
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("schema") for i in issues))

    def test_invalid_category_flagged(self):
        tampered = self.clean.copy()
        tampered.loc[0, "Contract"] = "Lifetime"
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("categories") for i in issues))

    def test_unexpected_null_flagged(self):
        tampered = self.clean.copy()
        tampered.loc[0, "Tenure in Months"] = pd.NA
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("nulls") for i in issues))

    def test_band_drift_flagged(self):
        tampered = self.clean.copy()
        tampered["Tenure_Band"] = tampered["Tenure_Band"].astype(object)
        tampered.loc[0, "Tenure_Band"] = "99-100 months"
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("bands") for i in issues))

    def test_benchmark_drift_flagged(self):
        tampered = self.clean.copy()
        idx = tampered.index[tampered["Customer Status"] == "Churned"][0]
        tampered.loc[idx, "Customer Status"] = "Stayed"
        _, issues = dc.run_validation(self.raw, tampered, self.join_stats)
        self.assertTrue(any(i.startswith("benchmark") for i in issues))


class BuildPipelineTests(unittest.TestCase):
    """End-to-end build behavior: canonical output, benchmarks, determinism, safety."""

    def test_build_produces_canonical_schema_and_benchmarks(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "customers_clean.csv"
            report = dc.build_clean_dataset(output_path=out)
            written = dc.read_clean_dataset(out)
            self.assertEqual(list(written.columns), list(dc.CANONICAL_SCHEMA))
            self.assertEqual(len(written), dc.EXPECTED_ROW_COUNT)
            self.assertEqual(written["Customer ID"].nunique(), len(written))
            self.assertTrue(all(report["checks"].values()))
            self.assertTrue(all(report["benchmarks"].values()))
            self.assertEqual(report["status"]["churn_rate_pct"], 28.37)
            self.assertEqual(report["status"]["retention_rate_pct"], 71.63)
            self.assertEqual(
                round(float(written.loc[written["Customer Status"] == "Churned", "Monthly Charge"].sum()), 2),
                137086.65,
            )

    def test_build_is_deterministic(self):
        with tempfile.TemporaryDirectory() as tmp:
            out_a = Path(tmp) / "a.csv"
            out_b = Path(tmp) / "b.csv"
            dc.build_clean_dataset(output_path=out_a)
            dc.build_clean_dataset(output_path=out_b)
            self.assertEqual(out_a.read_bytes(), out_b.read_bytes())

    def test_build_refuses_duplicate_grain_and_does_not_write(self):
        raw = pd.read_csv(RAW_CUSTOMERS)
        tampered = pd.concat([raw, raw.iloc[[0]]], ignore_index=True)
        with tempfile.TemporaryDirectory() as tmp:
            raw_path = Path(tmp) / "raw_dup.csv"
            out = Path(tmp) / "customers_clean.csv"
            tampered.to_csv(raw_path, index=False)
            with self.assertRaises(ValueError):
                dc.build_clean_dataset(output_path=out, raw_customers_path=raw_path)
            self.assertFalse(out.exists())

    def test_build_refuses_benchmark_break_and_does_not_write(self):
        raw = pd.read_csv(RAW_CUSTOMERS)
        tampered = raw.copy()
        idx = raw.index[raw["Customer Status"] == "Churned"][0]
        tampered.loc[idx, "Customer Status"] = "Stayed"
        with tempfile.TemporaryDirectory() as tmp:
            raw_path = Path(tmp) / "raw_bench.csv"
            out = Path(tmp) / "customers_clean.csv"
            tampered.to_csv(raw_path, index=False)
            with self.assertRaises(dc.CleaningValidationError):
                dc.build_clean_dataset(output_path=out, raw_customers_path=raw_path)
            self.assertFalse(out.exists())

    def test_build_round_trip_is_clean(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "customers_clean.csv"
            dc.build_clean_dataset(output_path=out)
            expected, _ = _run_pipeline(
                dc.load_raw_customers(RAW_CUSTOMERS), dc.load_zip_population(RAW_ZIP)
            )
            self.assertEqual(dc.validate_written_dataset(out, expected), [])


if __name__ == "__main__":
    unittest.main()
