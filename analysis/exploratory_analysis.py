"""
Customer Churn & Retention Analytics — Exploratory Data Analysis (Phase 3)

Loads the cleaned customer dataset, validates canonical metrics, performs
descriptive/diagnostic analysis, and saves analytical charts.

Run from project root:
    python analysis/exploratory_analysis.py
"""

from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "processed" / "customers_clean.csv"
OUTPUT_DIR = PROJECT_ROOT / "analysis" / "outputs"

CUSTOMER_ID_COL = "Customer ID"
EXISTING_STATUSES = ["Churned", "Stayed"]
GEO_MIN_CUSTOMERS = 20  # minimum existing customers to rank a city

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

# Phase 2 expected baseline (must reconcile)
EXPECTED_CHURN_RATE = 28.37
EXPECTED_RETENTION_RATE = 71.63


def load_data() -> pd.DataFrame:
    """Load cleaned data; preserve literal 'None' as a valid Offer category."""
    return pd.read_csv(DATA_PATH, keep_default_na=False, na_values=[""])


def existing_customers(df: pd.DataFrame) -> pd.DataFrame:
    """Existing customer base for churn/retention analysis (excludes Joined)."""
    return df[df["Customer Status"].isin(EXISTING_STATUSES)].copy()


def churn_rate(churned: int, total_existing: int) -> float:
    if total_existing == 0:
        return 0.0
    return churned / total_existing * 100


def segment_summary(group: pd.DataFrame, label_col: str) -> pd.DataFrame:
    """Standard churn summary by category for existing customers."""
    base = existing_customers(group)
    total_churned = (base["Customer Status"] == "Churned").sum()

    summary = (
        base.groupby(label_col, observed=True)
        .agg(
            existing_customers=(CUSTOMER_ID_COL, "count"),
            churned=("Is_Churned", "sum"),
            retained=("Is_Retained", "sum"),
        )
        .reset_index()
    )
    summary["churn_rate_pct"] = (
        summary["churned"] / summary["existing_customers"] * 100
    ).round(2)
    summary["pct_of_all_churn"] = (
        summary["churned"] / total_churned * 100
    ).round(2)
    return summary.sort_values("churn_rate_pct", ascending=False)


def validate_base(df: pd.DataFrame) -> dict:
    """Confirm Phase 3 metrics reconcile with Phase 2 canonical definitions."""
    existing = existing_customers(df)
    churned = (existing["Customer Status"] == "Churned").sum()
    stayed = (existing["Customer Status"] == "Stayed").sum()
    joined = (df["Customer Status"] == "Joined").sum()

    calc_churn = churn_rate(churned, len(existing))
    calc_retention = stayed / len(existing) * 100

    if abs(calc_churn - EXPECTED_CHURN_RATE) > 0.01:
        raise ValueError(
            f"Churn rate mismatch: calculated {calc_churn:.2f}% vs expected {EXPECTED_CHURN_RATE}%"
        )

    metrics = {
        "total_customers": len(df),
        "unique_customer_ids": df[CUSTOMER_ID_COL].nunique(),
        "existing_customers": len(existing),
        "churned": int(churned),
        "stayed": int(stayed),
        "joined": int(joined),
        "churn_rate_pct": round(calc_churn, 2),
        "retention_rate_pct": round(calc_retention, 2),
        "status_distribution": df["Customer Status"].value_counts().to_dict(),
    }
    return metrics


def analyze_value_differences(df: pd.DataFrame) -> pd.DataFrame:
    """Compare churned vs retained on value fields (association, not causation)."""
    existing = existing_customers(df)
    rows = []
    for col in ["Monthly Charge", "Total Charges", "Total Revenue", "Tenure in Months"]:
        for status in ["Churned", "Stayed"]:
            subset = existing[existing["Customer Status"] == status][col]
            rows.append(
                {
                    "metric": col,
                    "status": status,
                    "count": len(subset),
                    "mean": round(subset.mean(), 2),
                    "median": round(subset.median(), 2),
                }
            )
    return pd.DataFrame(rows)


