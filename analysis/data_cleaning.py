"""
Customer Churn & Retention Analytics — Data Cleaning Pipeline (Phase 2)

Reads immutable raw telecom files and produces one customer-level analytics dataset.

Run from project root:
    python analysis/data_cleaning.py
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import os
import sys
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"

CUSTOMERS_RAW = RAW_DIR / "telecom_customer_churn.csv"
ZIP_POP_RAW = RAW_DIR / "telecom_zipcode_population.csv"
OUTPUT_PATH = PROCESSED_DIR / "customers_clean.csv"

CUSTOMER_ID_COL = "Customer ID"

# Internet add-on columns used to calculate Add_On_Count (Internet Service = Yes only)
INTERNET_ADDON_COLS = [
    "Online Security",
    "Online Backup",
    "Device Protection Plan",
    "Premium Tech Support",
    "Streaming TV",
    "Streaming Movies",
    "Streaming Music",
    "Unlimited Data",
]

# Columns that are not applicable when Internet Service = No
INTERNET_DEPENDENT_COLS = [
    "Internet Type",
    "Avg Monthly GB Download",
    *INTERNET_ADDON_COLS,
]

# Columns that are not applicable when Phone Service = No
PHONE_DEPENDENT_COLS = [
    "Avg Monthly Long Distance Charges",
    "Multiple Lines",
]

# ---------------------------------------------------------------------------
# Band definitions (justified from raw distribution inspection)
# ---------------------------------------------------------------------------
#
# Tenure_Band — max tenure is 72 months; early tenure shows highest churn.
#   0-6:   onboarding / highest-risk window
#   7-12:  remainder of first year
#   13-24: second year
#   25-36: third year
#   37-48: fourth year
#   49-72: long-term customers (4+ years)
TENURE_BANDS = [0, 7, 13, 25, 37, 49, 73]
TENURE_LABELS = ["0-6 months", "7-12 months", "13-24 months", "25-36 months", "37-48 months", "49-72 months"]

# Age_Band — standard decade bands; churn rises in older groups in Phase 1 audit.
AGE_BANDS = [0, 30, 40, 50, 60, 70, 100]
AGE_LABELS = ["Under 30", "30-39", "40-49", "50-59", "60-69", "70+"]

# Charge_Band — separates credits, low-phone-only bills, and common price tiers.
CHARGE_BANDS = [-float("inf"), 0, 30, 50, 70, 90, float("inf")]
CHARGE_LABELS = ["Credit (<$0)", "Low (<$30)", "$30-49", "$50-69", "$70-89", "$90+"]

# ---------------------------------------------------------------------------
# Canonical output contract (locked; do not change without an explicit decision)
# ---------------------------------------------------------------------------
# The 46-column canonical schema in exact output order (38 raw columns in source
# order + 8 derived columns). Downstream SQL, Tableau, Excel, and EDA scripts
# assume this schema; the pipeline rejects any drift.
CANONICAL_SCHEMA = (
    "Customer ID", "Gender", "Age", "Married", "Number of Dependents", "City",
    "Zip Code", "Latitude", "Longitude", "Number of Referrals",
    "Tenure in Months", "Offer", "Phone Service",
    "Avg Monthly Long Distance Charges", "Multiple Lines", "Internet Service",
    "Internet Type", "Avg Monthly GB Download", "Online Security",
    "Online Backup", "Device Protection Plan", "Premium Tech Support",
    "Streaming TV", "Streaming Movies", "Streaming Music", "Unlimited Data",
    "Contract", "Paperless Billing", "Payment Method", "Monthly Charge",
    "Total Charges", "Total Refunds", "Total Extra Data Charges",
    "Total Long Distance Charges", "Total Revenue", "Customer Status",
    "Churn Category", "Churn Reason", "Is_Churned", "Is_Retained",
    "Flag_Negative_Monthly_Charge", "Tenure_Band", "Age_Band", "Charge_Band",
    "Add_On_Count", "Zip_Population",
)

DERIVED_COLUMNS = (
    "Is_Churned", "Is_Retained", "Flag_Negative_Monthly_Charge",
    "Tenure_Band", "Age_Band", "Charge_Band", "Add_On_Count", "Zip_Population",
)

EXPECTED_RAW_COLUMN_COUNT = 38
EXPECTED_COLUMN_COUNT = 46
EXPECTED_ROW_COUNT = 7_043

# Documented Phase 2 benchmark values (see docs/churn_definition.md and
# docs/dataset_audit.md). These are the cross-tool reconciliation contract.
BENCHMARKS = {
    "total_customers": 7_043,
    "existing_customers": 6_589,
    "churned_customers": 1_869,
    "retained_customers": 4_720,
    "joined_customers": 454,
    "churn_rate_pct": 28.37,
    "retention_rate_pct": 71.63,
    "monthly_recurring_value_lost": 137_086.65,
    "offer_none_count": 3_877,
    "negative_charge_flagged": 120,
    "m2m_existing": 3_202,
    "m2m_churned": 1_655,
    "m2m_churn_rate_pct": 51.69,
    "tenure_0_6_existing": 1_016,
    "tenure_0_6_churned": 784,
    "tenure_0_6_churn_rate_pct": 77.17,
    "fiber_existing": 2_934,
    "fiber_churned": 1_236,
    "fiber_churn_rate_pct": 42.13,
}

# Columns that must contain zero null values after cleaning. The only allowed
# null columns are Churn Category / Churn Reason (non-churned customers) and
# Add_On_Count (customers without internet).
NON_NULL_COLUMNS = frozenset(CANONICAL_SCHEMA) - {
    "Churn Category", "Churn Reason", "Add_On_Count",
}

# Exact categorical domains the cleaning layer is allowed to emit.
CATEGORICAL_ALLOWED_VALUES: dict[str, set[str]] = {
    "Gender": {"Female", "Male"},
    "Married": {"Yes", "No"},
    "Phone Service": {"Yes", "No"},
    "Multiple Lines": {"Yes", "No", "N/A"},
    "Internet Service": {"Yes", "No"},
    "Internet Type": {"DSL", "Cable", "Fiber Optic", "N/A"},
    "Contract": {"Month-to-Month", "One Year", "Two Year"},
    "Paperless Billing": {"Yes", "No"},
    "Payment Method": {"Bank Withdrawal", "Credit Card", "Mailed Check"},
    "Customer Status": {"Churned", "Stayed", "Joined"},
    "Offer": {"None", "Offer A", "Offer B", "Offer C", "Offer D", "Offer E"},
    "Churn Category": {"Competitor", "Dissatisfaction", "Attitude", "Price", "Other"},
    "Tenure_Band": set(TENURE_LABELS),
    "Age_Band": set(AGE_LABELS),
    "Charge_Band": set(CHARGE_LABELS),
}
for _addon in INTERNET_ADDON_COLS:
    CATEGORICAL_ALLOWED_VALUES[_addon] = {"Yes", "No", "N/A"}


class CleaningValidationError(ValueError):
    """Raised when the cleaning pipeline fails any validation contract."""


def sha256_file(path: Path) -> str:
    """Stable SHA-256 fingerprint of a produced artifact (for reproducibility)."""
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_customer_grain(df: pd.DataFrame, label: str) -> None:
    """Ensure one row per customer before/after transformations."""
    row_count = len(df)
    unique_ids = df[CUSTOMER_ID_COL].nunique()
    duplicate_ids = df[CUSTOMER_ID_COL].duplicated().sum()

    if row_count != unique_ids:
        raise ValueError(
            f"{label}: customer grain broken — {row_count} rows but {unique_ids} unique Customer IDs "
            f"({duplicate_ids} duplicates)."
        )


def load_raw_customers(path: Path | None = None) -> pd.DataFrame:
    df = pd.read_csv(Path(path) if path is not None else CUSTOMERS_RAW)
    validate_customer_grain(df, "Raw customers")
    return df


def load_zip_population(path: Path | None = None) -> pd.DataFrame:
    zip_df = pd.read_csv(Path(path) if path is not None else ZIP_POP_RAW)
    zip_df["Zip Code"] = zip_df["Zip Code"].astype(str).str.strip()

    duplicate_zips = zip_df["Zip Code"].duplicated().sum()
    if duplicate_zips > 0:
        raise ValueError(
            f"Zip population lookup has {duplicate_zips} duplicate Zip Code values; "
            "join aborted to protect one-row-per-customer grain."
        )

    return zip_df


def strip_string_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Remove accidental leading/trailing whitespace from text fields."""
    out = df.copy()
    for col in out.select_dtypes(include="object").columns:
        out[col] = out[col].apply(lambda x: x.strip() if isinstance(x, str) else x)
    return out


