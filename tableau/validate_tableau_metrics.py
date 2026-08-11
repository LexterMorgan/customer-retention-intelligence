#!/usr/bin/env python3
"""Validate Tableau calculated-field logic against Phase 4/5 benchmarks."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CSV = ROOT / "data/processed/customers_clean.csv"

BENCHMARKS = {
    "total_customers": 7043,
    "existing_customers": 6589,
    "churned": 1869,
    "retained": 4720,
    "joined": 454,
    "churn_rate_pct": 28.37,
    "retention_rate_pct": 71.63,
    "mrvl": 137086.65,
    "fiber_share_all_churn_pct": 66.1,
    "competitor_churned": 841,
    "competitor_pct_of_churned": 45.0,
    "high_risk_customers": 487,
    "high_risk_churned": 444,
    "high_risk_churn_rate_pct": 91.17,
    "scenario_retained": 44,
    "scenario_monthly_preserved": 3524.68,
    "scenario_annual_preserved": 42296.22,
}


def load() -> pd.DataFrame:
    return pd.read_csv(CSV, keep_default_na=False, na_values=[""])


def existing(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["Customer Status"].isin(["Churned", "Stayed"])].copy()


def churn_rate(group: pd.DataFrame) -> float:
    n = len(group)
    if n == 0:
        return 0.0
    return round(group["Customer Status"].eq("Churned").mean() * 100, 2)


def risk_points(row: pd.Series) -> int:
    pts = 0
    if row["Contract"] == "Month-to-Month":
        pts += 3
    if row["Tenure_Band"] == "0-6 months":
        pts += 3
    if row["Internet Type"] == "Fiber Optic":
        pts += 2
    if row["Number of Dependents"] == 0:
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
    masks = {
        "Early-Tenure Month-to-Month": (df["Contract"] == "Month-to-Month")
        & (df["Tenure_Band"] == "0-6 months"),
        "Month-to-Month Fiber Optic": (df["Contract"] == "Month-to-Month")
        & (df["Internet Type"] == "Fiber Optic"),
        "M2M + 0-6 mo + Fiber": (df["Contract"] == "Month-to-Month")
        & (df["Tenure_Band"] == "0-6 months")
        & (df["Internet Type"] == "Fiber Optic"),
        "Stable Two-Year": (df["Contract"] == "Two Year")
        & (df["Tenure_Band"].isin(["37-48 months", "49-72 months"])),
        "M2M No Dependents": (df["Contract"] == "Month-to-Month")
        & (df["Number of Dependents"] == 0),
    }
    return masks[name]


def check(label: str, actual, expected, tol: float = 0.01) -> bool:
    if isinstance(expected, float):
        ok = abs(float(actual) - expected) <= tol
    else:
        ok = actual == expected
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {label}: {actual} (expected {expected})")
    return ok


def main() -> int:
    df = load()
    ex = existing(df)
    churned_all = df[df["Customer Status"] == "Churned"]
    total_churned = len(churned_all)

    print("=== Core KPIs ===")
    results = [
        check("Total Customers", len(df), BENCHMARKS["total_customers"]),
        check("Existing Customers", len(ex), BENCHMARKS["existing_customers"]),
        check("Churned", int(ex["Customer Status"].eq("Churned").sum()), BENCHMARKS["churned"]),
        check("Retained", int(ex["Customer Status"].eq("Stayed").sum()), BENCHMARKS["retained"]),
        check("Joined", int(df["Customer Status"].eq("Joined").sum()), BENCHMARKS["joined"]),
        check("Churn Rate %", churn_rate(ex), BENCHMARKS["churn_rate_pct"]),
        check("Retention Rate %", round(100 - churn_rate(ex), 2), BENCHMARKS["retention_rate_pct"]),
        check("MRVL", round(churned_all["Monthly Charge"].sum(), 2), BENCHMARKS["mrvl"]),
    ]

    print("\n=== Dashboard 1 Slices ===")
    for contract in ["Month-to-Month", "One Year", "Two Year"]:
        g = ex[ex["Contract"] == contract]
        print(f"  Contract {contract}: n={len(g)}, churned={g['Customer Status'].eq('Churned').sum()}, rate={churn_rate(g)}%")

    tenure_order = [
        "0-6 months", "7-12 months", "13-24 months",
        "25-36 months", "37-48 months", "49-72 months",
    ]
    for band in tenure_order:
        g = ex[ex["Tenure_Band"] == band]
        c = int(g["Customer Status"].eq("Churned").sum())
        print(f"  Tenure {band}: n={len(g)}, churned={c}, rate={churn_rate(g)}%")

    inet = ex[ex["Internet Type"] != "N/A"]
    for itype in ["Fiber Optic", "Cable", "DSL"]:
        g = inet[inet["Internet Type"] == itype]
        c = int(g["Customer Status"].eq("Churned").sum())
        share = round(c / total_churned * 100, 1)
        print(f"  Internet {itype}: n={len(g)}, churned={c}, rate={churn_rate(g)}%, share_all={share}%")

    fiber_churned = int(inet[inet["Internet Type"] == "Fiber Optic"]["Customer Status"].eq("Churned").sum())
    results.append(check("Fiber share of all churn %", round(fiber_churned / total_churned * 100, 1), BENCHMARKS["fiber_share_all_churn_pct"]))

    print("\n=== Dashboard 2 ===")
    hr = ex[segment_mask(ex, "M2M + 0-6 mo + Fiber")]
    hr_churned = int(hr["Customer Status"].eq("Churned").sum())
    results.extend([
        check("High-Risk Intersection customers", len(hr), BENCHMARKS["high_risk_customers"]),
        check("High-Risk Intersection churned", hr_churned, BENCHMARKS["high_risk_churned"]),
        check("High-Risk Intersection churn rate %", churn_rate(hr), BENCHMARKS["high_risk_churn_rate_pct"]),
    ])

    comp = churned_all[churned_all["Churn Category"] == "Competitor"]
    results.extend([
        check("Competitor churned", len(comp), BENCHMARKS["competitor_churned"]),
        check("Competitor % of churned", round(len(comp) / total_churned * 100, 1), BENCHMARKS["competitor_pct_of_churned"]),
    ])

    print("  Priority Segments:")
    for seg in [
        "Early-Tenure Month-to-Month",
        "Month-to-Month Fiber Optic",
        "M2M + 0-6 mo + Fiber",
        "Stable Two-Year",
    ]:
        g = ex[segment_mask(ex, seg)]
        c = int(g["Customer Status"].eq("Churned").sum())
        print(f"    {seg}: n={len(g)}, churned={c}, rate={churn_rate(g)}%, share={round(c/total_churned*100,2)}%")

    print("\n=== Dashboard 3 Risk Tiers ===")
    ex = ex.copy()
    ex["Risk Points"] = ex.apply(risk_points, axis=1)
    ex["Risk Tier"] = ex["Risk Points"].map(risk_tier)
    tier_order = ["Very High", "High", "Medium", "Low"]
    expected_tiers = {
        "Very High": (2156, 66.51),
        "High": (1259, 20.65),
        "Medium": (1714, 7.29),
        "Low": (1460, 3.42),
    }
    for tier in tier_order:
        g = ex[ex["Risk Tier"] == tier]
        exp_n, exp_rate = expected_tiers[tier]
        results.append(check(f"Tier {tier} customers", len(g), exp_n))
        results.append(check(f"Tier {tier} churn rate %", churn_rate(g), exp_rate))

    print("\n=== Hypothetical Scenario ===")
    scenario = hr[hr["Customer Status"] == "Churned"]
    monthly_lost = scenario["Monthly Charge"].sum()
    retained = round(len(scenario) * 0.10)
    monthly_preserved = round(monthly_lost * 0.10, 2)
    annual_preserved = round(monthly_preserved * 12, 2)
    results.extend([
        check("Scenario retained customers", retained, BENCHMARKS["scenario_retained"]),
        check("Scenario monthly preserved", monthly_preserved, BENCHMARKS["scenario_monthly_preserved"]),
        check("Scenario annual preserved", annual_preserved, BENCHMARKS["scenario_annual_preserved"]),
    ])

    print("\n=== Dashboard 3 Segment Volume (top by churned count) ===")
    seg_volumes = []
    for name in [
        "Early-Tenure Month-to-Month",
        "Month-to-Month Fiber Optic",
        "M2M No Dependents",
        "M2M + 0-6 mo + Fiber",
        "Stable Two-Year",
    ]:
        g = ex[segment_mask(ex, name)]
        c = int(g["Customer Status"].eq("Churned").sum())
        seg_volumes.append((name, c))
    for name, c in sorted(seg_volumes, key=lambda x: -x[1]):
        print(f"  {name}: {c} churned")

    failed = sum(1 for r in results if not r)
    print(f"\n{'ALL PASS' if failed == 0 else f'{failed} FAILURES'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