def analyze_offer_e_context(df: pd.DataFrame) -> pd.DataFrame:
    """Investigate Offer E anomaly by contract, tenure, and internet type."""
    base = existing_customers(df)
    rows = []
    for segment, mask in [
        ("All Offer E", base["Offer"] == "Offer E"),
        ("Offer E + Month-to-Month", (base["Offer"] == "Offer E") & (base["Contract"] == "Month-to-Month")),
        ("Offer E + 0-6 months", (base["Offer"] == "Offer E") & (base["Tenure_Band"] == "0-6 months")),
        ("Offer E + Month-to-Month + 0-6 months",
         (base["Offer"] == "Offer E") & (base["Contract"] == "Month-to-Month") & (base["Tenure_Band"] == "0-6 months")),
        ("Offer E + Fiber Optic", (base["Offer"] == "Offer E") & (base["Internet Type"] == "Fiber Optic")),
        ("All non-Offer E", base["Offer"] != "Offer E"),
    ]:
        subset = base[mask]
        if len(subset) == 0:
            continue
        rows.append(
            {
                "segment": segment,
                "existing_customers": len(subset),
                "churned": int(subset["Is_Churned"].sum()),
                "churn_rate_pct": round(subset["Is_Churned"].mean() * 100, 2),
            }
        )
    return pd.DataFrame(rows)


def analyze_internet_addons(df: pd.DataFrame) -> pd.DataFrame:
    """Churn by individual add-on among internet customers only."""
    internet = existing_customers(df[df["Internet Service"] == "Yes"])
    rows = []
    for col in INTERNET_ADDON_COLS:
        for value in ["Yes", "No"]:
            subset = internet[internet[col] == value]
            if len(subset) == 0:
                continue
            rows.append(
                {
                    "add_on": col,
                    "value": value,
                    "existing_customers": len(subset),
                    "churned": int(subset["Is_Churned"].sum()),
                    "churn_rate_pct": round(subset["Is_Churned"].mean() * 100, 2),
                }
            )
    return pd.DataFrame(rows)


def analyze_geography(df: pd.DataFrame) -> pd.DataFrame:
    """City-level churn with minimum sample-size filter."""
    base = existing_customers(df)
    city = (
        base.groupby("City")
        .agg(
            existing_customers=(CUSTOMER_ID_COL, "count"),
            churned=("Is_Churned", "sum"),
        )
        .reset_index()
    )
    city["churn_rate_pct"] = (city["churned"] / city["existing_customers"] * 100).round(2)
    city["meets_min_sample"] = city["existing_customers"] >= GEO_MIN_CUSTOMERS
    return city.sort_values("churn_rate_pct", ascending=False)