def standardize_categories(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply Phase 1 category decisions:
    - Offer NULL -> 'None'
    - Internet/phone dependent fields NULL -> 'N/A' when service not subscribed
    """
    out = df.copy()

    # Offer: NaN means no marketing offer accepted (per data dictionary)
    out["Offer"] = out["Offer"].fillna("None")

    # Mixed numeric/text fields must be object dtype before assigning 'N/A'
    mixed_type_cols = ["Avg Monthly GB Download", *PHONE_DEPENDENT_COLS]
    for col in mixed_type_cols:
        out[col] = out[col].astype("object")

    # Internet-dependent fields are structurally missing when customer has no internet
    no_internet = out["Internet Service"] == "No"
    for col in INTERNET_DEPENDENT_COLS:
        out.loc[no_internet, col] = "N/A"

    internet_yes = out["Internet Service"] == "Yes"
    for col in INTERNET_ADDON_COLS:
        out.loc[internet_yes, col] = out.loc[internet_yes, col].fillna("No")

    out.loc[internet_yes, "Internet Type"] = out.loc[internet_yes, "Internet Type"].fillna("Unknown")

    # Phone-dependent fields are structurally missing when customer has no phone service
    no_phone = out["Phone Service"] == "No"
    for col in PHONE_DEPENDENT_COLS:
        out.loc[no_phone, col] = "N/A"

    phone_yes = out["Phone Service"] == "Yes"
    out.loc[phone_yes, "Multiple Lines"] = out.loc[phone_yes, "Multiple Lines"].fillna("No")

    return out


def preserve_zip_code_as_text(df: pd.DataFrame) -> pd.DataFrame:
    """Store Zip Code as 5-character text for stable joins and reporting."""
    out = df.copy()
    out["Zip Code"] = out["Zip Code"].astype(int).astype(str).str.zfill(5)
    return out


def create_churn_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Canonical churn/retention flags aligned with Customer Status."""
    out = df.copy()
    out["Is_Churned"] = (out["Customer Status"] == "Churned").astype(int)
    out["Is_Retained"] = (out["Customer Status"] == "Stayed").astype(int)
    return out


def create_quality_flags(df: pd.DataFrame) -> pd.DataFrame:
    """Flag suspicious values for transparency; do not remove or silently correct."""
    out = df.copy()
    out["Flag_Negative_Monthly_Charge"] = (out["Monthly Charge"] < 0).astype(int)
    return out


def create_analytical_bands(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out["Tenure_Band"] = pd.cut(
        out["Tenure in Months"],
        bins=TENURE_BANDS,
        labels=TENURE_LABELS,
        right=False,
        include_lowest=True,
    )

    out["Age_Band"] = pd.cut(
        out["Age"],
        bins=AGE_BANDS,
        labels=AGE_LABELS,
        right=False,
        include_lowest=True,
    )

    out["Charge_Band"] = pd.cut(
        out["Monthly Charge"],
        bins=CHARGE_BANDS,
        labels=CHARGE_LABELS,
        right=False,
    )

    return out


def create_add_on_count(df: pd.DataFrame) -> pd.DataFrame:
    """
    Count internet add-ons where Internet Service = Yes.
    Each add-on column contributes 1 when value is 'Yes', 0 when 'No'.
    Customers without internet receive a missing Add_On_Count (not applicable).
    """
    out = df.copy()

    def count_addons(row: pd.Series) -> float:
        if row["Internet Service"] != "Yes":
            return pd.NA
        return sum(1 for col in INTERNET_ADDON_COLS if row[col] == "Yes")

    out["Add_On_Count"] = out.apply(count_addons, axis=1)
    # Use nullable integer type for cleaner downstream analysis
    out["Add_On_Count"] = out["Add_On_Count"].astype("Int64")
    return out


def join_zip_population(customers: pd.DataFrame, zip_df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Left join population lookup; abort if customer grain would change."""
    before_rows = len(customers)
    before_unique = customers[CUSTOMER_ID_COL].nunique()

    merged = customers.merge(
        zip_df.rename(columns={"Population": "Zip_Population"}),
        on="Zip Code",
        how="left",
        validate="many_to_one",
    )

    after_rows = len(merged)
    after_unique = merged[CUSTOMER_ID_COL].nunique()

    if before_rows != after_rows or before_unique != after_unique:
        raise ValueError(
            "Zip population join changed customer grain: "
            f"rows {before_rows}->{after_rows}, unique IDs {before_unique}->{after_unique}"
        )

    unmatched = merged["Zip_Population"].isna().sum()
    join_stats = {
        "matched_rows": before_rows - unmatched,
        "unmatched_rows": unmatched,
        "unmatched_pct": round(unmatched / before_rows * 100, 2) if before_rows else 0.0,
    }

    return merged, join_stats


def validate_schema(clean_df: pd.DataFrame, raw_df: pd.DataFrame, issues: list[str]) -> None:
    """Lock the canonical 46-column schema (names, order, derived column set)."""
    if len(clean_df.columns) != EXPECTED_COLUMN_COUNT:
        issues.append(
            f"schema: expected {EXPECTED_COLUMN_COUNT} columns, found {len(clean_df.columns)}"
        )
    if list(clean_df.columns) != list(CANONICAL_SCHEMA):
        issues.append("schema: column names/order do not match CANONICAL_SCHEMA")
        return
    raw_header = list(raw_df.columns)
    if raw_header != list(CANONICAL_SCHEMA[:EXPECTED_RAW_COLUMN_COUNT]):
        issues.append("schema: raw header does not match the first 38 canonical columns")
    derived_actual = list(clean_df.columns)[EXPECTED_RAW_COLUMN_COUNT:]
    if derived_actual != list(DERIVED_COLUMNS):
        issues.append(f"schema: derived columns unexpected: {derived_actual}")


def validate_categories(clean_df: pd.DataFrame, issues: list[str]) -> None:
    """Reject any categorical value outside the documented domain."""
    for col, allowed in CATEGORICAL_ALLOWED_VALUES.items():
        present = set(clean_df[col].dropna().unique().tolist())
        unexpected = present - allowed
        if unexpected:
            issues.append(f"categories: {col} contains unexpected values {sorted(unexpected)}")


def validate_null_policy(clean_df: pd.DataFrame, issues: list[str]) -> None:
    """Enforce the documented null structure (only the 3 structural null columns)."""
    churned = int((clean_df["Customer Status"] == "Churned").sum())
    no_internet = int((clean_df["Internet Service"] == "No").sum())

    for col in sorted(NON_NULL_COLUMNS):
        n = int(clean_df[col].isna().sum())
        if n:
            issues.append(f"nulls: {col} expected zero nulls, found {n}")

    expected_exit_nulls = len(clean_df) - churned
    for col in ("Churn Category", "Churn Reason"):
        n = int(clean_df[col].isna().sum())
        if n != expected_exit_nulls:
            issues.append(f"nulls: {col} expected {expected_exit_nulls} nulls (non-churned), found {n}")

    addon_nulls = int(clean_df["Add_On_Count"].isna().sum())
    if addon_nulls != no_internet:
        issues.append(
            f"nulls: Add_On_Count expected {no_internet} nulls (no internet), found {addon_nulls}"
        )


def validate_band_integrity(clean_df: pd.DataFrame, issues: list[str]) -> None:
    """Confirm stored bands still match the locked boundaries recomputed from source."""
    checks = [
        ("Tenure_Band", "Tenure in Months", TENURE_BANDS, TENURE_LABELS, True),
        ("Age_Band", "Age", AGE_BANDS, AGE_LABELS, True),
        ("Charge_Band", "Monthly Charge", CHARGE_BANDS, CHARGE_LABELS, False),
    ]
    for band_col, src_col, bins, labels, include_lowest in checks:
        recomputed = pd.cut(
            clean_df[src_col],
            bins=bins,
            labels=labels,
            right=False,
            include_lowest=include_lowest,
        ).astype(str)
        stored = clean_df[band_col].astype(str)
        mismatches = int((recomputed != stored).sum())
        if mismatches:
            issues.append(
                f"bands: {band_col} disagrees with recomputed boundaries ({mismatches} rows)"
            )


def validate_benchmarks(clean_df: pd.DataFrame, issues: list[str]) -> dict[str, bool]:
    """Enforce the documented Phase 2 churn/retention benchmark contract."""
    total = len(clean_df)
    churned = int((clean_df["Customer Status"] == "Churned").sum())
    stayed = int((clean_df["Customer Status"] == "Stayed").sum())
    joined = int((clean_df["Customer Status"] == "Joined").sum())
    existing = churned + stayed
    churn_rate_pct = round(churned / existing * 100, 2) if existing else 0.0
    retention_rate_pct = round(stayed / existing * 100, 2) if existing else 0.0
    mrvl = round(
        float(clean_df.loc[clean_df["Customer Status"] == "Churned", "Monthly Charge"].sum()), 2
    )
    offer_none = int((clean_df["Offer"] == "None").sum())
    neg_flagged = int(clean_df["Flag_Negative_Monthly_Charge"].sum())

    expected = BENCHMARKS
    results: dict[str, bool] = {}

    def check(label: str, actual, exp, tol: float = 0.0) -> bool:
        ok = actual == exp if tol == 0.0 else abs(actual - exp) <= tol
        if not ok:
            issues.append(f"benchmark: {label} expected {exp}, got {actual}")
        return ok

    results["total_customers"] = check("total_customers", total, expected["total_customers"])
    results["existing_customers"] = check("existing_customers", existing, expected["existing_customers"])
    results["churned_customers"] = check("churned_customers", churned, expected["churned_customers"])
    results["retained_customers"] = check("retained_customers", stayed, expected["retained_customers"])
    results["joined_customers"] = check("joined_customers", joined, expected["joined_customers"])
    results["churn_rate_pct"] = check(
        "churn_rate_pct", churn_rate_pct, expected["churn_rate_pct"], 0.01
    )
    results["retention_rate_pct"] = check(
        "retention_rate_pct", retention_rate_pct, expected["retention_rate_pct"], 0.01
    )
    results["monthly_recurring_value_lost"] = check(
        "monthly_recurring_value_lost", mrvl, expected["monthly_recurring_value_lost"], 0.01
    )
    results["offer_none_count"] = check("offer_none_count", offer_none, expected["offer_none_count"])
    results["negative_charge_flagged"] = check(
        "negative_charge_flagged", neg_flagged, expected["negative_charge_flagged"]
    )

    existing_df = clean_df[clean_df["Customer Status"].isin(["Churned", "Stayed"])]

    m2m = existing_df[existing_df["Contract"] == "Month-to-Month"]
    results["m2m_existing"] = check("m2m_existing", len(m2m), expected["m2m_existing"])
    results["m2m_churned"] = check(
        "m2m_churned", int(m2m["Is_Churned"].sum()), expected["m2m_churned"]
    )
    results["m2m_churn_rate_pct"] = check(
        "m2m_churn_rate_pct",
        round(m2m["Is_Churned"].mean() * 100, 2),
        expected["m2m_churn_rate_pct"],
        0.01,
    )

    early = existing_df[existing_df["Tenure_Band"] == "0-6 months"]
    results["tenure_0_6_existing"] = check("tenure_0_6_existing", len(early), expected["tenure_0_6_existing"])
    results["tenure_0_6_churned"] = check(
        "tenure_0_6_churned", int(early["Is_Churned"].sum()), expected["tenure_0_6_churned"]
    )
    results["tenure_0_6_churn_rate_pct"] = check(
        "tenure_0_6_churn_rate_pct",
        round(early["Is_Churned"].mean() * 100, 2),
        expected["tenure_0_6_churn_rate_pct"],
        0.01,
    )

    fiber = existing_df[existing_df["Internet Type"] == "Fiber Optic"]
    results["fiber_existing"] = check("fiber_existing", len(fiber), expected["fiber_existing"])
    results["fiber_churned"] = check(
        "fiber_churned", int(fiber["Is_Churned"].sum()), expected["fiber_churned"]
    )
    results["fiber_churn_rate_pct"] = check(
        "fiber_churn_rate_pct",
        round(fiber["Is_Churned"].mean() * 100, 2),
        expected["fiber_churn_rate_pct"],
        0.01,
    )

    return results


def run_validation(raw_df: pd.DataFrame, clean_df: pd.DataFrame, join_stats: dict) -> tuple[dict, list[str]]:
    """Post-cleaning validation.

    Returns (report, issues). An empty issues list means every contract passed;
    any non-empty issues list must prevent the canonical file from being written.
    """
    issues: list[str] = []

    if clean_df[CUSTOMER_ID_COL].nunique() != len(clean_df):
        issues.append("grain: duplicate Customer IDs in cleaned data")

    validate_schema(clean_df, raw_df, issues)
    validate_categories(clean_df, issues)
    validate_null_policy(clean_df, issues)
    validate_band_integrity(clean_df, issues)
    benchmark_results = validate_benchmarks(clean_df, issues)

    existing = clean_df[clean_df["Customer Status"].isin(["Churned", "Stayed"])]
    churned = (existing["Customer Status"] == "Churned").sum()
    stayed = (existing["Customer Status"] == "Stayed").sum()
    churn_rate = churned / (churned + stayed) * 100
    retention_rate = stayed / (churned + stayed) * 100

    numeric_checks = {}
    for col in ["Tenure in Months", "Age", "Monthly Charge", "Total Charges", "Total Revenue"]:
        numeric_checks[col] = {
            "min": float(clean_df[col].min()),
            "max": float(clean_df[col].max()),
            "nulls": int(clean_df[col].isna().sum()),
        }

    missing_after = clean_df.isna().sum()
    missing_cols = missing_after[missing_after > 0].to_dict()

    report = {
        "raw": {
            "row_count": len(raw_df),
            "unique_customer_ids": raw_df[CUSTOMER_ID_COL].nunique(),
            "duplicate_customer_ids": int(raw_df[CUSTOMER_ID_COL].duplicated().sum()),
        },
        "processed": {
            "row_count": len(clean_df),
            "unique_customer_ids": clean_df[CUSTOMER_ID_COL].nunique(),
            "duplicate_customer_ids": int(clean_df[CUSTOMER_ID_COL].duplicated().sum()),
            "total_columns": len(clean_df.columns),
        },
        "status": {
            "churned": int((clean_df["Customer Status"] == "Churned").sum()),
            "stayed": int((clean_df["Customer Status"] == "Stayed").sum()),
            "joined": int((clean_df["Customer Status"] == "Joined").sum()),
            "churn_rate_pct": round(churn_rate, 2),
            "retention_rate_pct": round(retention_rate, 2),
        },
        "quality": {
            "missing_values_by_column": missing_cols,
            "flagged_negative_monthly_charge": int(clean_df["Flag_Negative_Monthly_Charge"].sum()),
            "geographic_join": join_stats,
            "records_removed": 0,
            "records_removed_reason": "None — all raw customer rows preserved",
            "values_modified": [
                "Offer NULL recoded to 'None'",
                "Internet/phone dependent nulls recoded to 'N/A' where service not subscribed",
                "Internet add-on nulls recoded to 'No' for internet customers",
                "Zip Code converted to 5-digit text",
                "Whitespace stripped from text fields",
            ],
            "grain_preserved": len(raw_df) == len(clean_df) == clean_df[CUSTOMER_ID_COL].nunique(),
        },
        "numeric_sanity": numeric_checks,
        "checks": {
            "grain": not any(i.startswith("grain") for i in issues),
            "schema": not any(i.startswith("schema") for i in issues),
            "categories": not any(i.startswith("categories") for i in issues),
            "nulls": not any(i.startswith("nulls") for i in issues),
            "band_integrity": not any(i.startswith("bands") for i in issues),
            "benchmarks": all(benchmark_results.values()),
        },
        "benchmarks": benchmark_results,
        "issues": issues,
    }
    return report, issues


def print_validation_report(report: dict) -> None:
    print("\n" + "=" * 60)
    print("PHASE 2 VALIDATION REPORT")
    print("=" * 60)

    print("\nRAW DATA")
    for k, v in report["raw"].items():
        print(f"  {k}: {v:,}" if isinstance(v, int) else f"  {k}: {v}")

    print("\nPROCESSED DATA")
    for k, v in report["processed"].items():
        print(f"  {k}: {v:,}" if isinstance(v, int) else f"  {k}: {v}")

    print("\nSTATUS")
    for k, v in report["status"].items():
        print(f"  {k}: {v}")

    print("\nQUALITY")
    q = report["quality"]
    print(f"  records_removed: {q['records_removed']} ({q['records_removed_reason']})")
    print(f"  flagged_negative_monthly_charge: {q['flagged_negative_monthly_charge']}")
    print(f"  geographic_join_matched: {q['geographic_join']['matched_rows']:,}")
    print(f"  geographic_join_unmatched: {q['geographic_join']['unmatched_rows']:,} "
          f"({q['geographic_join']['unmatched_pct']}%)")
    print(f"  grain_preserved: {q['grain_preserved']}")
    print("  values_modified:")
    for item in q["values_modified"]:
        print(f"    - {item}")

    if q["missing_values_by_column"]:
        print("  remaining_null_columns:")
        for col, count in q["missing_values_by_column"].items():
            print(f"    - {col}: {count}")
    else:
        print("  remaining_null_columns: none")

    print("\nNUMERIC SANITY CHECKS")
    for col, stats in report["numeric_sanity"].items():
        print(f"  {col}: min={stats['min']}, max={stats['max']}, nulls={stats['nulls']}")

    print("\nVALIDATION CHECKS")
    for name, ok in report.get("checks", {}).items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")

    print("\nBENCHMARKS")
    for label, ok in report.get("benchmarks", {}).items():
        print(f"  [{'PASS' if ok else 'FAIL'}] {label}")

    if report.get("issues"):
        print("\nISSUES")
        for issue in report["issues"]:
            print(f"  - {issue}")


def read_clean_dataset(path: Path) -> pd.DataFrame:
    """Read a cleaned CSV using the documented canonical read convention."""
    return pd.read_csv(path, keep_default_na=False, na_values=[""])


def frames_round_trip_equal(expected: pd.DataFrame, written: pd.DataFrame) -> list[str]:
    """Compare every canonical column after CSV serialization.

    Add_On_Count is compared with its structural NA filled so the pandas
    <NA> (in-memory) and NaN (post-read) representations are treated the same.
    """
    mismatched: list[str] = []
    for col in CANONICAL_SCHEMA:
        if col == "Add_On_Count":
            a = [("__NA__" if pd.isna(v) else float(v)) for v in expected[col].tolist()]
            b = [("__NA__" if pd.isna(v) else float(v)) for v in written[col].tolist()]
        else:
            a = expected[col].astype(str).tolist()
            b = written[col].astype(str).tolist()
        if a != b:
            mismatched.append(col)
    return mismatched


def validate_written_dataset(path: Path, expected: pd.DataFrame) -> list[str]:
    """Confirm the file on disk round-trips to the in-memory result."""
    issues: list[str] = []
    written = read_clean_dataset(path)
    if len(written) != len(expected):
        issues.append(f"round-trip: expected {len(expected)} rows, read {len(written)}")
    if list(written.columns) != list(CANONICAL_SCHEMA):
        issues.append("round-trip: written schema does not match CANONICAL_SCHEMA")
    if written[CUSTOMER_ID_COL].nunique() != len(written) or bool(
        written[CUSTOMER_ID_COL].duplicated().any()
    ):
        issues.append("round-trip: customer grain broken in written file")
    mismatched = frames_round_trip_equal(expected, written)
    if mismatched:
        issues.append(f"round-trip: value mismatch in columns: {mismatched}")
    return issues


def write_clean_dataset(df: pd.DataFrame, output_path: Path) -> None:
    """Write the cleaned dataset atomically (no partial/truncated canonical file)."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = output_path.with_name(f"{output_path.name}.tmp")
    try:
        df.to_csv(
            tmp_path,
            index=False,
            quoting=csv.QUOTE_NONNUMERIC,
            lineterminator="\n",
            encoding="utf-8",
        )
        os.replace(tmp_path, output_path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def build_clean_dataset(
    output_path: Path | None = None,
    raw_customers_path: Path | None = None,
    zip_population_path: Path | None = None,
) -> dict:
    """Run the full cleaning pipeline and produce the canonical processed dataset.

    Validation order guarantees a bad run can never replace the canonical
    artifact: every contract is checked on the in-memory frame before writing,
    the write is atomic, and the written file is read back and re-verified.

    Raises CleaningValidationError on any failure.
    """
    out_path = Path(output_path) if output_path is not None else OUTPUT_PATH

    raw_df = load_raw_customers(raw_customers_path)
    zip_df = load_zip_population(zip_population_path)

    df = raw_df.copy()
    validate_customer_grain(df, "Start")

    df = strip_string_columns(df)
    df = standardize_categories(df)
    df = preserve_zip_code_as_text(df)
    df = create_churn_flags(df)
    df = create_quality_flags(df)
    df = create_analytical_bands(df)
    df = create_add_on_count(df)

    validate_customer_grain(df, "Before zip join")

    df, join_stats = join_zip_population(df, zip_df)
    validate_customer_grain(df, "After zip join")

    report, issues = run_validation(raw_df, df, join_stats)
    if issues:
        raise CleaningValidationError("Cleaning validation failed:\n- " + "\n- ".join(issues))

    write_clean_dataset(df, out_path)

    round_trip_issues = validate_written_dataset(out_path, df)
    if round_trip_issues:
        try:
            out_path.unlink()
        except FileNotFoundError:
            pass
        raise CleaningValidationError(
            "Written dataset failed round-trip validation:\n- "
            + "\n- ".join(round_trip_issues)
        )

    report["output"] = {
        "path": str(out_path),
        "sha256": sha256_file(out_path),
        "round_trip": "PASS",
    }
    return report


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build the canonical processed dataset from immutable raw files."
    )
    parser.add_argument(
        "--output",
        default=str(OUTPUT_PATH),
        help=f"Destination CSV (default: {OUTPUT_PATH})",
    )
    args = parser.parse_args()

    try:
        report = build_clean_dataset(Path(args.output))
    except ValueError as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        return 1

    print_validation_report(report)
    print(f"\nClean dataset written to: {report['output']['path']}")
    print(f"Output SHA-256: {report['output']['sha256']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
