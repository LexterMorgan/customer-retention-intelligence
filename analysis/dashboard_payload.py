#!/usr/bin/env python3
"""Build a deterministic JSON analytics payload for the future web dashboard.

Milestone 2 — analytics-to-dashboard data layer.

Source of truth (do not redefine):
  - docs/churn_definition.md
  - analysis/data_cleaning.py (BENCHMARKS, bands, read convention)
  - sql/01–11 (KPI, breakdown, risk, segment, scenario formulas)
  - tableau/validate_tableau_metrics.py (locked reconciliation values)

This module reads data/processed/customers_clean.csv, computes the dashboard
sections required by the existing Tableau/Excel specifications, validates
against canonical benchmarks, and writes a stable JSON artifact.

Usage (from repository root):
    python3 analysis/dashboard_payload.py
    python3 analysis/dashboard_payload.py --output data/processed/dashboard_payload.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT / "analysis") not in sys.path:
    sys.path.insert(0, str(ROOT / "analysis"))

import data_cleaning as dc  # noqa: E402

SOURCE_CSV = ROOT / "data" / "processed" / "customers_clean.csv"
DEFAULT_OUTPUT = ROOT / "data" / "processed" / "dashboard_payload.json"

SNAPSHOT_LABEL = "Q2 2022"
DEFINITIONS_REF = "docs/churn_definition.md"

CONTRACT_ORDER = ["Month-to-Month", "One Year", "Two Year"]
TENURE_ORDER = list(dc.TENURE_LABELS)
INTERNET_ORDER = ["Fiber Optic", "Cable", "DSL", "N/A"]
OFFER_ORDER = ["None", "Offer A", "Offer B", "Offer C", "Offer D", "Offer E"]
AGE_ORDER = list(dc.AGE_LABELS)
CHARGE_ORDER = list(dc.CHARGE_LABELS)
PAYMENT_ORDER = ["Bank Withdrawal", "Credit Card", "Mailed Check"]
RISK_TIER_ORDER = ["Very High", "High", "Medium", "Low"]

# Descriptive segments from sql/09_high_risk_segments.sql (overlapping).
SEGMENT_SPECS: list[tuple[str, str]] = [
    ("Early-Tenure Month-to-Month", "A. Early-Tenure Month-to-Month"),
    ("Month-to-Month Fiber Optic", "B. Month-to-Month Fiber Optic"),
    ("Month-to-Month No Dependents", "C. Month-to-Month No Dependents"),
    ("Stable Two-Year Customers", "D. Stable Two-Year Customers"),
    ("Long-Tenure Customer Base", "E. Long-Tenure Customer Base"),
    ("M2M + 0-6 months + Fiber Optic", "F. M2M + 0-6 months + Fiber Optic"),
]

# Locked payload benchmarks: data_cleaning.BENCHMARKS + Tableau/SQL extras.
PAYLOAD_BENCHMARKS: dict[str, Any] = {
    **dc.BENCHMARKS,
    "fiber_share_all_churn_pct": 66.1,
    "competitor_churned": 841,
    "competitor_pct_of_churned": 45.0,
    "high_risk_customers": 487,
    "high_risk_churned": 444,
    "high_risk_churn_rate_pct": 91.17,
    "scenario_retained": 44,
    "scenario_monthly_preserved": 3524.68,
    "scenario_annual_preserved": 42296.22,
    "risk_tier_very_high_customers": 2156,
    "risk_tier_very_high_churn_rate_pct": 66.51,
    "risk_tier_high_customers": 1259,
    "risk_tier_high_churn_rate_pct": 20.65,
    "risk_tier_medium_customers": 1714,
    "risk_tier_medium_churn_rate_pct": 7.29,
    "risk_tier_low_customers": 1460,
    "risk_tier_low_churn_rate_pct": 3.42,
}


class PayloadValidationError(ValueError):
    """Raised when the generated payload fails a locked benchmark check."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_clean(path: Path | None = None) -> pd.DataFrame:
    """Load the canonical cleaned dataset using the documented read convention."""
    csv_path = path or SOURCE_CSV
    if not csv_path.exists():
        raise FileNotFoundError(f"Canonical clean CSV not found: {csv_path}")
    return dc.read_clean_dataset(csv_path)