def analyze_interactions(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Multivariate combinations supported by Phase 1–2 findings."""
    base = existing_customers(df)
    total_churned = base["Is_Churned"].sum()
    combos = {
        "contract_x_tenure": ["Contract", "Tenure_Band"],
        "contract_x_internet": ["Contract", "Internet Type"],
        "contract_x_offer": ["Contract", "Offer"],
        "tenure_x_internet": ["Tenure_Band", "Internet Type"],
        "contract_tenure_internet": ["Contract", "Tenure_Band", "Internet Type"],
    }

    results = {}
    for name, cols in combos.items():
        # Skip rows where internet type is N/A for internet-related combos
        subset = base.copy()
        if "Internet Type" in cols:
            subset = subset[subset["Internet Type"] != "N/A"]

        summary = (
            subset.groupby(cols, observed=True)
            .agg(
                segment_size=(CUSTOMER_ID_COL, "count"),
                churned=("Is_Churned", "sum"),
            )
            .reset_index()
        )
        summary["churn_rate_pct"] = (
            summary["churned"] / summary["segment_size"] * 100
        ).round(2)
        summary["pct_of_all_churn"] = (
            summary["churned"] / total_churned * 100
        ).round(2)
        results[name] = summary.sort_values("churn_rate_pct", ascending=False)
    return results


def define_customer_segments(df: pd.DataFrame) -> pd.DataFrame:
    """Evidence-based retention segments (descriptive, not predictive scores)."""
    base = existing_customers(df)
    total_churned = base["Is_Churned"].sum()

    segment_rules = [
        (
            "Early-Tenure Month-to-Month",
            (base["Contract"] == "Month-to-Month") & (base["Tenure_Band"] == "0-6 months"),
        ),
        (
            "Month-to-Month Fiber Optic",
            (base["Contract"] == "Month-to-Month") & (base["Internet Type"] == "Fiber Optic"),
        ),
        (
            "Month-to-Month No Dependents",
            (base["Contract"] == "Month-to-Month") & (base["Number of Dependents"] == 0),
        ),
        (
            "Stable Two-Year Customers",
            (base["Contract"] == "Two Year") & (base["Tenure_Band"].isin(["37-48 months", "49-72 months"])),
        ),
        (
            "Long-Tenure Retained Base",
            base["Tenure_Band"] == "49-72 months",
        ),
        (
            "Competitor-Attributed Churners",
            base["Churn Category"] == "Competitor",
        ),
    ]

    rows = []
    for name, mask in segment_rules:
        if name == "Competitor-Attributed Churners":
            subset = df[df["Churn Category"] == "Competitor"]
            churned = len(subset)
            churn_rate_pct = np.nan
        else:
            subset = base.loc[mask]
            churned = int(subset["Is_Churned"].sum())
            churn_rate_pct = round(subset["Is_Churned"].mean() * 100, 2)

        rows.append(
            {
                "segment": name,
                "customer_count": len(subset),
                "churned_count": churned,
                "churn_rate_pct": churn_rate_pct,
                "pct_of_all_churn": round(churned / total_churned * 100, 2),
            }
        )
    return pd.DataFrame(rows)


def save_bar_chart(
    summary: pd.DataFrame,
    x_col: str,
    y_col: str,
    title: str,
    filename: str,
    color: str = "#4472C4",
    rotate: int = 0,
) -> None:
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.bar(summary[x_col].astype(str), summary[y_col], color=color)
    ax.set_title(title, fontsize=13, fontweight="bold")
    ax.set_ylabel(y_col.replace("_", " ").title())
    ax.set_xlabel(x_col.replace("_", " ").title())
    plt.xticks(rotation=rotate, ha="right")
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close(fig)


def save_churn_volume_chart(summary: pd.DataFrame, x_col: str, title: str, filename: str) -> None:
    fig, ax1 = plt.subplots(figsize=(10, 5))
    x_labels = summary[x_col].astype(str)

    ax1.bar(x_labels, summary["churned"], color="#C00000", alpha=0.75, label="Churned Count")
    ax1.set_ylabel("Churned Customers")
    ax1.set_xlabel(x_col.replace("_", " ").title())

    ax2 = ax1.twinx()
    ax2.plot(x_labels, summary["churn_rate_pct"], color="#333333", marker="o", label="Churn Rate %")
    ax2.set_ylabel("Churn Rate (%)")

    ax1.set_title(title, fontsize=13, fontweight="bold")
    plt.xticks(rotation=30, ha="right")
    fig.tight_layout()
    fig.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close(fig)


def save_monthly_charge_distribution(df: pd.DataFrame) -> None:
    existing = existing_customers(df)
    fig, ax = plt.subplots(figsize=(10, 5))
    for status, color in [("Stayed", "#4472C4"), ("Churned", "#C00000")]:
        subset = existing[existing["Customer Status"] == status]["Monthly Charge"]
        ax.hist(subset, bins=30, alpha=0.55, label=status, color=color)
    ax.set_title("Monthly Charge Distribution: Churned vs Retained", fontsize=13, fontweight="bold")
    ax.set_xlabel("Monthly Charge ($)")
    ax.set_ylabel("Customer Count")
    ax.legend()
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / "monthly_charge_distribution.png", dpi=150)
    plt.close(fig)


def save_heatmap(interaction_df: pd.DataFrame, title: str, filename: str) -> None:
    pivot = interaction_df.pivot_table(
        index="Tenure_Band",
        columns="Contract",
        values="churn_rate_pct",
        observed=True,
    )
    tenure_order = [
        "0-6 months", "7-12 months", "13-24 months",
        "25-36 months", "37-48 months", "49-72 months",
    ]
    pivot = pivot.reindex([t for t in tenure_order if t in pivot.index])

    fig, ax = plt.subplots(figsize=(8, 5))
    im = ax.imshow(pivot.values, aspect="auto", cmap="Reds")
    ax.set_xticks(range(len(pivot.columns)))
    ax.set_xticklabels(pivot.columns, rotation=20, ha="right")
    ax.set_yticks(range(len(pivot.index)))
    ax.set_yticklabels(pivot.index)
    ax.set_title(title, fontsize=13, fontweight="bold")

    for i in range(len(pivot.index)):
        for j in range(len(pivot.columns)):
            val = pivot.values[i, j]
            if not np.isnan(val):
                ax.text(j, i, f"{val:.1f}%", ha="center", va="center", color="black", fontsize=9)

    fig.colorbar(im, ax=ax, label="Churn Rate (%)")
    plt.tight_layout()
    fig.savefig(OUTPUT_DIR / filename, dpi=150)
    plt.close(fig)


def print_section(title: str) -> None:
    print(f"\n{'=' * 60}\n{title}\n{'=' * 60}")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df = load_data()

    # ------------------------------------------------------------------
    # 1. Validation
    # ------------------------------------------------------------------
    print_section("PHASE 3 — BASE VALIDATION")
    metrics = validate_base(df)
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    print("  Reconciliation with Phase 2: OK")

    existing = existing_customers(df)
    baseline_churn_rate = metrics["churn_rate_pct"]

    # ------------------------------------------------------------------
    # 2. Value differences
    # ------------------------------------------------------------------
    print_section("CUSTOMER VALUE COMPARISON (Churned vs Stayed)")
    value_df = analyze_value_differences(df)
    print(value_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 3. Contract
    # ------------------------------------------------------------------
    print_section("CONTRACT ANALYSIS")
    contract_df = segment_summary(df, "Contract")
    print(contract_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 4. Tenure
    # ------------------------------------------------------------------
    print_section("TENURE BAND ANALYSIS")
    tenure_order = [
        "0-6 months", "7-12 months", "13-24 months",
        "25-36 months", "37-48 months", "49-72 months",
    ]
    tenure_df = segment_summary(df, "Tenure_Band")
    tenure_df["Tenure_Band"] = pd.Categorical(tenure_df["Tenure_Band"], categories=tenure_order, ordered=True)
    tenure_df = tenure_df.sort_values("Tenure_Band")
    print(tenure_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 5. Internet & add-ons
    # ------------------------------------------------------------------
    print_section("INTERNET TYPE ANALYSIS")
    internet_df = segment_summary(df[df["Internet Type"] != "N/A"], "Internet Type")
    print(internet_df.to_string(index=False))

    print_section("ADD-ON COUNT ANALYSIS (Internet customers)")
    addon_count_df = segment_summary(df[df["Add_On_Count"].notna()], "Add_On_Count")
    print(addon_count_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 6. Offer
    # ------------------------------------------------------------------
    print_section("OFFER ANALYSIS")
    offer_df = segment_summary(df, "Offer")
    print(offer_df.to_string(index=False))

    print_section("OFFER E CONTEXT CHECK")
    offer_e_df = analyze_offer_e_context(df)
    print(offer_e_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 7. Churn reasons
    # ------------------------------------------------------------------
    print_section("CHURN CATEGORY (Churned customers only)")
    churned = df[df["Customer Status"] == "Churned"]
    cat_counts = churned["Churn Category"].value_counts().reset_index()
    cat_counts.columns = ["Churn Category", "count"]
    cat_counts["pct_of_churned"] = (cat_counts["count"] / len(churned) * 100).round(2)
    print(cat_counts.to_string(index=False))

    print_section("TOP CHURN REASONS (Churned customers only)")
    reason_counts = churned["Churn Reason"].value_counts().head(10).reset_index()
    reason_counts.columns = ["Churn Reason", "count"]
    reason_counts["pct_of_churned"] = (reason_counts["count"] / len(churned) * 100).round(2)
    print(reason_counts.to_string(index=False))

    # ------------------------------------------------------------------
    # 8. Billing & payment
    # ------------------------------------------------------------------
    print_section("PAYMENT METHOD ANALYSIS")
    payment_df = segment_summary(df, "Payment Method")
    print(payment_df.to_string(index=False))

    print_section("PAPERLESS BILLING ANALYSIS")
    paperless_df = segment_summary(df, "Paperless Billing")
    print(paperless_df.to_string(index=False))

    print_section("CHARGE BAND ANALYSIS")
    charge_df = segment_summary(df, "Charge_Band")
    print(charge_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 9. Demographics
    # ------------------------------------------------------------------
    print_section("DEMOGRAPHIC ANALYSIS")
    for col in ["Age_Band", "Gender", "Married"]:
        print(f"\n--- {col} ---")
        print(segment_summary(df, col).to_string(index=False))

    print("\n--- Has Dependents ---")
    demo = existing.copy()
    demo["Has_Dependents"] = np.where(demo["Number of Dependents"] > 0, "Yes", "No")
    dep_df = segment_summary(demo, "Has_Dependents")
    print(dep_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 10. Geography
    # ------------------------------------------------------------------
    print_section(f"GEOGRAPHIC ANALYSIS (min {GEO_MIN_CUSTOMERS} existing customers)")
    geo_df = analyze_geography(df)
    reportable = geo_df[geo_df["meets_min_sample"]]
    print("Top cities by churn rate:")
    print(reportable.head(10).to_string(index=False))
    print("\nLowest churn cities (reportable):")
    print(reportable.tail(5).to_string(index=False))

    # ------------------------------------------------------------------
    # 11. Interactions
    # ------------------------------------------------------------------
    print_section("MULTIVARIATE INTERACTIONS")
    interactions = analyze_interactions(df)
    for name, table in interactions.items():
        print(f"\n--- {name} (top 8 by churn rate, min 20 customers) ---")
        filtered = table[table["segment_size"] >= 20].head(8)
        print(filtered.to_string(index=False))

    # ------------------------------------------------------------------
    # 12. Segments
    # ------------------------------------------------------------------
    print_section("PROPOSED CUSTOMER SEGMENTS")
    segments_df = define_customer_segments(df)
    print(segments_df.to_string(index=False))

    # ------------------------------------------------------------------
    # 13. Charts
    # ------------------------------------------------------------------
    print_section("SAVING CHARTS")
    save_bar_chart(
        contract_df, "Contract", "churn_rate_pct",
        "Churn Rate by Contract Type", "churn_rate_by_contract.png", rotate=15,
    )
    save_churn_volume_chart(
        tenure_df, "Tenure_Band",
        "Churn Volume and Rate by Tenure Band", "churn_by_tenure_band.png",
    )
    save_bar_chart(
        internet_df, "Internet Type", "churn_rate_pct",
        "Churn Rate by Internet Type", "churn_rate_by_internet_type.png", rotate=15,
    )
    save_bar_chart(
        offer_df.sort_values("Offer"), "Offer", "churn_rate_pct",
        "Churn Rate by Marketing Offer", "churn_rate_by_offer.png", rotate=15,
    )
    save_bar_chart(
        cat_counts, "Churn Category", "count",
        "Churn Count by Exit Category", "churn_categories.png", color="#C00000",
    )
    save_bar_chart(
        charge_df, "Charge_Band", "churn_rate_pct",
        "Churn Rate by Monthly Charge Band", "churn_rate_by_charge_band.png", rotate=20,
    )
    save_bar_chart(
        payment_df, "Payment Method", "churn_rate_pct",
        "Churn Rate by Payment Method", "churn_rate_by_payment_method.png", rotate=15,
    )
    save_bar_chart(
        segment_summary(df, "Age_Band"), "Age_Band", "churn_rate_pct",
        "Churn Rate by Age Band", "churn_rate_by_age_band.png", rotate=15,
    )
    save_heatmap(
        interactions["contract_x_tenure"],
        "Churn Rate Heatmap: Contract × Tenure Band",
        "heatmap_contract_tenure.png",
    )
    save_monthly_charge_distribution(df)

    chart_count = len(list(OUTPUT_DIR.glob("*.png")))
    print(f"  Saved {chart_count} charts to {OUTPUT_DIR}")

    print_section("PHASE 3 EDA COMPLETE")
    print(f"  Baseline churn rate: {baseline_churn_rate}%")
    print(f"  Negative monthly charge rows preserved: {df['Flag_Negative_Monthly_Charge'].sum()}")
    print(f"  Offer 'None' count: {(df['Offer'] == 'None').sum()}")


if __name__ == "__main__":
    main()
