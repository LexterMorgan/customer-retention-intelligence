#!/usr/bin/env python3
"""Generate customer_churn_dashboard.twb from BUILD_GUIDE.md specifications."""

from __future__ import annotations

import csv
import hashlib
import html
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

# Allow `python3 tableau/generate_workbook.py` from the repo root.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_extract import HYPER_PATH, build_hyper_extract

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "processed" / "customers_clean.csv"
TABLEAU_DIR = PROJECT_ROOT / "tableau"
OUTPUT_TWB = TABLEAU_DIR / "customer_churn_dashboard.twb"
OUTPUT_TWBX = TABLEAU_DIR / "customer_churn_dashboard.twbx"
BACKUP_TWB = TABLEAU_DIR / "customer_churn_dashboard.twb.bak"

DS_CAPTION = "Customer Churn"
DS_NAME = "federated.churn7043"
# Hyper named-connection / relative extract path match Tableau Public's World
# Indicators sample packaging (Data/<caption>/<caption>.hyper).
HYPER_CONN_NAME = "hyper.churn7043"
HYPER_DBNAME = "Data/Customer Churn/Customer Churn.hyper"
EXTRACT_TABLE = "[Extract].[Extract]"

CHURN_RED = "#9B1C1C"
RETAINED_BLUE = "#1D4E89"
JOINED_GRAY = "#6B7280"
DASH_BG = "#F3F4F6"
CARD_BG = "#FFFFFF"
BORDER_MUTED = "#D1D5DB"
TITLE_INK = "#111827"
MUTED_INK = "#4B5563"

WORKSHEETS = [
    "WS_D1_TotalCustomers",
    "WS_D1_ExistingCustomers",
    "WS_D1_Churned",
    "WS_D1_Retained",
    "WS_D1_ChurnRate",
    "WS_D1_RetentionRate",
    "WS_D1_MRVL",
    "WS_D1_StatusComposition",
    "WS_D1_ChurnByContract",
    "WS_D1_ChurnByTenure",
    "WS_D1_ChurnByInternet",
    "WS_D2_CalloutHighRisk",
    "WS_D2_CalloutCompetitor",
    "WS_D2_CalloutM2M",
    "WS_D2_ChurnCategory",
    "WS_D2_TopReasons",
    "WS_D2_ContractTenureHeatmap",
    "WS_D2_PrioritySegments",
    "WS_D2_ChurnByOffer",
    "WS_D3_RiskTierCount",
    "WS_D3_RiskTierChurnRate",
    "WS_D3_SegmentVolume",
    "WS_D3_Scenario",
    "WS_D3_PaymentMethod",
    "WS_D3_ChargeBand",
]

class ZoneIdCounter:
    def __init__(self) -> None:
        self._n = 1

    def next(self) -> int:
        val = self._n
        self._n += 1
        return val


DASHBOARDS = {
    "DB1 Executive Churn Overview": [
        "WS_D1_TotalCustomers",
        "WS_D1_ExistingCustomers",
        "WS_D1_Churned",
        "WS_D1_Retained",
        "WS_D1_ChurnRate",
        "WS_D1_RetentionRate",
        "WS_D1_MRVL",
        "WS_D1_StatusComposition",
        "WS_D1_ChurnByContract",
        "WS_D1_ChurnByTenure",
        "WS_D1_ChurnByInternet",
    ],
    # Callout / PrioritySegments Text-BAN sheets remain in the workbook but are
    # omitted from the dashboard: runtime shows empty panels.
    "DB2 Churn Drivers & Segments": [
        "WS_D2_ChurnCategory",
        "WS_D2_TopReasons",
        "WS_D2_ContractTenureHeatmap",
        "WS_D2_ChurnByOffer",
    ],
    # SegmentVolume / Scenario Text-BAN sheets omitted from dashboard (empty panels).
    "DB3 Retention Opportunities": [
        "WS_D3_RiskTierCount",
        "WS_D3_RiskTierChurnRate",
        "WS_D3_PaymentMethod",
        "WS_D3_ChargeBand",
    ],
}

# DB1 presentation labels only — worksheet names stay technical for refs/calcs.
DB1_KPI_LABELS = [
    "Total Customers",
    "Existing Customers",
    "Churned",
    "Retained",
    "Churn Rate",
    "Retention Rate",
    "MRVL",
]
DB1_CHART_TITLES = [
    "Customer Status Composition",
    "Churn Rate by Contract",
    "Churn by Tenure",
    "Churn Rate by Internet Type",
]
DB2_CHART_TITLES = {
    "WS_D2_ChurnCategory": "Churn Categories",
    "WS_D2_TopReasons": "Top Churn Reasons",
    "WS_D2_ContractTenureHeatmap": "Churn Risk by Contract & Tenure",
    "WS_D2_ChurnByOffer": "Churn Rate by Offer",
}
DB3_CHART_TITLES = {
    "WS_D3_RiskTierCount": "Customers by Risk Tier",
    "WS_D3_RiskTierChurnRate": "Churn Rate by Risk Tier",
    "WS_D3_PaymentMethod": "Churn Rate by Payment Method",
    "WS_D3_ChargeBand": "Churn Rate by Monthly Charge Band",
}


def calc_internal(caption: str) -> str:
    h = int(hashlib.sha256(caption.encode()).hexdigest()[:15], 16) % 10**16
    return f"[Calculation_{h}]"


AGG_FUNC_RE = re.compile(
    r"\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT|COUNTD|ATTR|STDEV|STDEVP|VAR|VARP)\s*\(",
    re.IGNORECASE,
)


def is_aggregate_formula(formula: str) -> bool:
    return bool(AGG_FUNC_RE.search(formula))


def calc_meta(caption: str) -> dict[str, Any] | None:
    return next((c for c in CALCULATED_FIELDS if c["caption"] == caption), None)


def instance_token(caption: str) -> str:
    """Shelf/instance token: Calculation_* for calcs, caption for base fields.

    Genuine Superstore aggregate calcs use [usr:Calculation_…:qk], not the caption.
    """
    if caption in CALC_MAP:
        return CALC_MAP[caption].strip("[]")
    return caption


def default_agg_for_field(caption: str) -> str:
    meta = calc_meta(caption)
    if meta is None:
        return "none"
    if meta["role"] == "dimension":
        return "none"
    if is_aggregate_formula(meta["formula"]):
        return "usr"
    return "sum"


def field_ref(field: str, agg: str | None = None, kind: str | None = None) -> str:
    token = instance_token(field)
    if agg is None:
        agg = default_agg_for_field(field)
    if kind is None:
        kind = "nk" if agg == "none" else "qk"
    return f"[{DS_NAME}].[{agg}:{token}:{kind}]"


FIELD_REF_RE = re.compile(
    rf"\[{re.escape(DS_NAME)}\]\.\[(\w+):([^:\]]+):(\w+)\]"
)

DERIVATION_NAMES = {
    "none": "None",
    "sum": "Sum",
    "cnt": "Count",
    "usr": "User",
    "attr": "Attribute",
    "min": "Min",
    "max": "Max",
    "avg": "Average",
}

INSTANCE_TYPES = {
    "nk": "nominal",
    "ok": "ordinal",
    "qk": "quantitative",
}


def instance_name(caption: str, derivation: str, kind: str) -> str:
    return f"[{derivation}:{caption}:{kind}]"


def caption_for_instance_token(token: str) -> str:
    bracketed = f"[{token}]"
    for caption, internal in CALC_MAP.items():
        if internal == bracketed:
            return caption
    return token


def collect_field_instances(*refs: str | None) -> list[tuple[str, str, str]]:
    seen: set[tuple[str, str, str]] = set()
    instances: list[tuple[str, str, str]] = []
    for ref in refs:
        if not ref:
            continue
        for derivation, token, kind in FIELD_REF_RE.findall(ref):
            caption = caption_for_instance_token(token)
            key = (caption, derivation, kind)
            if key not in seen:
                seen.add(key)
                instances.append(key)
    return instances


def column_name_for_field(caption: str, internal: str | None = None) -> str:
    if internal:
        return internal if internal.startswith("[") else f"[{internal}]"
    if caption in CALC_MAP:
        return CALC_MAP[caption]
    return f"[{caption}]"