def existing_customers(df: pd.DataFrame) -> pd.DataFrame:
    """Churned + Stayed only — Joined excluded from rate denominators."""
    return df[df["Customer Status"].isin(["Churned", "Stayed"])].copy()


def churn_rate_pct(group: pd.DataFrame) -> float:
    """Canonical churn rate among an existing-customer subset, percent × 100."""
    n = len(group)
    if n == 0:
        return 0.0
    return round(float(group["Customer Status"].eq("Churned").mean() * 100), 2)


def retention_rate_pct(group: pd.DataFrame) -> float:
    n = len(group)
    if n == 0:
        return 0.0
    return round(float(group["Customer Status"].eq("Stayed").mean() * 100), 2)


def risk_points(row: pd.Series) -> int:
    """Rule-based descriptive risk points (sql/10_customer_risk_ranking.sql)."""
    pts = 0
    if row["Contract"] == "Month-to-Month":
        pts += 3
    if row["Tenure_Band"] == "0-6 months":
        pts += 3
    if row["Internet Type"] == "Fiber Optic":
        pts += 2
    if int(row["Number of Dependents"]) == 0:
        pts += 1
    if row["Married"] == "No":
        pts += 1
    return pts


def risk_tier(points: int) -> str:
    if points >= 6:
        return "Very High"
    if points >= 4:
        return "High"
    if points >= 2:
        return "Medium"
    return "Low"


def segment_mask(df: pd.DataFrame, name: str) -> pd.Series:
    """Boolean mask for overlapping descriptive segments (sql/09)."""
    masks = {
        "Early-Tenure Month-to-Month": (df["Contract"] == "Month-to-Month")
        & (df["Tenure_Band"] == "0-6 months"),
        "Month-to-Month Fiber Optic": (df["Contract"] == "Month-to-Month")
        & (df["Internet Type"] == "Fiber Optic"),
        "Month-to-Month No Dependents": (df["Contract"] == "Month-to-Month")
        & (df["Number of Dependents"] == 0),
        "Stable Two-Year Customers": (df["Contract"] == "Two Year")
        & (df["Tenure_Band"].isin(["37-48 months", "49-72 months"])),
        "Long-Tenure Customer Base": df["Tenure_Band"] == "49-72 months",
        "M2M + 0-6 months + Fiber Optic": (df["Contract"] == "Month-to-Month")
        & (df["Tenure_Band"] == "0-6 months")
        & (df["Internet Type"] == "Fiber Optic"),
    }
    return masks[name]


def _breakdown_row(
    category: str,
    group: pd.DataFrame,
    total_churned: int,
    *,
    include_avg_charge: bool = False,
) -> dict[str, Any]:
    churned = int(group["Customer Status"].eq("Churned").sum())
    retained = int(group["Customer Status"].eq("Stayed").sum())
    existing_n = len(group)
    row: dict[str, Any] = {
        "category": category,
        "existing_customers": existing_n,
        "churned_customers": churned,
        "retained_customers": retained,
        "churn_rate_pct": churn_rate_pct(group),
        "pct_of_total_churn": (
            round(churned / total_churned * 100, 2) if total_churned else 0.0
        ),
    }
    if include_avg_charge:
        row["avg_monthly_charge"] = (
            round(float(group["Monthly Charge"].mean()), 2) if existing_n else 0.0
        )
    return row


def _ordered_breakdown(
    existing: pd.DataFrame,
    column: str,
    order: list[str],
    total_churned: int,
    *,
    include_avg_charge: bool = False,
    exclude: set[str] | None = None,
) -> list[dict[str, Any]]:
    exclude = exclude or set()
    rows: list[dict[str, Any]] = []
    for category in order:
        if category in exclude:
            continue
        group = existing[existing[column] == category]
        rows.append(
            _breakdown_row(
                category,
                group,
                total_churned,
                include_avg_charge=include_avg_charge,
            )
        )
    return rows


