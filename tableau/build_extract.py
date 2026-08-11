#!/usr/bin/env python3
"""Build a Tableau Hyper extract from customers_clean.csv.

Tableau Public requires extract-backed datasources (error 3C242D89). This script
creates Extract.Extract in a .hyper file using the same packaging layout as the
bundled World Indicators sample:

  Data/<Datasource Caption>/<Datasource Caption>.hyper
"""

from __future__ import annotations

import csv
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "processed" / "customers_clean.csv"
TABLEAU_DIR = PROJECT_ROOT / "tableau"
HYPER_DIR = TABLEAU_DIR / "Data" / "Customer Churn"
HYPER_PATH = HYPER_DIR / "Customer Churn.hyper"

# Keep column typing aligned with generate_workbook.infer_columns().
INT_COLS = {
    "Age", "Number of Dependents", "Number of Referrals", "Tenure in Months",
    "Is_Churned", "Is_Retained", "Flag_Negative_Monthly_Charge",
    "Add_On_Count", "Zip_Population",
}
REAL_COLS = {
    "Latitude", "Longitude", "Avg Monthly Long Distance Charges",
    "Avg Monthly GB Download", "Monthly Charge", "Total Charges",
    "Total Refunds", "Total Extra Data Charges", "Total Long Distance Charges",
    "Total Revenue",
}


def _sql_type_for(column: str):
    from tableauhyperapi import SqlType

    if column in INT_COLS:
        return SqlType.big_int()
    if column in REAL_COLS:
        return SqlType.double()
    return SqlType.text()


def _normalize_value(column: str, value: str):
    """Map CSV sentinels to Hyper NULL for typed numeric columns.

    The cleaned CSV uses 'N/A' / '' in some measure fields (e.g. long-distance
    charges when Phone Service is No). String dimensions keep literal 'N/A'.
    """
    if column in INT_COLS:
        if value in ("", "N/A"):
            return None
        return int(float(value))
    if column in REAL_COLS:
        if value in ("", "N/A"):
            return None
        return float(value)
    return value


# Physical mark-safe dimensions for worksheets that blank on raw Offer /
# Charge_Band members in Tableau Public (axes present, zero bars). These are
# extract columns — not Tableau calculations — so sheets can match the working
# Contract / Payment Method base-dimension pattern exactly.
OFFER_GROUP_COL = "Offer Group"
CHARGE_BAND_COL = "Charge Band"
CHARGE_BAND_SAFE = {
    "$70-89": "70-89",
    "$90+": "90+",
    "$50-69": "50-69",
    "$30-49": "30-49",
    "Low (<$30)": "Low (under 30)",
    "Credit (<$0)": "Credit (under 0)",
}


def _derived_dimensions(header: list[str], row: list) -> list[tuple[str, str]]:
    """Return extra (column_name, value) pairs appended to each extract row."""
    by_name = dict(zip(header, row))
    offer = by_name.get("Offer", "")
    offer_group = "No Offer" if offer == "None" else offer
    charge_raw = by_name.get("Charge_Band", "")
    charge_band = CHARGE_BAND_SAFE.get(charge_raw, charge_raw)
    return [
        (OFFER_GROUP_COL, offer_group),
        (CHARGE_BAND_COL, charge_band),
    ]


def build_hyper_extract(
    csv_path: Path = CSV_PATH,
    hyper_path: Path = HYPER_PATH,
) -> Path:
    try:
        from tableauhyperapi import (
            Connection,
            CreateMode,
            HyperProcess,
            Inserter,
            Nullability,
            TableDefinition,
            TableName,
            Telemetry,
        )
    except ImportError as exc:
        raise SystemExit(
            "tableauhyperapi is required to build the Tableau Public extract.\n"
            "Install with: python3 -m pip install -r tableau/requirements.txt"
        ) from exc

    if not csv_path.exists():
        raise FileNotFoundError(f"Missing source CSV: {csv_path}")

    with csv_path.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = []
        for raw in reader:
            base = [_normalize_value(col, val) for col, val in zip(header, raw)]
            derived = _derived_dimensions(header, raw)
            # Append derived string dimensions after CSV columns.
            rows.append(base + [value for _name, value in derived])
        extract_header = header + [OFFER_GROUP_COL, CHARGE_BAND_COL]

    hyper_path.parent.mkdir(parents=True, exist_ok=True)
    if hyper_path.exists():
        hyper_path.unlink()

    table_def = TableDefinition(
        table_name=TableName("Extract", "Extract"),
        columns=[
            TableDefinition.Column(col, _sql_type_for(col), Nullability.NULLABLE)
            for col in extract_header
        ],
    )

    log_dir = Path(tempfile.mkdtemp(prefix="churn_hyper_"))
    process_parameters = {
        "log_dir": str(log_dir),
        "log_file_max_count": "2",
        "log_file_size_limit": "5M",
    }
    with HyperProcess(
        telemetry=Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU,
        parameters=process_parameters,
    ) as hyper:
        with Connection(
            endpoint=hyper.endpoint,
            database=hyper_path,
            create_mode=CreateMode.CREATE_AND_REPLACE,
        ) as connection:
            connection.catalog.create_schema("Extract")
            connection.catalog.create_table(table_def)
            with Inserter(connection, table_def) as inserter:
                inserter.add_rows(rows)
                inserter.execute()

    row_count = len(rows)
    if row_count != 7043:
        print(f"WARNING: expected 7043 rows, loaded {row_count}", file=sys.stderr)
    print(f"Extract built: {hyper_path} ({row_count} rows)")
    return hyper_path


def main() -> int:
    build_hyper_extract()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