def federated_column_ref(column_name: str) -> str:
    return f"[{DS_NAME}].{column_name}"


def add_column_instance(
    parent: ET.Element,
    column_name: str,
    caption: str,
    derivation: str,
    kind: str,
) -> ET.Element:
    ci = ET.SubElement(parent, "column-instance")
    ci.set("column", column_name)
    ci.set("derivation", DERIVATION_NAMES.get(derivation, derivation.capitalize()))
    # Calculated fields must use Calculation_* in the instance name (Superstore).
    ci.set("name", instance_name(instance_token(caption), derivation, kind))
    ci.set("pivot", "key")
    ci.set("type", INSTANCE_TYPES[kind])
    return ci


def xml_formula(formula: str) -> str:
    return html.escape(formula, quote=True)


def infer_columns() -> list[dict[str, Any]]:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        sample = next(reader)

    string_cols = {
        "Customer ID", "Gender", "Married", "City", "Zip Code", "Offer",
        "Phone Service", "Multiple Lines", "Internet Service", "Internet Type",
        "Online Security", "Online Backup", "Device Protection Plan",
        "Premium Tech Support", "Streaming TV", "Streaming Movies",
        "Streaming Music", "Unlimited Data", "Contract", "Paperless Billing",
        "Payment Method", "Customer Status", "Churn Category", "Churn Reason",
        "Tenure_Band", "Age_Band", "Charge_Band",
        # Extract-derived mark-safe dimensions (see build_extract.py).
        "Offer Group", "Charge Band",
    }
    int_cols = {
        "Age", "Number of Dependents", "Number of Referrals", "Tenure in Months",
        "Is_Churned", "Is_Retained", "Flag_Negative_Monthly_Charge",
        "Add_On_Count", "Zip_Population",
    }
    real_cols = {
        "Latitude", "Longitude", "Avg Monthly Long Distance Charges",
        "Avg Monthly GB Download", "Monthly Charge", "Total Charges",
        "Total Refunds", "Total Extra Data Charges", "Total Long Distance Charges",
        "Total Revenue",
    }

    cols = []
    for name, val in zip(header, sample):
        if name in string_cols:
            dt, role, typ = "string", "dimension", "nominal"
        elif name in int_cols:
            dt, role, typ = "integer", "measure", "quantitative"
        elif name in real_cols:
            dt, role, typ = "real", "measure", "quantitative"
        else:
            dt, role, typ = "string", "dimension", "nominal"
        cols.append(
            {
                "name": name,
                "local": f"[{name}]",
                "datatype": dt,
                "role": role,
                "type": typ,
            }
        )
    # Physical columns added by build_extract (not present in the CSV header).
    for name in ("Offer Group", "Charge Band"):
        cols.append(
            {
                "name": name,
                "local": f"[{name}]",
                "datatype": "string",
                "role": "dimension",
                "type": "nominal",
            }
        )
    return cols


CALCULATED_FIELDS: list[dict[str, Any]] = [
    {
        "caption": "Existing Customer Flag",
        "formula": '[Customer Status] = "Churned" OR [Customer Status] = "Stayed"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Churned Customer Flag",
        "formula": '[Customer Status] = "Churned"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Retained Customer Flag",
        "formula": '[Customer Status] = "Stayed"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Churn Rate",
        # Base-column only: nested calc refs in worksheet-local formulas blank marks.
        "formula": "SUM([Is_Churned]) / (SUM([Is_Churned]) + SUM([Is_Retained]))",
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.00%",
    },
    {
        "caption": "Retention Rate",
        "formula": "SUM([Is_Retained]) / (SUM([Is_Churned]) + SUM([Is_Retained]))",
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.00%",
    },
    {
        "caption": "Churned Count",
        "formula": "SUM([Is_Churned])",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Existing Customer Count",
        "formula": "SUM([Is_Churned]) + SUM([Is_Retained])",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Share of All Churn",
        "formula": "SUM([Is_Churned]) / TOTAL(SUM([Is_Churned]))",
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "Share of Internet Churn",
        "formula": (
            "SUM(IF [Internet Type] != \"N/A\" AND [Is_Churned] = 1 THEN 1 ELSE 0 END)"
            " / SUM([Is_Churned])"
        ),
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "Monthly Recurring Value Lost",
        "formula": 'SUM(IF [Customer Status] = "Churned" THEN [Monthly Charge] END)',
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "C1025USD",
    },
    {
        "caption": "Tenure Band Sort",
        "formula": (
            'CASE [Tenure_Band] WHEN "0-6 months" THEN 1 WHEN "7-12 months" THEN 2 '
            'WHEN "13-24 months" THEN 3 WHEN "25-36 months" THEN 4 '
            'WHEN "37-48 months" THEN 5 WHEN "49-72 months" THEN 6 ELSE 99 END'
        ),
        "datatype": "integer",
        "role": "dimension",
        "type": "ordinal",
    },
    {
        "caption": "High Risk Intersection Flag",
        "formula": (
            '[Contract] = "Month-to-Month" AND [Tenure_Band] = "0-6 months" '
            'AND [Internet Type] = "Fiber Optic"'
        ),
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Risk Points",
        "formula": (
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
        ),
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Descriptive Churn Risk Tier",
        # Inline Risk Points — worksheet-local formulas that reference other calcs
        # blank marks unless those calcs are also in deps (Superstore Profit Ratio
        # only refs base columns that appear beside it in deps).
        "formula": (
            "IF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ') >= 6 THEN "Very High" '
            "ELSEIF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ') >= 4 THEN "High" '
            "ELSEIF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ') >= 2 THEN "Medium" ELSE "Low" END'
        ),
        "datatype": "string",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Internet Customer Flag",
        "formula": '[Internet Type] != "N/A"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Risk Tier Sort",
        # Base-column only CASE (avoid nested calc caption refs in worksheet deps).
        "formula": (
            "IF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ") >= 6 THEN 1 ELSEIF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ") >= 4 THEN 2 ELSEIF ("
            '(IF [Contract] = "Month-to-Month" THEN 3 ELSE 0 END) + '
            '(IF [Tenure_Band] = "0-6 months" THEN 3 ELSE 0 END) + '
            '(IF [Internet Type] = "Fiber Optic" THEN 2 ELSE 0 END) + '
            "(IF [Number of Dependents] = 0 THEN 1 ELSE 0 END) + "
            '(IF [Married] = "No" THEN 1 ELSE 0 END)'
            ") >= 2 THEN 3 ELSE 4 END"
        ),
        "datatype": "integer",
        "role": "dimension",
        "type": "ordinal",
    },
    {
        "caption": "Pct of Churned",
        "formula": "COUNT([Customer ID]) / TOTAL(COUNT([Customer ID]))",
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "Joined Count",
        "formula": 'COUNTD(IF [Customer Status] = "Joined" THEN [Customer ID] END)',
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Early Tenure M2M Flag",
        "formula": '[Contract] = "Month-to-Month" AND [Tenure_Band] = "0-6 months"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "M2M Fiber Flag",
        "formula": '[Contract] = "Month-to-Month" AND [Internet Type] = "Fiber Optic"',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Stable Two Year Flag",
        "formula": (
            '[Contract] = "Two Year" AND [Tenure_Band] IN ("37-48 months","49-72 months")'
        ),
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "M2M No Dependents Flag",
        "formula": '[Contract] = "Month-to-Month" AND [Number of Dependents] = 0',
        "datatype": "boolean",
        "role": "dimension",
        "type": "nominal",
    },
    {
        "caption": "Early M2M Customers",
        "formula": "SUM(IF [Early Tenure M2M Flag] THEN 1 END)",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Early M2M Churn Rate",
        "formula": (
            "SUM(IF [Early Tenure M2M Flag] AND [Churned Customer Flag] THEN 1 END)"
            " / SUM(IF [Early Tenure M2M Flag] THEN 1 END)"
        ),
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "M2M Fiber Customers",
        "formula": "SUM(IF [M2M Fiber Flag] THEN 1 END)",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "M2M Fiber Churn Rate",
        "formula": (
            "SUM(IF [M2M Fiber Flag] AND [Churned Customer Flag] THEN 1 END)"
            " / SUM(IF [M2M Fiber Flag] THEN 1 END)"
        ),
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "High Risk Customers",
        "formula": "SUM(IF [High Risk Intersection Flag] THEN 1 END)",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "High Risk Churn Rate",
        "formula": (
            "SUM(IF [High Risk Intersection Flag] AND [Churned Customer Flag] THEN 1 END)"
            " / SUM(IF [High Risk Intersection Flag] THEN 1 END)"
        ),
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "Stable Two Year Customers",
        "formula": "SUM(IF [Stable Two Year Flag] THEN 1 END)",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Stable Two Year Churn Rate",
        "formula": (
            "SUM(IF [Stable Two Year Flag] AND [Churned Customer Flag] THEN 1 END)"
            " / SUM(IF [Stable Two Year Flag] THEN 1 END)"
        ),
        "datatype": "real",
        "role": "measure",
        "type": "quantitative",
        "format": "p0.0%",
    },
    {
        "caption": "M2M No Dep Churned",
        "formula": (
            "SUM(IF [M2M No Dependents Flag] AND [Churned Customer Flag] THEN 1 END)"
        ),
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "M2M Fiber Churned",
        "formula": "SUM(IF [M2M Fiber Flag] AND [Churned Customer Flag] THEN 1 END)",
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Early M2M Churned",
        "formula": (
            "SUM(IF [Early Tenure M2M Flag] AND [Churned Customer Flag] THEN 1 END)"
        ),
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "High Risk Churned",
        "formula": (
            "SUM(IF [High Risk Intersection Flag] AND [Churned Customer Flag] THEN 1 END)"
        ),
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
    {
        "caption": "Stable Two Year Churned",
        "formula": (
            "SUM(IF [Stable Two Year Flag] AND [Churned Customer Flag] THEN 1 END)"
        ),
        "datatype": "integer",
        "role": "measure",
        "type": "quantitative",
    },
]