def build_kpis(df: pd.DataFrame) -> dict[str, Any]:
    """Seven primary dashboard KPIs (Tableau BAN set) plus Joined context."""
    existing = existing_customers(df)
    churned = int(df["Customer Status"].eq("Churned").sum())
    retained = int(df["Customer Status"].eq("Stayed").sum())
    joined = int(df["Customer Status"].eq("Joined").sum())
    mrvl = round(float(df.loc[df["Customer Status"] == "Churned", "Monthly Charge"].sum()), 2)
    return {
        "total_customers": int(len(df)),
        "existing_customers": int(len(existing)),
        "churned_customers": churned,
        "retained_customers": retained,
        "joined_customers": joined,
        "churn_rate_pct": churn_rate_pct(existing),
        "retention_rate_pct": retention_rate_pct(existing),
        "mrvl": mrvl,
    }


def build_contract_breakdown(
    existing: pd.DataFrame, total_churned: int
) -> list[dict[str, Any]]:
    return _ordered_breakdown(existing, "Contract", CONTRACT_ORDER, total_churned)


def build_tenure_breakdown(
    existing: pd.DataFrame, total_churned: int
) -> list[dict[str, Any]]:
    return _ordered_breakdown(existing, "Tenure_Band", TENURE_ORDER, total_churned)


def build_internet_breakdown(
    existing: pd.DataFrame, total_churned: int
) -> list[dict[str, Any]]:
    # Full Internet Type domain including N/A; frontend may hide N/A for charts.
    return _ordered_breakdown(existing, "Internet Type", INTERNET_ORDER, total_churned)


def build_offer_breakdown(
    existing: pd.DataFrame, total_churned: int
) -> list[dict[str, Any]]:
    return _ordered_breakdown(existing, "Offer", OFFER_ORDER, total_churned)


def build_billing_breakdowns(
    existing: pd.DataFrame, total_churned: int
) -> dict[str, list[dict[str, Any]]]:
    payment = _ordered_breakdown(
        existing,
        "Payment Method",
        PAYMENT_ORDER,
        total_churned,
        include_avg_charge=True,
    )
    paperless = _ordered_breakdown(
        existing,
        "Paperless Billing",
        ["Yes", "No"],
        total_churned,
        include_avg_charge=True,
    )
    charge = _ordered_breakdown(
        existing,
        "Charge_Band",
        CHARGE_ORDER,
        total_churned,
        include_avg_charge=True,
    )
    return {
        "payment_method": payment,
        "paperless_billing": paperless,
        "charge_band": charge,
    }


def build_demographic_breakdowns(
    existing: pd.DataFrame, total_churned: int
) -> dict[str, list[dict[str, Any]]]:
    age = _ordered_breakdown(existing, "Age_Band", AGE_ORDER, total_churned)
    gender = _ordered_breakdown(existing, "Gender", ["Female", "Male"], total_churned)
    married = _ordered_breakdown(existing, "Married", ["Yes", "No"], total_churned)

    dependents_rows: list[dict[str, Any]] = []
    for label, mask in [
        ("Has Dependents", existing["Number of Dependents"] > 0),
        ("No Dependents", existing["Number of Dependents"] == 0),
    ]:
        dependents_rows.append(_breakdown_row(label, existing[mask], total_churned))

    return {
        "age_band": age,
        "gender": gender,
        "married": married,
        "dependents": dependents_rows,
    }


def build_churn_reasons(df: pd.DataFrame) -> dict[str, Any]:
    """Churned-only categories + top reasons with Pareto cumulative share."""
    churned = df[df["Customer Status"] == "Churned"]
    total = len(churned)
    if total == 0:
        return {"total_churned": 0, "categories": [], "reasons": [], "top_reasons": []}

    categories: list[dict[str, Any]] = []
    cat_counts = (
        churned["Churn Category"]
        .value_counts(dropna=False)
        .reindex(["Competitor", "Dissatisfaction", "Attitude", "Price", "Other"])
        .fillna(0)
        .astype(int)
    )
    for category, count in cat_counts.items():
        count_i = int(count)
        categories.append(
            {
                "category": str(category),
                "churner_count": count_i,
                "pct_of_churners": round(count_i / total * 100, 2),
            }
        )
    categories.sort(key=lambda r: (-r["churner_count"], r["category"]))

    reason_counts = churned["Churn Reason"].value_counts(dropna=True)
    reasons: list[dict[str, Any]] = []
    cumulative = 0
    for rank, (reason, count) in enumerate(reason_counts.items(), start=1):
        count_i = int(count)
        cumulative += count_i
        reasons.append(
            {
                "rank": rank,
                "reason": str(reason),
                "churner_count": count_i,
                "pct_of_churners": round(count_i / total * 100, 2),
                "cumulative_pct_of_churners": round(cumulative / total * 100, 2),
            }
        )

    return {
        "total_churned": total,
        "categories": categories,
        "reasons": reasons,
        "top_reasons": reasons[:10],
        "top_5_reasons": reasons[:5],
    }