TEXT_CALCS = {
    # BAN text formulas must reference base columns only (same blank-mark failure
    # mode as nested shelf calcs). Superstore KPI sheets also place a measure on
    # cols rather than leaving both shelves empty.
    "WS_D1_TotalCustomers": "STR(COUNT([Customer ID]))",
    "WS_D1_ExistingCustomers": "STR(SUM([Is_Churned]) + SUM([Is_Retained]))",
    "WS_D1_Churned": "STR(SUM([Is_Churned]))",
    "WS_D1_Retained": "STR(SUM([Is_Retained]))",
    "WS_D1_ChurnRate": (
        'STR(ROUND(100*SUM([Is_Churned])/(SUM([Is_Churned])+SUM([Is_Retained])),1)) + "%"'
    ),
    "WS_D1_RetentionRate": (
        'STR(ROUND(100*SUM([Is_Retained])/(SUM([Is_Churned])+SUM([Is_Retained])),1)) + "%"'
    ),
    "WS_D1_MRVL": (
        '"$" + STR(ROUND(SUM(IF [Customer Status] = "Churned" THEN [Monthly Charge] END),2))'
    ),
    "WS_D2_CalloutHighRisk": (
        '"HIGH-RISK INTERSECTION\n'
        "M2M + 0–6 mo + Fiber Optic\n\n"
        "487 customers  ·  444 churned\n"
        "91.2% churn  ·  23.8% of all churn\n\n"
        'Descriptive segment — association only"'
    ),
    "WS_D2_CalloutCompetitor": (
        '"COMPETITOR-ATTRIBUTED EXITS\n\n'
        "841 churned\n"
        "45.0% of all churn\n\n"
        'Self-reported exit themes"'
    ),
    "WS_D2_CalloutM2M": (
        '"MONTH-TO-MONTH CONTRACT\n\n'
        "51.7% churn rate\n"
        "1,655 churned\n"
        '88.6% of all churn"'
    ),
    "WS_D3_Scenario": (
        '"HYPOTHETICAL RETENTION SCENARIO\n'
        "Illustrative only — not a forecast or causal estimate\n\n"
        "Segment: Month-to-Month + 0–6 months + Fiber Optic (churned)\n"
        "Assumption: retain 10% of churned customers in segment\n\n"
        "Observed churned in segment      444\n"
        "Potentially retained               44\n"
        "Monthly value preserved     $3,524.68\n"
        'Annualized value preserved $42,296.22"'
    ),
    # Measure Names/Values shelves cannot be fabricated safely in generated TWBs;
    # render the validated segment tables as Text marks instead.
    "WS_D2_PrioritySegments": (
        '"PRIORITY SEGMENTS  ·  existing customers\n\n'
        "Early-Tenure Month-to-Month     959  ·  81.3% churn  ·  41.7% of churn\n"
        "Month-to-Month Fiber Optic    1,796  ·  61.6% churn  ·  59.2% of churn\n"
        "M2M + 0–6 mo + Fiber            487  ·  91.2% churn  ·  23.8% of churn\n"
        'Stable Two-Year              1,502  ·   3.1% churn  ·   2.5% of churn"'
    ),
    "WS_D3_SegmentVolume": (
        '"SEGMENT CHURN VOLUME  ·  existing customers\n\n'
        "M2M No Dependents                 1,549 churned\n"
        "Month-to-Month Fiber Optic        1,107 churned\n"
        "Early-Tenure Month-to-Month         780 churned\n"
        "M2M + 0–6 mo + Fiber                444 churned\n"
        'Stable Two-Year                      46 churned"'
    ),
}

for ws_name, formula in TEXT_CALCS.items():
    CALCULATED_FIELDS.append(
        {
            "caption": f"{ws_name} Text",
            "formula": formula,
            "datatype": "string",
            "role": "measure",
            "type": "quantitative",
        }
    )


def build_calc_map() -> dict[str, str]:
    mapping = {}
    for c in CALCULATED_FIELDS:
        mapping[c["caption"]] = calc_internal(c["caption"])
    return mapping


CALC_MAP = build_calc_map()
BASE_COLS = infer_columns()
BASE_META = {c["name"]: c for c in BASE_COLS}

# Known-good runtime sheets filter with string dimensions (Customer Status),
# not boolean calculated fields. Boolean calc filters parse cleanly but leave
# empty mark sets for generated sheets in Tableau Public 2026.2.1.
EXISTING_STATUS_FILTER = ("Customer Status", ["Churned", "Stayed"])
INTERNET_TYPE_FILTER = ("Internet Type", ["Fiber Optic", "DSL", "Cable"])

FORMULA_FIELD_RE = re.compile(r"\[([^\]]+)\]")


def formula_field_refs(formula: str) -> list[str]:
    """Return caption/token refs inside a Tableau formula (base or calc)."""
    refs: list[str] = []
    for token in FORMULA_FIELD_RE.findall(formula):
        if token.startswith("Calculation_"):
            bracketed = f"[{token}]"
            for caption, internal in CALC_MAP.items():
                if internal == bracketed:
                    refs.append(caption)
                    break
            continue
        refs.append(token)
    return refs


def field_dep_tuple(caption: str) -> tuple[str, str, str, str, str | None]:
    meta = calc_meta(caption)
    if meta is not None:
        return (
            caption,
            meta["datatype"],
            meta["role"],
            meta["type"],
            CALC_MAP[caption],
        )
    base = BASE_META.get(caption)
    if base is not None:
        return (caption, base["datatype"], base["role"], base["type"], None)
    return (caption, "string", "dimension", "nominal", None)


def expand_view_fields(
    view_fields: list[tuple[str, str, str, str, str | None]],
) -> list[tuple[str, str, str, str, str | None]]:
    """Ensure every nested calc / base column used by worksheet formulas is in deps.

    Superstore Profit Ratio embeds sum([Profit])/sum([Sales]) and lists Profit and
    Sales beside the calc in datasource-dependencies. Omitting those refs leaves
    Tableau Public with no marks and no parser error.
    """
    known = {caption for caption, *_ in view_fields}
    expanded = list(view_fields)
    changed = True
    while changed:
        changed = False
        for caption, *_ in list(expanded):
            meta = calc_meta(caption)
            if meta is None:
                continue
            for ref in formula_field_refs(meta["formula"]):
                if ref in known:
                    continue
                expanded.append(field_dep_tuple(ref))
                known.add(ref)
                changed = True
    return expanded