def build_risk_tiers(existing: pd.DataFrame, total_churned: int) -> list[dict[str, Any]]:
    scored = existing.copy()
    scored["Risk_Points"] = scored.apply(risk_points, axis=1)
    scored["Descriptive_Churn_Risk_Tier"] = scored["Risk_Points"].map(risk_tier)

    rows: list[dict[str, Any]] = []
    for tier in RISK_TIER_ORDER:
        group = scored[scored["Descriptive_Churn_Risk_Tier"] == tier]
        rows.append(
            {
                "tier": tier,
                "existing_customers": int(len(group)),
                "churned_customers": int(group["Customer Status"].eq("Churned").sum()),
                "churn_rate_pct": churn_rate_pct(group),
                "pct_of_total_churn": (
                    round(
                        int(group["Customer Status"].eq("Churned").sum())
                        / total_churned
                        * 100,
                        2,
                    )
                    if total_churned
                    else 0.0
                ),
                "avg_risk_points": (
                    round(float(group["Risk_Points"].mean()), 2) if len(group) else 0.0
                ),
            }
        )
    return rows


def build_segments(existing: pd.DataFrame, total_churned: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for short_name, sql_label in SEGMENT_SPECS:
        group = existing[segment_mask(existing, short_name)]
        churned = int(group["Customer Status"].eq("Churned").sum())
        rows.append(
            {
                "segment": short_name,
                "sql_label": sql_label,
                "existing_customers": int(len(group)),
                "churned_customers": churned,
                "churn_rate_pct": churn_rate_pct(group),
                "pct_of_total_churn": (
                    round(churned / total_churned * 100, 2) if total_churned else 0.0
                ),
            }
        )
    # Stable order: descending churn rate, then name.
    rows.sort(key=lambda r: (-r["churn_rate_pct"], r["segment"]))
    return rows


def build_scenario(existing: pd.DataFrame) -> dict[str, Any]:
    """Hypothetical 10% retention in M2M + 0–6 mo + Fiber (sql/11).

    Illustrative only — not a forecast or causal estimate.
    Annual uses SQL rounding: ROUND(sum * 0.10 * 12, 2).
    """
    high_risk_churned = existing[
        segment_mask(existing, "M2M + 0-6 months + Fiber Optic")
        & existing["Customer Status"].eq("Churned")
    ]
    churned_in_segment = int(len(high_risk_churned))
    segment_monthly_lost = round(float(high_risk_churned["Monthly Charge"].sum()), 2)
    retained = int(round(churned_in_segment * 0.10, 0))
    monthly_preserved = round(segment_monthly_lost * 0.10, 2)
    # Match SQL: ROUND(SUM * 0.10 * 12, 2) — not round(monthly_preserved * 12, 2).
    annual_preserved = round(float(high_risk_churned["Monthly Charge"].sum()) * 0.10 * 12, 2)
    return {
        "name": "Retain 10% of churned in M2M + 0-6 months + Fiber Optic",
        "illustrative_only": True,
        "segment": "M2M + 0-6 months + Fiber Optic",
        "churned_in_segment": churned_in_segment,
        "segment_monthly_lost": segment_monthly_lost,
        "retention_assumption_pct": 10.0,
        "scenario_retained_customers": retained,
        "scenario_monthly_preserved": monthly_preserved,
        "scenario_annual_preserved": annual_preserved,
    }


def build_mrvl_detail(df: pd.DataFrame) -> dict[str, Any]:
    churned = df[df["Customer Status"] == "Churned"]
    return {
        "mrvl": round(float(churned["Monthly Charge"].sum()), 2),
        "churned_customers": int(len(churned)),
        "avg_monthly_charge_churned": (
            round(float(churned["Monthly Charge"].mean()), 2) if len(churned) else 0.0
        ),
        "definition": "SUM(Monthly Charge) WHERE Customer Status = 'Churned'",
    }


def build_filter_dimensions(df: pd.DataFrame) -> dict[str, list[str]]:
    """Value lists for dashboard slicers (Excel + Tableau filter specs)."""
    return {
        "contract": list(CONTRACT_ORDER),
        "tenure_band": list(TENURE_ORDER),
        "internet_type": list(INTERNET_ORDER),
        "offer": list(OFFER_ORDER),
        "payment_method": list(PAYMENT_ORDER),
        "age_band": list(AGE_ORDER),
        "charge_band": list(CHARGE_ORDER),
        "descriptive_churn_risk_tier": list(RISK_TIER_ORDER),
        "customer_status": ["Churned", "Stayed", "Joined"],
    }


def build_contract_tenure_matrix(existing: pd.DataFrame) -> list[dict[str, Any]]:
    """Contract × Tenure heatmap cells used by Excel/Tableau concentration views."""
    cells: list[dict[str, Any]] = []
    for tenure in TENURE_ORDER:
        for contract in CONTRACT_ORDER:
            group = existing[
                (existing["Tenure_Band"] == tenure) & (existing["Contract"] == contract)
            ]
            cells.append(
                {
                    "tenure_band": tenure,
                    "contract": contract,
                    "existing_customers": int(len(group)),
                    "churned_customers": int(group["Customer Status"].eq("Churned").sum()),
                    "churn_rate_pct": churn_rate_pct(group),
                }
            )
    return cells


def _relative_source(source_path: Path) -> str:
    try:
        return source_path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return source_path.as_posix()


def build_payload(df: pd.DataFrame, *, source_path: Path, source_sha256: str) -> dict[str, Any]:
    existing = existing_customers(df)
    total_churned = int(existing["Customer Status"].eq("Churned").sum())
    kpis = build_kpis(df)

    payload: dict[str, Any] = {
        "metadata": {
            "source": _relative_source(source_path),
            "source_sha256": source_sha256,
            "snapshot": SNAPSHOT_LABEL,
            "row_count": int(len(df)),
            "column_count": int(len(df.columns)),
            "joined_excluded_from_rates": True,
            "definitions_ref": DEFINITIONS_REF,
            "generated_by": "analysis/dashboard_payload.py",
            "analysis_notes": (
                "Descriptive/associational analysis only. Risk tiers are rule-based "
                "segments, not predictive probabilities. Scenario values are "
                "illustrative what-ifs, not forecasts."
            ),
        },
        "kpis": {
            # Seven primary Tableau BAN KPIs
            "total_customers": kpis["total_customers"],
            "existing_customers": kpis["existing_customers"],
            "churned_customers": kpis["churned_customers"],
            "retained_customers": kpis["retained_customers"],
            "churn_rate_pct": kpis["churn_rate_pct"],
            "retention_rate_pct": kpis["retention_rate_pct"],
            "mrvl": kpis["mrvl"],
            # Supporting context used across Excel/Tableau headers
            "joined_customers": kpis["joined_customers"],
        },
        "by_contract": build_contract_breakdown(existing, total_churned),
        "by_tenure": build_tenure_breakdown(existing, total_churned),
        "by_internet": build_internet_breakdown(existing, total_churned),
        "by_offer": build_offer_breakdown(existing, total_churned),
        "by_billing": build_billing_breakdowns(existing, total_churned),
        "by_demographics": build_demographic_breakdowns(existing, total_churned),
        "churn_reasons": build_churn_reasons(df),
        "risk_tiers": build_risk_tiers(existing, total_churned),
        "segments": build_segments(existing, total_churned),
        "contract_tenure_matrix": build_contract_tenure_matrix(existing),
        "mrvl": build_mrvl_detail(df),
        "scenario": build_scenario(existing),
        "filter_dimensions": build_filter_dimensions(df),
    }
    return payload


def validate_payload(payload: dict[str, Any]) -> None:
    """Fail hard if any locked benchmark drifts before writing JSON."""
    issues: list[str] = []
    kpis = payload["kpis"]
    expected = PAYLOAD_BENCHMARKS

    def check(label: str, actual: Any, exp: Any, tol: float = 0.01) -> None:
        if isinstance(exp, float):
            ok = abs(float(actual) - exp) <= tol
        else:
            ok = actual == exp
        if not ok:
            issues.append(f"{label}: got {actual}, expected {exp}")

    check("total_customers", kpis["total_customers"], expected["total_customers"], 0)
    check("existing_customers", kpis["existing_customers"], expected["existing_customers"], 0)
    check("churned_customers", kpis["churned_customers"], expected["churned_customers"], 0)
    check("retained_customers", kpis["retained_customers"], expected["retained_customers"], 0)
    check("joined_customers", kpis["joined_customers"], expected["joined_customers"], 0)
    check("churn_rate_pct", kpis["churn_rate_pct"], expected["churn_rate_pct"])
    check("retention_rate_pct", kpis["retention_rate_pct"], expected["retention_rate_pct"])
    check("mrvl", kpis["mrvl"], expected["monthly_recurring_value_lost"])

    # Contract / tenure / fiber benchmarks from data_cleaning.BENCHMARKS
    m2m = next(r for r in payload["by_contract"] if r["category"] == "Month-to-Month")
    check("m2m_existing", m2m["existing_customers"], expected["m2m_existing"], 0)
    check("m2m_churned", m2m["churned_customers"], expected["m2m_churned"], 0)
    check("m2m_churn_rate_pct", m2m["churn_rate_pct"], expected["m2m_churn_rate_pct"])

    early = next(r for r in payload["by_tenure"] if r["category"] == "0-6 months")
    check("tenure_0_6_existing", early["existing_customers"], expected["tenure_0_6_existing"], 0)
    check("tenure_0_6_churned", early["churned_customers"], expected["tenure_0_6_churned"], 0)
    check("tenure_0_6_churn_rate_pct", early["churn_rate_pct"], expected["tenure_0_6_churn_rate_pct"])

    fiber = next(r for r in payload["by_internet"] if r["category"] == "Fiber Optic")
    check("fiber_existing", fiber["existing_customers"], expected["fiber_existing"], 0)
    check("fiber_churned", fiber["churned_customers"], expected["fiber_churned"], 0)
    check("fiber_churn_rate_pct", fiber["churn_rate_pct"], expected["fiber_churn_rate_pct"])
    if kpis["churned_customers"]:
        check(
            "fiber_share_all_churn_pct",
            round(fiber["churned_customers"] / kpis["churned_customers"] * 100, 1),
            expected["fiber_share_all_churn_pct"],
        )
    else:
        issues.append("fiber_share_all_churn_pct: churned_customers is 0")

    competitor = next(
        r for r in payload["churn_reasons"]["categories"] if r["category"] == "Competitor"
    )
    check("competitor_churned", competitor["churner_count"], expected["competitor_churned"], 0)
    check(
        "competitor_pct_of_churned",
        competitor["pct_of_churners"],
        expected["competitor_pct_of_churned"],
        tol=0.05,
    )

    high_risk = next(
        r for r in payload["segments"] if r["segment"] == "M2M + 0-6 months + Fiber Optic"
    )
    check("high_risk_customers", high_risk["existing_customers"], expected["high_risk_customers"], 0)
    check("high_risk_churned", high_risk["churned_customers"], expected["high_risk_churned"], 0)
    check(
        "high_risk_churn_rate_pct",
        high_risk["churn_rate_pct"],
        expected["high_risk_churn_rate_pct"],
    )

    for tier, n_key, rate_key in [
        ("Very High", "risk_tier_very_high_customers", "risk_tier_very_high_churn_rate_pct"),
        ("High", "risk_tier_high_customers", "risk_tier_high_churn_rate_pct"),
        ("Medium", "risk_tier_medium_customers", "risk_tier_medium_churn_rate_pct"),
        ("Low", "risk_tier_low_customers", "risk_tier_low_churn_rate_pct"),
    ]:
        row = next(r for r in payload["risk_tiers"] if r["tier"] == tier)
        check(f"risk_tier_{tier}_customers", row["existing_customers"], expected[n_key], 0)
        check(f"risk_tier_{tier}_churn_rate_pct", row["churn_rate_pct"], expected[rate_key])

    scenario = payload["scenario"]
    check(
        "scenario_retained",
        scenario["scenario_retained_customers"],
        expected["scenario_retained"],
        0,
    )
    check(
        "scenario_monthly_preserved",
        scenario["scenario_monthly_preserved"],
        expected["scenario_monthly_preserved"],
    )
    check(
        "scenario_annual_preserved",
        scenario["scenario_annual_preserved"],
        expected["scenario_annual_preserved"],
    )

    # Structural requirements for the future dashboard.
    required_top = {
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
    missing = required_top - set(payload.keys())
    if missing:
        issues.append(f"missing top-level keys: {sorted(missing)}")

    required_kpi_keys = {
        "total_customers",
        "existing_customers",
        "churned_customers",
        "retained_customers",
        "churn_rate_pct",
        "retention_rate_pct",
        "mrvl",
    }
    missing_kpi = required_kpi_keys - set(kpis.keys())
    if missing_kpi:
        issues.append(f"missing kpi keys: {sorted(missing_kpi)}")

    if issues:
        raise PayloadValidationError(
            "Dashboard payload failed benchmark/structure validation:\n  - "
            + "\n  - ".join(issues)
        )


def dumps_payload(payload: dict[str, Any]) -> str:
    """Canonical JSON serialization for deterministic artifacts."""
    return json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def write_payload(payload: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    text = dumps_payload(payload)
    # Explicit UTF-8 + LF for cross-platform deterministic bytes (Py3.9-safe).
    with output_path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def build_and_validate(
    source_path: Path | None = None,
    output_path: Path | None = None,
    *,
    write: bool = True,
) -> dict[str, Any]:
    csv_path = source_path or SOURCE_CSV
    out_path = output_path or DEFAULT_OUTPUT
    source_hash = sha256_file(csv_path)
    df = load_clean(csv_path)
    payload = build_payload(df, source_path=csv_path, source_sha256=source_hash)
    validate_payload(payload)
    if write:
        write_payload(payload, out_path)
        # Re-read to prove the written artifact round-trips identically.
        reloaded = json.loads(out_path.read_text(encoding="utf-8"))
        if dumps_payload(reloaded) != dumps_payload(payload):
            raise PayloadValidationError("Written JSON is not deterministic/round-trip stable")
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=SOURCE_CSV,
        help=f"Canonical clean CSV (default: {SOURCE_CSV})",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"JSON output path (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build and validate without writing the JSON file",
    )
    args = parser.parse_args(argv)

    try:
        payload = build_and_validate(
            source_path=args.source.resolve(),
            output_path=args.output.resolve(),
            write=not args.dry_run,
        )
    except (FileNotFoundError, PayloadValidationError) as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 1

    kpis = payload["kpis"]
    print("=== DASHBOARD PAYLOAD ===")
    print(f"[PASS] Source: {args.source}")
    print(f"[PASS] Total Customers: {kpis['total_customers']:,}")
    print(f"[PASS] Existing Customers: {kpis['existing_customers']:,}")
    print(f"[PASS] Churned: {kpis['churned_customers']:,}")
    print(f"[PASS] Retained: {kpis['retained_customers']:,}")
    print(f"[PASS] Churn Rate: {kpis['churn_rate_pct']:.2f}%")
    print(f"[PASS] Retention Rate: {kpis['retention_rate_pct']:.2f}%")
    print(f"[PASS] MRVL: ${kpis['mrvl']:,.2f}")
    print(f"[PASS] Segments: {len(payload['segments'])}")
    print(f"[PASS] Risk tiers: {len(payload['risk_tiers'])}")
    if args.dry_run:
        print("[PASS] Dry run — JSON not written")
    else:
        print(f"[PASS] Wrote: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