def col_dep(
    name: str,
    caption: str | None = None,
    datatype: str = "string",
    role: str = "dimension",
    typ: str = "nominal",
    formula: str | None = None,
) -> ET.Element:
    el = ET.Element("column")
    el.set("datatype", datatype)
    el.set("name", name if name.startswith("[") else f"[{name}]")
    el.set("role", role)
    el.set("type", typ)
    if caption:
        el.set("caption", caption)
    if formula is not None:
        # Superstore embeds <calculation> on worksheet deps for every calc column.
        calc_el = ET.SubElement(el, "calculation")
        calc_el.set("class", "tableau")
        calc_el.set("formula", formula)
    return el


def field_datatype(field_caption: str) -> str:
    if field_caption in CALC_MAP:
        meta = next(c for c in CALCULATED_FIELDS if c["caption"] == field_caption)
        return meta["datatype"]
    base = BASE_META.get(field_caption)
    if base is not None:
        return base["datatype"]
    return "string"


def format_filter_member(member: str, datatype: str = "string") -> str:
    """Return a Tableau categorical filter member value.

    String dimensions (Superstore / PerformanceRecording): quote-wrapped literals
    such as `"Churned"`, which ElementTree serializes as member="&quot;Churned&quot;".

    Boolean calculated fields (Superstore Order Profitable?): bare `true` / `false`
    with no surrounding quotes. Quote-wrapping booleans as `"true"` causes Tableau
    Public to report "Error parsing filter for field ...".
    """
    if datatype == "boolean":
        raw = member.strip().strip('"').lower()
        if raw not in {"true", "false"}:
            raise ValueError(f"boolean filter member must be true/false, got {member!r}")
        return raw
    if member.startswith('"') and member.endswith('"'):
        return member
    return f'"{member}"'


def add_filter(
    parent: ET.Element,
    field_caption: str,
    member: str | list[str] | None = None,
    class_name: str = "categorical",
) -> None:
    """Add a categorical filter.

    Known-good runtime sheets use string dimension filters (Customer Status).
    Boolean calc filters parse without error but produce empty mark sets in
    Tableau Public for this workbook — prefer multi-member string unions.
    """
    column_name = column_name_for_field(field_caption, CALC_MAP.get(field_caption))
    datatype = field_datatype(field_caption)
    f = ET.SubElement(parent, "filter")
    f.set("class", class_name)
    f.set("column", federated_column_ref(column_name))
    if member is None:
        return
    members = member if isinstance(member, list) else [member]
    if len(members) == 1:
        gf = ET.SubElement(f, "groupfilter")
        gf.set("function", "member")
        gf.set("level", column_name)
        gf.set("member", format_filter_member(members[0], datatype))
        return
    union = ET.SubElement(f, "groupfilter")
    union.set("function", "union")
    for mem in members:
        gf = ET.SubElement(union, "groupfilter")
        gf.set("function", "member")
        gf.set("level", column_name)
        gf.set("member", format_filter_member(mem, datatype))


def _remote_type(datatype: str) -> str:
    # Align with Tableau Public World Indicators hyper metadata enums.
    if datatype == "string":
        return "129"
    if datatype == "real":
        return "5"
    if datatype == "boolean":
        return "11"
    return "20"  # integer


def build_datasource(base_cols: list[dict[str, Any]]) -> ET.Element:
    ds = ET.Element("datasource")
    ds.set("caption", DS_CAPTION)
    ds.set("inline", "true")
    ds.set("name", DS_NAME)
    ds.set("version", "18.1")

    conn = ET.SubElement(ds, "connection")
    conn.set("class", "federated")
    named = ET.SubElement(conn, "named-connections")
    nc = ET.SubElement(named, "named-connection")
    nc.set("caption", DS_CAPTION)
    nc.set("name", HYPER_CONN_NAME)
    hconn = ET.SubElement(nc, "connection")
    hconn.set("class", "hyper")
    hconn.set("dbname", HYPER_DBNAME)
    hconn.set("authentication", "auth-none")
    hconn.set("author-locale", "en_US")
    hconn.set("default-settings", "yes")
    hconn.set("port", "")
    hconn.set("sslmode", "")
    hconn.set("username", "tableau_internal_user")

    rel = ET.SubElement(conn, "relation")
    rel.set("connection", HYPER_CONN_NAME)
    rel.set("name", "Extract")
    rel.set("table", EXTRACT_TABLE)
    rel.set("type", "table")

    meta = ET.SubElement(conn, "metadata-records")
    for i, col in enumerate(base_cols):
        rec = ET.SubElement(meta, "metadata-record")
        rec.set("class", "column")
        ET.SubElement(rec, "remote-name").text = col["name"]
        ET.SubElement(rec, "remote-type").text = _remote_type(col["datatype"])
        ET.SubElement(rec, "local-name").text = col["local"]
        ET.SubElement(rec, "parent-name").text = "[Extract]"
        ET.SubElement(rec, "remote-alias").text = col["name"]
        ET.SubElement(rec, "ordinal").text = str(i)
        ET.SubElement(rec, "local-type").text = col["datatype"]
        ET.SubElement(rec, "aggregation").text = "Count" if col["role"] == "dimension" else "Sum"

    aliases = ET.SubElement(ds, "aliases")
    aliases.set("enabled", "yes")

    for col in base_cols:
        c = ET.SubElement(ds, "column")
        c.set("caption", col["name"])
        c.set("datatype", col["datatype"])
        c.set("name", col["local"])
        c.set("role", col["role"])
        c.set("type", col["type"])

    for calc in CALCULATED_FIELDS:
        internal = CALC_MAP[calc["caption"]]
        c = ET.SubElement(ds, "column")
        c.set("caption", calc["caption"])
        c.set("datatype", calc["datatype"])
        c.set("name", internal)
        c.set("role", calc["role"])
        c.set("type", calc["type"])
        if calc.get("format"):
            c.set("default-format", calc["format"])
        calc_el = ET.SubElement(c, "calculation")
        calc_el.set("class", "tableau")
        calc_el.set("formula", calc["formula"])

    return ds


def package_twbx(twb_path: Path = OUTPUT_TWB, twbx_path: Path = OUTPUT_TWBX) -> Path:
    """Package TWB + Hyper extract into a Tableau Public-compatible .twbx."""
    if not HYPER_PATH.exists():
        raise FileNotFoundError(f"Missing extract for packaging: {HYPER_PATH}")
    with zipfile.ZipFile(twbx_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(twb_path, arcname=twb_path.name)
        zf.write(HYPER_PATH, arcname=HYPER_DBNAME)
    return twbx_path


def build_view_deps(
    parent: ET.Element,
    fields: list[tuple[str, str, str, str, str | None]],
    instances: list[tuple[str, str, str]] | None = None,
) -> None:
    deps = ET.SubElement(parent, "datasource-dependencies")
    deps.set("datasource", DS_NAME)
    field_map = {}
    for caption, datatype, role, typ, internal in fields:
        name = internal or f"[{caption}]"
        field_map[caption] = name
        meta = calc_meta(caption)
        formula = meta["formula"] if meta is not None else None
        deps.append(col_dep(name, caption, datatype, role, typ, formula=formula))

    seen: set[tuple[str, str, str]] = set()
    for caption, derivation, kind in instances or []:
        key = (caption, derivation, kind)
        if key in seen:
            continue
        seen.add(key)
        column_name = field_map.get(caption) or CALC_MAP.get(caption) or f"[{caption}]"
        add_column_instance(deps, column_name, caption, derivation, kind)


def build_worksheet(
    name: str,
    rows: str | None = None,
    cols: str | None = None,
    mark: str = "Automatic",
    text_field: str | None = None,
    filters: list[tuple[str, str | list[str] | None]] | None = None,
    encodings: list[tuple[str, str, str, str]] | None = None,
    deps: list[tuple[str, str, str, str, str | None]] | None = None,
    *,
    mark_fontsize: str | None = None,
    text_caption_override: str | None = None,
) -> ET.Element:
    ws = ET.Element("worksheet")
    ws.set("name", name)
    table = ET.SubElement(ws, "table")

    view = ET.SubElement(table, "view")
    dss = ET.SubElement(view, "datasources")
    dsel = ET.SubElement(dss, "datasource")
    dsel.set("caption", DS_CAPTION)
    dsel.set("name", DS_NAME)

    default_deps = [
        ("Customer ID", "string", "dimension", "nominal", None),
        ("Customer Status", "string", "dimension", "nominal", None),
    ]
    view_fields = list(deps or default_deps)
    known = {caption for caption, *_ in view_fields}

    def append_field(caption: str) -> None:
        if caption in known:
            return
        view_fields.append(field_dep_tuple(caption))
        known.add(caption)

    instances: list[tuple[str, str, str]] = []
    if filters:
        for field, _member in filters:
            append_field(field)
    if encodings:
        for _enc_type, field, agg, kind in encodings:
            # Honor explicit agg from callers; default aggregate-calcs to usr.
            use_agg = agg if agg is not None else default_agg_for_field(field)
            append_field(field)
            instances.append((field, use_agg, kind))
    if text_field:
        text_caption = f"{text_field} Text"
        append_field(text_caption)
        instances.append((text_caption, "usr", "nk"))
        # Superstore KPI / Total Sales puts a measure on cols; empty rows+cols
        # leaves only a crushed title zone with no text marks.
        if not cols:
            cols = field_ref(text_caption, "usr", "nk")
    instances.extend(collect_field_instances(rows, cols))

    view_fields = expand_view_fields(view_fields)
    # Dashboard filter cards reference [none:Field:nk] on an owning sheet.
    # Ensure every dimension dep has that instance (PerformanceRecording pattern).
    seen_inst = {(c, d, k) for c, d, k in instances}
    for caption, _datatype, role, typ, _internal in view_fields:
        if role != "dimension":
            continue
        kind = "ok" if typ == "ordinal" else "nk"
        key = (caption, "none", kind)
        if key not in seen_inst:
            instances.append(key)
            seen_inst.add(key)

    build_view_deps(view, view_fields, instances)

    # KPI presentation: suppress technical "WS_D1_* Text" header captions on-sheet.
    # Formula / calc identity unchanged — local display caption only.
    if text_caption_override is not None and text_field:
        internal = CALC_MAP[f"{text_field} Text"]
        for col in view.findall("./datasource-dependencies/column"):
            if col.get("name") == internal:
                col.set("caption", text_caption_override)

    if filters:
        for field, member in filters:
            add_filter(view, field, member)

    agg = ET.SubElement(view, "aggregation")
    agg.set("value", "true")

    style = ET.SubElement(table, "style")
    if mark_fontsize is not None:
        # Proven V4.4 header suppression only — hides WS_D1_* / discrete col headers.
        # Do NOT re-apply field-scoped cell font-size: it produced large clipped
        # secondary glyphs under the working KPI values in final QA.
        header_rule = ET.SubElement(style, "style-rule")
        header_rule.set("element", "header")
        for attr, value in (("font-size", "1"), ("color", CARD_BG)):
            fmt = ET.SubElement(header_rule, "format")
            fmt.set("attr", attr)
            fmt.set("value", value)

    panes = ET.SubElement(table, "panes")
    pane = ET.SubElement(panes, "pane")
    pane.set("id", "0")
    pview = ET.SubElement(pane, "view")
    breakdown = ET.SubElement(pview, "breakdown")
    breakdown.set("value", "auto")
    mark_el = ET.SubElement(pane, "mark")
    mark_el.set("class", mark)

    if encodings:
        enc_el = ET.SubElement(pane, "encodings")
        for enc_type, field, agg, kind in encodings:
            enc = ET.SubElement(enc_el, enc_type)
            enc.set("column", field_ref(field, agg, kind))

    if text_field:
        enc_el = pane.find("encodings")
        if enc_el is None:
            enc_el = ET.SubElement(pane, "encodings")
        text = ET.SubElement(enc_el, "text")
        text.set("column", field_ref(f"{name} Text", "usr", "nk"))

    r = ET.SubElement(table, "rows")
    if rows:
        r.text = rows
    c = ET.SubElement(table, "cols")
    if cols:
        c.text = cols

    # Do NOT emit worksheet-level <title> — invalid content model
    # (((layout-options?)|(repository-location?)),table) → D2E8DA72.

    return ws


def build_all_worksheets() -> list[ET.Element]:
    sheets = []

    for ban in [
        "WS_D1_TotalCustomers",
        "WS_D1_ExistingCustomers",
        "WS_D1_Churned",
        "WS_D1_Retained",
        "WS_D1_ChurnRate",
        "WS_D1_RetentionRate",
        "WS_D1_MRVL",
    ]:
        # V4.3 structure locked (real caption, Text on cols+encoding).
        # Presentation only: enlarge Text mark; shrink headers that emit
        # WS_D1_* field labels and duplicate discrete col values.
        fs = "22" if ban == "WS_D1_MRVL" else "28"
        sheets.append(
            build_worksheet(ban, mark="Text", text_field=ban, mark_fontsize=fs)
        )

    for callout in ["WS_D2_CalloutHighRisk", "WS_D2_CalloutCompetitor", "WS_D2_CalloutM2M", "WS_D3_Scenario"]:
        sheets.append(build_worksheet(callout, mark="Text", text_field=callout))

    sheets.append(build_worksheet(
        "WS_D1_StatusComposition",
        rows=field_ref("Customer Status"),
        cols=field_ref("Customer ID", "cnt", "qk"),
        mark="Bar",
        encodings=[("color", "Customer Status", "none", "nk")],
        deps=[("Customer Status", "string", "dimension", "nominal", None),
              ("Customer ID", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D1_ChurnByContract",
        rows=field_ref("Contract"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("color", "Churn Rate", "usr", "qk"), ("text", "Churn Rate", "usr", "qk"),
                   ("text", "Churned Count", "usr", "qk")],
        deps=[("Contract", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Churned Count", "integer", "measure", "quantitative", CALC_MAP["Churned Count"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D1_ChurnByTenure",
        rows=field_ref("Tenure_Band"),
        cols=f"{field_ref('Churn Rate', 'usr', 'qk')} / {field_ref('Churned Count', 'usr', 'qk')}",
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("text", "Churn Rate", "usr", "qk"), ("text", "Churned Count", "usr", "qk")],
        deps=[("Tenure_Band", "string", "dimension", "nominal", None),
              ("Tenure Band Sort", "integer", "dimension", "ordinal", CALC_MAP["Tenure Band Sort"]),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Churned Count", "integer", "measure", "quantitative", CALC_MAP["Churned Count"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D1_ChurnByInternet",
        rows=field_ref("Internet Type"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[INTERNET_TYPE_FILTER, EXISTING_STATUS_FILTER],
        encodings=[("text", "Churn Rate", "usr", "qk"), ("text", "Share of All Churn", "usr", "qk")],
        deps=[("Internet Type", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Share of All Churn", "real", "measure", "quantitative", CALC_MAP["Share of All Churn"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D2_ChurnCategory",
        rows=field_ref("Churn Category"),
        cols=field_ref("Customer ID", "cnt", "qk"),
        mark="Bar",
        filters=[("Customer Status", "Churned")],
        encodings=[("text", "Pct of Churned", "usr", "qk")],
        deps=[("Churn Category", "string", "dimension", "nominal", None),
              ("Customer ID", "string", "dimension", "nominal", None),
              ("Pct of Churned", "real", "measure", "quantitative", CALC_MAP["Pct of Churned"]),
              # Present so the DB2 Internet Type dashboard filter can own this sheet.
              ("Internet Type", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D2_TopReasons",
        rows=field_ref("Churn Reason"),
        cols=field_ref("Customer ID", "cnt", "qk"),
        mark="Bar",
        filters=[("Customer Status", "Churned")],
        deps=[("Churn Reason", "string", "dimension", "nominal", None),
              ("Customer ID", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D2_ContractTenureHeatmap",
        rows=field_ref("Tenure_Band"),
        cols=field_ref("Contract"),
        mark="Square",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("color", "Churn Rate", "usr", "qk"), ("text", "Churn Rate", "usr", "qk")],
        deps=[("Contract", "string", "dimension", "nominal", None),
              ("Tenure_Band", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D2_PrioritySegments",
        mark="Text",
        text_field="WS_D2_PrioritySegments",
    ))

    # Same shelf pattern as working WS_D1_ChurnByContract (Churn Rate bars).
    sheets.append(build_worksheet(
        "WS_D2_ChurnByOffer",
        rows=field_ref("Offer Group"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("color", "Churn Rate", "usr", "qk"),
                   ("text", "Churn Rate", "usr", "qk"),
                   ("text", "Churned Count", "usr", "qk")],
        deps=[("Offer Group", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Churned Count", "integer", "measure", "quantitative", CALC_MAP["Churned Count"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D3_RiskTierCount",
        rows=field_ref("Descriptive Churn Risk Tier"),
        cols=field_ref("Customer ID", "cnt", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        deps=[("Descriptive Churn Risk Tier", "string", "dimension", "nominal", CALC_MAP["Descriptive Churn Risk Tier"]),
              ("Risk Tier Sort", "integer", "dimension", "ordinal", CALC_MAP["Risk Tier Sort"]),
              ("Customer ID", "string", "dimension", "nominal", None),
              ("Customer Status", "string", "dimension", "nominal", None),
              # Present so the DB3 Contract dashboard filter can own this sheet.
              ("Contract", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D3_RiskTierChurnRate",
        rows=field_ref("Descriptive Churn Risk Tier"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("text", "Churn Rate", "usr", "qk"), ("text", "Customer ID", "cnt", "qk")],
        deps=[("Descriptive Churn Risk Tier", "string", "dimension", "nominal", CALC_MAP["Descriptive Churn Risk Tier"]),
              ("Risk Tier Sort", "integer", "dimension", "ordinal", CALC_MAP["Risk Tier Sort"]),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Customer ID", "string", "dimension", "nominal", None),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    sheets.append(build_worksheet(
        "WS_D3_SegmentVolume",
        mark="Text",
        text_field="WS_D3_SegmentVolume",
    ))

    sheets.append(build_worksheet(
        "WS_D3_PaymentMethod",
        rows=field_ref("Payment Method"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("text", "Churned Count", "usr", "qk")],
        deps=[("Payment Method", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Churned Count", "integer", "measure", "quantitative", CALC_MAP["Churned Count"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    # Same shelf pattern as working WS_D3_PaymentMethod (Churn Rate bars).
    sheets.append(build_worksheet(
        "WS_D3_ChargeBand",
        rows=field_ref("Charge Band"),
        cols=field_ref("Churn Rate", "usr", "qk"),
        mark="Bar",
        filters=[EXISTING_STATUS_FILTER],
        encodings=[("text", "Churned Count", "usr", "qk")],
        deps=[("Charge Band", "string", "dimension", "nominal", None),
              ("Churn Rate", "real", "measure", "quantitative", CALC_MAP["Churn Rate"]),
              ("Churned Count", "integer", "measure", "quantitative", CALC_MAP["Churned Count"]),
              ("Customer Status", "string", "dimension", "nominal", None)],
    ))

    return sheets


def add_formatted_text(
    parent: ET.Element,
    text: str,
    *,
    fontsize: str = "11",
    fontcolor: str | None = None,
    fontname: str | None = None,
    bold: bool = False,
) -> None:
    ft = ET.SubElement(parent, "formatted-text")
    # Preserve intentional line breaks as separate runs for Tableau text zones.
    lines = text.split("\n")
    for i, line in enumerate(lines):
        run = ET.SubElement(ft, "run")
        run.set("fontsize", fontsize)
        if fontname:
            run.set("fontname", fontname)
        if fontcolor:
            run.set("fontcolor", fontcolor)
        if bold:
            run.set("bold", "true")
        run.text = line if i == len(lines) - 1 else f"{line}\n"


def add_zone_style(
    zone: ET.Element,
    *,
    background: str | None = None,
    border_color: str | None = None,
    border_style: str = "none",
    border_width: str = "0",
    margin: str = "4",
    padding: str = "4",
) -> None:
    """Append zone-style as the LAST child (Tableau content-model safe).

    layout-basic / text zones must NOT get zone-style before nested <zone>
    children — that triggers D2E8DA72 (zone not allowed after zone-style).
    Known-good bak text zones are formatted-text only; sheet zones may end
    with zone-style after all other children.
    """
    zs = ET.SubElement(zone, "zone-style")
    formats = {
        "border-color": border_color or BORDER_MUTED,
        "border-style": border_style,
        "border-width": border_width,
        "margin": margin,
        "padding": padding,
    }
    if background:
        formats["background-color"] = background
    for attr, value in formats.items():
        fmt = ET.SubElement(zs, "format")
        fmt.set("attr", attr)
        fmt.set("value", value)


def add_zone(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    ztype: str | None,
    name: str | None = None,
    text: str | None = None,
    param: str | None = None,
    *,
    mode: str | None = None,
    values: str | None = None,
    show_title: bool | None = None,
    background: str | None = None,
    border_style: str = "none",
    margin: str = "4",
    padding: str = "4",
    text_style: dict[str, Any] | None = None,
    with_zone_style: bool = False,
) -> ET.Element:
    z = ET.SubElement(parent, "zone")
    z.set("id", str(zone_ids.next()))
    z.set("x", str(x))
    z.set("y", str(y))
    z.set("w", str(w))
    z.set("h", str(h))
    if ztype:
        z.set("type", ztype)
    if name:
        z.set("name", name)
    if param:
        z.set("param", param)
    if mode:
        z.set("mode", mode)
    if values:
        z.set("values", values)
    if show_title is not None:
        z.set("show-title", "true" if show_title else "false")
    if text:
        style = text_style or {}
        add_formatted_text(z, text, **style)
    # Never attach zone-style here for layout-basic/text: children are appended
    # later, and zone-style must remain last (or omitted for text containers).
    if with_zone_style and ztype not in {"layout-basic", "layout-flow", "text", "filter"}:
        add_zone_style(
            z,
            background=background,
            border_style=border_style,
            border_width="1" if border_style == "solid" else "0",
            margin=margin,
            padding=padding,
        )
    return z


def add_filter_zone(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    field_caption: str,
    owner_sheet: str,
) -> ET.Element:
    """Dashboard filter card matching PerformanceRecording / World Indicators.

    Bare caption params (e.g. param='Offer') are not valid Tableau filter field
    refs and can leave the Offer sheet with axes but no marks. Genuine filters
    use a federated column-instance param plus the owning worksheet name.
    """
    return add_zone(
        parent,
        zone_ids,
        x,
        y,
        w,
        h,
        "filter",
        name=owner_sheet,
        param=field_ref(field_caption, "none", "nk"),
        mode="dropdown",
        values="relevant",
    )


def add_layout_flow(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    direction: str,
) -> ET.Element:
    """Horizontal/vertical split container (PerformanceRecording_new.twb pattern)."""
    z = ET.SubElement(parent, "zone")
    z.set("id", str(zone_ids.next()))
    z.set("x", str(x))
    z.set("y", str(y))
    z.set("w", str(w))
    z.set("h", str(h))
    z.set("type", "layout-flow")
    z.set("param", direction)
    return z


def add_sheet_zone(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    sheet_name: str,
    *,
    show_title: bool = True,
    background: str | None = CARD_BG,
    border_style: str = "none",
    margin: str = "6",
    padding: str = "4",
) -> ET.Element:
    # Leaf sheet zones only: zone-style is safe as the sole/last child
    # (Superstore Order Details pattern). Never use on layout-basic/text.
    return add_zone(
        parent,
        zone_ids,
        x,
        y,
        w,
        h,
        None,
        name=sheet_name,
        show_title=show_title,
        background=background,
        border_style=border_style,
        margin=margin,
        padding=padding,
        with_zone_style=True,
    )


def add_title_band(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    title: str,
    subtitle: str,
    y: int = 0,
    h: int = 7200,
) -> None:
    # Text zones: formatted-text only (D2E8DA72-safe). No zone-style child.
    title_h = int(h * 0.58)
    add_zone(
        parent,
        zone_ids,
        1200,
        y,
        97600,
        title_h,
        "text",
        text=title,
        text_style={
            "fontsize": "20",
            "fontcolor": TITLE_INK,
            "bold": True,
            "fontname": "Tableau Bold",
        },
    )
    add_zone(
        parent,
        zone_ids,
        1200,
        y + title_h,
        97600,
        h - title_h,
        "text",
        text=subtitle,
        text_style={"fontsize": "11", "fontcolor": MUTED_INK, "fontname": "Tableau Regular"},
    )


def add_db1_kpi_card(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    sheet_name: str,
    label: str,
) -> None:
    """KPI card: dashboard text-zone label + BAN sheet (no worksheet <title>)."""
    label_h = 2800
    add_zone(
        parent,
        zone_ids,
        x,
        y,
        w,
        label_h,
        "text",
        text=label,
        text_style={
            "fontsize": "12",
            "fontcolor": MUTED_INK,
            "fontname": "Tableau Bold",
            "bold": True,
        },
    )
    add_sheet_zone(
        parent,
        zone_ids,
        x,
        y + label_h,
        w,
        h - label_h,
        sheet_name,
        show_title=False,
        margin="6",
        border_style="solid",
        # Match known-rendering Text-mark zones (DB2 callouts / default sheet zones).
        padding="4",
    )


def add_db1_kpi_row(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    items: list[tuple[str, str]],
    *,
    gap: int = 600,
) -> None:
    """Equal-width KPI cards spanning the full content width (absolute zones)."""
    n = len(items)
    card_w = (w - (n - 1) * gap) // n
    for i, (sheet, label) in enumerate(items):
        cx = x + i * (card_w + gap)
        # Last card absorbs remainder so the row ends exactly at x+w.
        this_w = (x + w) - cx if i == n - 1 else card_w
        add_db1_kpi_card(parent, zone_ids, cx, y, this_w, h, sheet, label)


def add_titled_sheet(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    sheet_name: str,
    chart_title: str,
    *,
    border_style: str = "none",
    title_h: int = 3000,
) -> None:
    """Dashboard text-zone title + sheet with technical worksheet title hidden."""
    add_zone(
        parent,
        zone_ids,
        x,
        y,
        w,
        title_h,
        "text",
        text=chart_title,
        text_style={
            "fontsize": "13",
            "fontcolor": TITLE_INK,
            "fontname": "Tableau Bold",
            "bold": True,
        },
    )
    add_sheet_zone(
        parent,
        zone_ids,
        x,
        y + title_h,
        w,
        h - title_h,
        sheet_name,
        show_title=False,
        margin="6",
        border_style=border_style,
        padding="4",
    )


def add_db1_titled_chart(
    parent: ET.Element,
    zone_ids: ZoneIdCounter,
    x: int,
    y: int,
    w: int,
    h: int,
    sheet_name: str,
    chart_title: str,
) -> None:
    """DB1 chart title helper (preserves prior call sites)."""
    add_titled_sheet(
        parent, zone_ids, x, y, w, h, sheet_name, chart_title, title_h=3200
    )


def build_dashboard(
    name: str,
    sheet_names: list[str],
    zone_ids: ZoneIdCounter,
    filters: list[str] | None = None,
    footer: str | None = None,
    title: str | None = None,
    subtitle: str | None = None,
) -> ET.Element:
    """Build a dashboard whose zones fit the 100000×100000 layout coordinate space."""
    dash = ET.Element("dashboard")
    dash.set("name", name)

    style = ET.SubElement(dash, "style")
    rule = ET.SubElement(style, "style-rule")
    rule.set("element", "dash-title")
    for attr, value in (("color", TITLE_INK), ("font-size", "15pt"), ("font-weight", "bold")):
        fmt = ET.SubElement(rule, "format")
        fmt.set("attr", attr)
        fmt.set("value", value)

    size = ET.SubElement(dash, "size")
    size.set("minheight", "920")
    size.set("minwidth", "1440")
    size.set("sizing-mode", "range")

    zones = ET.SubElement(dash, "zones")
    # layout-basic: child <zone> elements only — never zone-style first (D2E8DA72).
    root = add_zone(zones, zone_ids, 0, 0, 100000, 100000, "layout-basic")

    if name.startswith("DB1"):
        # KPI area repaired surgically; lower 2x2 chart band geometry locked.
        title_h = 7000
        add_title_band(
            root,
            zone_ids,
            title or "Executive Churn Overview",
            subtitle
            or (
                "Retention health at a glance · association metrics only · "
                "Joined customers excluded from rate denominators"
            ),
            h=title_h,
        )
        content_y = title_h
        gutter = 1000
        gap = 700
        avail_w = 100000 - 2 * gutter

        # Locked chart band start (preserves working V4 chart titles / 2x2 layout).
        charts_y = 31200
        kpi_row_gap = 500
        kpi_h = (charts_y - 700 - content_y - kpi_row_gap) // 2
        kpi_gap = 600

        row1 = list(zip(sheet_names[:4], DB1_KPI_LABELS[:4]))
        row2 = list(zip(sheet_names[4:7], DB1_KPI_LABELS[4:7]))
        add_db1_kpi_row(root, zone_ids, gutter, content_y, avail_w, kpi_h, row1, gap=kpi_gap)
        add_db1_kpi_row(
            root,
            zone_ids,
            gutter,
            content_y + kpi_h + kpi_row_gap,
            avail_w,
            kpi_h,
            row2,
            gap=kpi_gap,
        )

        # Locked lower 2x2 geometry from V4 chart-title repair — do not change.
        footer_y = 90000
        chart_row_gap = 600
        chart_row_h = 28850
        half = 48650

        chart_specs = [
            (sheet_names[7], DB1_CHART_TITLES[0], gutter, charts_y),
            (sheet_names[8], DB1_CHART_TITLES[1], gutter + half + gap, charts_y),
            (sheet_names[9], DB1_CHART_TITLES[2], gutter, charts_y + chart_row_h + chart_row_gap),
            (
                sheet_names[10],
                DB1_CHART_TITLES[3],
                gutter + half + gap,
                charts_y + chart_row_h + chart_row_gap,
            ),
        ]
        for sheet, chart_title, x, y in chart_specs:
            add_db1_titled_chart(root, zone_ids, x, y, half, chart_row_h, sheet, chart_title)

        footer_text = footer or (
            "Churn Rate = Churned ÷ (Churned + Stayed). Joined customers (454) excluded from rate denominators."
        )
        add_zone(
            root,
            zone_ids,
            gutter,
            footer_y,
            avail_w,
            8000,
            "text",
            text=footer_text,
            text_style={"fontsize": "10", "fontcolor": MUTED_INK, "fontname": "Tableau Regular"},
        )

    elif name.startswith("DB2"):
        # Portfolio layout: drop empty callout panels; emphasize valid driver views.
        title_h = 6500
        add_title_band(
            root,
            zone_ids,
            title or "Churn Drivers & Segments",
            subtitle
            or "Where churn concentrates · stated reasons and descriptive segments · not causal claims",
            h=title_h,
        )
        gutter = 1000
        gap = 600
        avail_w = 100000 - 2 * gutter
        y = title_h

        # sheet_names: Category, TopReasons, Heatmap, Offer (PrioritySegments omitted).
        filter_y = 82000
        offer_h = 22000
        mid_budget = filter_y - y - gap - offer_h
        left_w = 42000
        right_w = avail_w - left_w - gap
        stack_h = (mid_budget - gap) // 2
        add_titled_sheet(
            root,
            zone_ids,
            gutter,
            y,
            left_w,
            stack_h,
            sheet_names[0],
            DB2_CHART_TITLES[sheet_names[0]],
        )
        add_titled_sheet(
            root,
            zone_ids,
            gutter,
            y + stack_h + gap,
            left_w,
            stack_h,
            sheet_names[1],
            DB2_CHART_TITLES[sheet_names[1]],
        )
        add_titled_sheet(
            root,
            zone_ids,
            gutter + left_w + gap,
            y,
            right_w,
            2 * stack_h + gap,
            sheet_names[2],
            DB2_CHART_TITLES[sheet_names[2]],
        )

        offer_y = y + 2 * stack_h + 2 * gap
        add_titled_sheet(
            root,
            zone_ids,
            gutter,
            offer_y,
            avail_w,
            offer_h,
            sheet_names[3],
            DB2_CHART_TITLES[sheet_names[3]],
        )

        if filters:
            filter_owners = {
                "Contract": "WS_D2_ContractTenureHeatmap",
                "Tenure_Band": "WS_D2_ContractTenureHeatmap",
                "Internet Type": "WS_D2_ChurnCategory",
                "Offer Group": "WS_D2_ChurnByOffer",
            }
            filter_h = 6500
            filter_w = avail_w // len(filters)
            filter_flow = add_layout_flow(
                root, zone_ids, gutter, filter_y, avail_w, filter_h, "horz"
            )
            for i, flt in enumerate(filters):
                add_filter_zone(
                    filter_flow,
                    zone_ids,
                    i * filter_w,
                    0,
                    filter_w if i < len(filters) - 1 else avail_w - i * filter_w,
                    filter_h,
                    flt,
                    filter_owners.get(flt, sheet_names[0]),
                )
            add_zone(
                root,
                zone_ids,
                gutter,
                90000,
                avail_w,
                8000,
                "text",
                text=(
                    "Stated exit reasons are self-reported. Offer E high churn is "
                    "confounded with M2M + early tenure — association only."
                ),
                text_style={"fontsize": "10", "fontcolor": MUTED_INK, "fontname": "Tableau Regular"},
            )

    else:
        # DB3 — compact portfolio layout; human-facing titles; fill whitespace.
        title_h = 6500
        add_title_band(
            root,
            zone_ids,
            title or "Retention Opportunities",
            subtitle
            or "Descriptive Churn Risk Tiers are rule-based segments — NOT predictive probabilities",
            h=title_h,
        )
        gutter = 1000
        gap = 600
        avail_w = 100000 - 2 * gutter
        half = (avail_w - gap) // 2
        y = title_h
        filter_y = 83500

        # sheet_names: RiskCount, RiskRate, Payment, ChargeBand
        # Clean 2x2 — SegmentVolume / Scenario omitted (empty Text-BAN panels).
        row_budget = filter_y - y - gap
        row1_h = row_budget // 2
        row2_h = row_budget - row1_h
        add_titled_sheet(
            root,
            zone_ids,
            gutter,
            y,
            half,
            row1_h,
            sheet_names[0],
            DB3_CHART_TITLES[sheet_names[0]],
        )
        add_titled_sheet(
            root,
            zone_ids,
            gutter + half + gap,
            y,
            avail_w - half - gap,
            row1_h,
            sheet_names[1],
            DB3_CHART_TITLES[sheet_names[1]],
        )

        row2_y = y + row1_h + gap
        add_titled_sheet(
            root,
            zone_ids,
            gutter,
            row2_y,
            half,
            row2_h,
            sheet_names[2],
            DB3_CHART_TITLES[sheet_names[2]],
        )
        add_titled_sheet(
            root,
            zone_ids,
            gutter + half + gap,
            row2_y,
            avail_w - half - gap,
            row2_h,
            sheet_names[3],
            DB3_CHART_TITLES[sheet_names[3]],
        )

        if filters:
            filter_owners = {
                "Descriptive Churn Risk Tier": "WS_D3_RiskTierCount",
                "Contract": "WS_D3_RiskTierCount",
            }
            filter_h = 6000
            filter_w = avail_w // len(filters)
            filter_flow = add_layout_flow(
                root, zone_ids, gutter, filter_y, avail_w, filter_h, "horz"
            )
            for i, flt in enumerate(filters):
                add_filter_zone(
                    filter_flow,
                    zone_ids,
                    i * filter_w,
                    0,
                    filter_w if i < len(filters) - 1 else avail_w - i * filter_w,
                    filter_h,
                    flt,
                    filter_owners.get(flt, sheet_names[0]),
                )

        footer_text = footer or (
            "Risk tiers are rule-based descriptive segments from Phase 4 SQL logic. "
            "Scenario figures are illustrative only."
        )
        add_zone(
            root,
            zone_ids,
            gutter,
            91000,
            avail_w,
            7000,
            "text",
            text=footer_text,
            text_style={"fontsize": "10", "fontcolor": MUTED_INK, "fontname": "Tableau Regular"},
        )

    return dash


def build_worksheet_window(name: str, hidden: bool = True) -> ET.Element:
    w = ET.Element("window")
    w.set("class", "worksheet")
    if hidden:
        w.set("hidden", "true")
    w.set("name", name)
    cards = ET.SubElement(w, "cards")
    for edge_name in ("left", "top", "right", "bottom"):
        edge = ET.SubElement(cards, "edge")
        edge.set("name", edge_name)
        strip = ET.SubElement(edge, "strip")
        strip.set("size", "0")
    # Genuine Tableau worksheet windows always include a viewpoint node
    # (PerformanceRecording_new.twb / Superstore.twb).
    ET.SubElement(w, "viewpoint")
    return w


def build_dashboard_window(
    name: str,
    sheet_names: list[str],
    maximized: bool = False,
) -> ET.Element:
    """Build a dashboard window with viewpoints for each embedded worksheet.

    Genuine Tableau Public TWBs (PerformanceRecording_new.twb, Superstore.twb)
    list one <viewpoint name="SheetName"/> per dashboard sheet zone. Emitting the
    dashboard's own name instead leaves sheets without a visual representation
    (runtime error 2805CF18).
    """
    w = ET.Element("window")
    w.set("class", "dashboard")
    if maximized:
        w.set("maximized", "true")
    w.set("name", name)
    viewpoints = ET.SubElement(w, "viewpoints")
    seen: set[str] = set()
    for sheet in sheet_names:
        if sheet in seen:
            continue
        seen.add(sheet)
        vp = ET.SubElement(viewpoints, "viewpoint")
        vp.set("name", sheet)
    active = ET.SubElement(w, "active")
    active.set("id", "-1")
    return w


def build_windows() -> ET.Element:
    windows = ET.Element("windows")
    for i, (dash_name, sheets) in enumerate(DASHBOARDS.items()):
        # Only the first dashboard is maximized, matching Superstore Overview.
        windows.append(build_dashboard_window(dash_name, sheets, maximized=(i == 0)))
    for ws in WORKSHEETS:
        windows.append(build_worksheet_window(ws, hidden=True))
    return windows


def build_workbook() -> ET.Element:
    root = ET.Element("workbook")
    root.set("locale", "en_US")
    root.set("original-version", "18.1")
    root.set("source-build", "2022.3.0")
    root.set("source-platform", "mac")
    root.set("version", "18.1")
    root.set("{http://www.w3.org/XML/1998/namespace}base", "http://www.tableausoftware.com/xml/workbook")
    root.set("xmlns:user", "http://www.tableausoftware.com/xml/user")

    prefs = ET.SubElement(root, "preferences")
    pref = ET.SubElement(prefs, "preference")
    pref.set("name", "ui.encoding.shelf.height")
    pref.set("value", "24")

    dss = ET.SubElement(root, "datasources")
    dss.append(build_datasource(infer_columns()))

    wss = ET.SubElement(root, "worksheets")
    for ws in build_all_worksheets():
        wss.append(ws)

    zone_ids = ZoneIdCounter()
    dashboards = ET.SubElement(root, "dashboards")
    dashboards.append(build_dashboard(
        "DB1 Executive Churn Overview",
        DASHBOARDS["DB1 Executive Churn Overview"],
        zone_ids,
    ))
    dashboards.append(build_dashboard(
        "DB2 Churn Drivers & Segments",
        DASHBOARDS["DB2 Churn Drivers & Segments"],
        zone_ids,
        filters=["Contract", "Tenure_Band", "Internet Type", "Offer Group"],
    ))
    dashboards.append(build_dashboard(
        "DB3 Retention Opportunities",
        DASHBOARDS["DB3 Retention Opportunities"],
        zone_ids,
        filters=["Descriptive Churn Risk Tier", "Contract"],
    ))

    root.append(build_windows())
    return root


def main() -> None:
    TABLEAU_DIR.mkdir(parents=True, exist_ok=True)
    build_hyper_extract()
    if OUTPUT_TWB.exists():
        OUTPUT_TWB.replace(BACKUP_TWB)

    root = build_workbook()
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(
        OUTPUT_TWB,
        encoding="utf-8",
        xml_declaration=True,
        short_empty_elements=False,
    )
    twbx = package_twbx()
    print(f"Generated: {OUTPUT_TWB}")
    print(f"Packaged:  {twbx}")
    if BACKUP_TWB.exists():
        print(f"Backup: {BACKUP_TWB}")


if __name__ == "__main__":
    main()
