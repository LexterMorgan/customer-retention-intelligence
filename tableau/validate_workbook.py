#!/usr/bin/env python3
"""Static validation of generated Tableau TWB."""

from __future__ import annotations

import re
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

TABLEAU_DIR = Path(__file__).resolve().parent
TWB = TABLEAU_DIR / "customer_churn_dashboard.twb"
TWBX = TABLEAU_DIR / "customer_churn_dashboard.twbx"
HYPER_PATH = TABLEAU_DIR / "Data" / "Customer Churn" / "Customer Churn.hyper"
HYPER_DBNAME = "Data/Customer Churn/Customer Churn.hyper"

EXPECTED_WORKSHEETS = {
    "WS_D1_TotalCustomers", "WS_D1_ExistingCustomers", "WS_D1_Churned",
    "WS_D1_Retained", "WS_D1_ChurnRate", "WS_D1_RetentionRate", "WS_D1_MRVL",
    "WS_D1_StatusComposition", "WS_D1_ChurnByContract", "WS_D1_ChurnByTenure",
    "WS_D1_ChurnByInternet", "WS_D2_CalloutHighRisk", "WS_D2_CalloutCompetitor",
    "WS_D2_CalloutM2M", "WS_D2_ChurnCategory", "WS_D2_TopReasons",
    "WS_D2_ContractTenureHeatmap", "WS_D2_PrioritySegments", "WS_D2_ChurnByOffer",
    "WS_D3_RiskTierCount", "WS_D3_RiskTierChurnRate", "WS_D3_SegmentVolume",
    "WS_D3_Scenario", "WS_D3_PaymentMethod", "WS_D3_ChargeBand",
}

EXPECTED_DASHBOARDS = {
    "DB1 Executive Churn Overview",
    "DB2 Churn Drivers & Segments",
    "DB3 Retention Opportunities",
}

REQUIRED_CALCS = {
    "Share of Internet Churn",
    "Churn Rate",
    "Descriptive Churn Risk Tier",
    "Risk Points",
}

FIELD_REF_RE = re.compile(
    r"\[federated\.[^.]+\]\.\[(\w+):([^:\]]+):(\w+)\]"
)


VALID_COLUMN_INSTANCE_DERIVATIONS = {
    "None", "Sum", "Count", "User", "Attribute", "Min", "Max", "Average", "CountD",
    "Median", "StdDev", "StdDevP", "Var", "VarP",
}
INVALID_COLUMN_INSTANCE_DERIVATIONS = {"Usr", "Cnt", "Attr"}


def validate_column_instance_derivations(root: ET.Element) -> tuple[bool, list[str]]:
    issues: list[str] = []
    for ci in root.findall(".//column-instance"):
        derivation = ci.get("derivation", "")
        name = ci.get("name", "?")
        if derivation in INVALID_COLUMN_INSTANCE_DERIVATIONS:
            issues.append(f"{name}: invalid derivation '{derivation}'")
        elif derivation and derivation not in VALID_COLUMN_INSTANCE_DERIVATIONS:
            issues.append(f"{name}: unknown derivation '{derivation}'")
    return not issues, issues


FILTER_COLUMN_RE = re.compile(r"\[federated\.[^.]+\]\.(\[[^\]]+\])")
FILTER_INSTANCE_REF_RE = re.compile(
    r"\[federated\.[^.]+\]\.\[(\w+):([^:\]]+):(\w+)\]"
)


def validate_filter_instances(root: ET.Element) -> tuple[bool, list[str]]:
    issues: list[str] = []
    for ws in root.findall(".//worksheets/worksheet"):
        ws_name = ws.get("name", "?")
        deps = ws.find(".//datasource-dependencies")
        if deps is None:
            continue
        columns = {
            col.get("name"): col
            for col in deps.findall("column")
            if col.get("name")
        }
        for flt in ws.findall(".//filter"):
            col_ref = flt.get("column", "")
            if FILTER_INSTANCE_REF_RE.search(col_ref):
                issues.append(f"{ws_name}: filter uses instance ref (expected direct column): {col_ref}")
                continue
            col_match = FILTER_COLUMN_RE.match(col_ref)
            if not col_match:
                continue
            column_name = col_match.group(1)
            if column_name not in columns:
                issues.append(f"{ws_name}: filter column undefined in deps: {column_name}")
                continue
            datatype = columns[column_name].get("datatype", "string")
            gf = flt.find("groupfilter")
            if gf is not None and gf.get("function") == "member":
                level = gf.get("level", "")
                if level != column_name:
                    issues.append(
                        f"{ws_name}: groupfilter level {level!r} != filter column {column_name!r}"
                    )
                member = gf.get("member", "")
                # Double-escaped entities parse as &quot;value&quot; and Tableau
                # Public reports "Error parsing filter for field ...".
                if member.startswith("&quot;") or member.endswith("&quot;"):
                    issues.append(
                        f"{ws_name}: groupfilter member is entity-escaped "
                        f"(double-escaped XML): {member!r}"
                    )
                    continue
                if datatype == "boolean":
                    # Superstore boolean calc filters use bare true/false.
                    if member not in {"true", "false"}:
                        issues.append(
                            f"{ws_name}: boolean filter member must be bare "
                            f"true/false, got {member!r}"
                        )
                elif not (member.startswith('"') and member.endswith('"') and len(member) >= 2):
                    issues.append(
                        f"{ws_name}: string filter member must be quote-wrapped "
                        f'literal like "value", got {member!r}'
                    )
    return not issues, issues


def validate_filter_member_raw_xml(raw: str) -> tuple[bool, list[str]]:
    """Catch malformed filter members in raw TWB XML before parse normalization."""
    issues: list[str] = []
    if 'member="&amp;quot;' in raw or "member='&amp;quot;" in raw:
        issues.append(
            'raw XML contains double-escaped filter members '
            '(member="&amp;quot;..."); expected member="&quot;..."'
        )
    # Boolean members must be bare true/false, not quote-wrapped "true".
    # Superstore Order Profitable?: member='true' / member='false'
    if 'member="&quot;true&quot;"' in raw or 'member="&quot;false&quot;"' in raw:
        issues.append(
            'raw XML quote-wraps boolean filter members '
            '(member="&quot;true&quot;"); expected bare member="true"'
        )
    return not issues, issues


def validate_extract_datasource(root: ET.Element) -> tuple[bool, list[str]]:
    """Tableau Public requires extract-backed datasources (error 3C242D89).

    Genuine Public sample (World Indicators): connection class='hyper' pointing at
    Data/<caption>/<caption>.hyper with relation table='[Extract].[Extract]'.
    """
    issues: list[str] = []
    if root.find(".//connection[@class='textscan']") is not None:
        issues.append(
            "datasource still uses live textscan connection; "
            "Tableau Public requires a Hyper extract"
        )

    hyper_conns = root.findall(".//connection[@class='hyper']")
    if not hyper_conns:
        issues.append("missing connection class='hyper'")
    else:
        dbnames = {c.get("dbname") for c in hyper_conns}
        if HYPER_DBNAME not in dbnames:
            issues.append(
                f"hyper dbname must be {HYPER_DBNAME!r}, found {sorted(dbnames)}"
            )

    relations = root.findall(".//relation")
    if not any(r.get("table") == "[Extract].[Extract]" for r in relations):
        issues.append("missing relation table='[Extract].[Extract]'")

    if not HYPER_PATH.exists():
        issues.append(f"missing extract file: {HYPER_PATH}")
    elif HYPER_PATH.stat().st_size < 1024:
        issues.append(f"extract file looks empty: {HYPER_PATH}")

    if not TWBX.exists():
        issues.append(f"missing packaged workbook: {TWBX}")
    else:
        import zipfile

        with zipfile.ZipFile(TWBX) as zf:
            names = set(zf.namelist())
            if TWB.name not in names:
                issues.append(f"{TWBX.name} missing {TWB.name}")
            if HYPER_DBNAME not in names:
                issues.append(f"{TWBX.name} missing {HYPER_DBNAME}")

    return not issues, issues


def validate_worksheet_renderability(root: ET.Element) -> tuple[bool, list[str]]:
    """Catch structural defects that blank worksheets in Tableau Public.

    Known-good controls (WS_D1_StatusComposition, WS_D2_TopReasons):
      - shelves resolve to declared column-instances
      - filters use base string dimensions (Customer Status), not boolean calcs
      - aggregate calc formulas only reference fields present in worksheet deps

    Superstore Profit Ratio embeds sum([Profit])/sum([Sales]) and lists Profit
    and Sales beside the calc in datasource-dependencies. Missing those deps
    (or nested calc captions) yields empty marks with no parser error.
    """
    issues: list[str] = []
    ds_formulas: dict[str, str] = {}
    for col in root.findall(".//datasources/datasource/column"):
        name = col.get("name")
        if not name:
            continue
        calc = col.find("calculation")
        if calc is not None:
            ds_formulas[name] = calc.get("formula", "")

    agg_re = re.compile(
        r"\b(SUM|AVG|AVERAGE|MIN|MAX|COUNT|COUNTD|ATTR)\s*\(", re.IGNORECASE
    )
    bracket_re = re.compile(r"\[([^\]]+)\]")

    for ws in root.findall(".//worksheets/worksheet"):
        ws_name = ws.get("name", "?")
        deps = ws.find(".//datasource-dependencies")
        if deps is None:
            issues.append(f"{ws_name}: missing datasource-dependencies")
            continue

        columns = {col.get("name"): col for col in deps.findall("column") if col.get("name")}
        dep_captions = {
            col.get("caption") or col.get("name", "").strip("[]")
            for col in deps.findall("column")
        }
        dep_names = set(columns)
        instances = {
            ci.get("name"): ci for ci in deps.findall("column-instance") if ci.get("name")
        }

        if "Measure Names" in (c.get("caption") for c in deps.findall("column")):
            issues.append(f"{ws_name}: fabricated Measure Names shelf is not renderable")

        mark = ws.find(".//mark")
        mark_class = mark.get("class") if mark is not None else ""
        rows_text = (ws.findtext(".//rows") or "").strip()
        cols_text = (ws.findtext(".//cols") or "").strip()
        if mark_class == "Text" and not rows_text and not cols_text:
            issues.append(
                f"{ws_name}: Text mark has empty rows and cols "
                "(Tableau Public shows no marks; put the text measure on cols)"
            )

        for filt in ws.findall(".//filter"):
            fcol = filt.get("column", "")
            members = [
                gf.get("member")
                for gf in filt.iter("groupfilter")
                if gf.get("member") is not None
            ]
            # Boolean calc filters: column is a Calculation_* (direct or instance)
            # and members are bare true/false. Known-good sheets use string dims.
            is_calc_filter = "Calculation_" in fcol
            bool_members = {m for m in members if m in ("true", "false")}
            if is_calc_filter and bool_members:
                issues.append(
                    f"{ws_name}: boolean calculated-field filter on {fcol} "
                    "(use Customer Status / Internet Type string filters instead)"
                )

        for ci in deps.findall("column-instance"):
            col_name = ci.get("column", "")
            inst_name = ci.get("name", "")
            derivation = ci.get("derivation", "")
            if col_name not in columns:
                issues.append(
                    f"{ws_name}: column-instance {inst_name} references "
                    f"undefined deps column {col_name}"
                )
                continue
            col_el = columns[col_name]
            # Calculated columns must carry their formula in worksheet deps.
            if col_name.startswith("[Calculation_"):
                if col_el.find("calculation") is None:
                    issues.append(
                        f"{ws_name}: calc column {col_name} missing embedded <calculation>"
                    )
                if f":{col_name.strip('[]')}:" not in inst_name:
                    issues.append(
                        f"{ws_name}: calc instance name must use Calculation_* token, "
                        f"got {inst_name}"
                    )
                formula = ""
                calc_el = col_el.find("calculation")
                if calc_el is not None:
                    formula = calc_el.get("formula", "")
                if not formula:
                    formula = ds_formulas.get(col_name, "")
                if formula and agg_re.search(formula) and derivation == "Sum":
                    issues.append(
                        f"{ws_name}: aggregate calc {col_name} uses derivation=Sum; "
                        "expected User (usr:)"
                    )
                # Every [Field] in the embedded formula must resolve in worksheet deps.
                for token in bracket_re.findall(formula):
                    as_name = f"[{token}]"
                    if as_name in dep_names or token in dep_captions:
                        continue
                    # Allow unresolved only if it is another calc caption present via
                    # caption map — still require it in deps.
                    issues.append(
                        f"{ws_name}: calc {col_el.get('caption') or col_name} formula "
                        f"references [{token}] missing from worksheet deps"
                    )

        # Encoding / shelf refs must point at defined instances.
        for attr_el in ws.findall(".//encodings/*"):
            ref = attr_el.get("column", "")
            m = re.search(r"\[(federated\.[^\]]+)\]\.(\[[^\]]+\])", ref)
            if not m:
                continue
            inst = m.group(2)
            if inst not in instances:
                issues.append(f"{ws_name}: encoding refs undefined instance {inst}")

        for shelf in ("rows", "cols"):
            text = ws.findtext(f".//{shelf}") or ""
            for inst in re.findall(r"\[federated\.[^\]]+\]\.(\[[^\]]+\])", text):
                if inst not in instances:
                    issues.append(f"{ws_name}: {shelf} refs undefined instance {inst}")

    return not issues, issues


def validate_dashboard_layout(root: ET.Element) -> tuple[bool, list[str]]:
    """Ensure dashboard zones fit the 100000×100000 layout coordinate space."""
    issues: list[str] = []
    for dash in root.findall(".//dashboards/dashboard"):
        dname = dash.get("name", "?")
        for z in dash.findall(".//zone"):
            x = int(z.get("x", 0))
            y = int(z.get("y", 0))
            w = int(z.get("w", 0))
            h = int(z.get("h", 0))
            right = x + w
            bottom = y + h
            if right > 100000 or bottom > 100000:
                label = z.get("name") or z.get("param") or z.get("type") or z.get("id")
                issues.append(
                    f"{dname}: zone {label!r} overflows layout "
                    f"(x={x}, y={y}, w={w}, h={h}, bottom={bottom}, right={right})"
                )
    return not issues, issues


def validate_dashboard_filters(root: ET.Element) -> tuple[bool, list[str]]:
    """Dashboard filter cards must use federated column-instance params.

    Bare captions (param='Offer') are accepted by Tableau but can blank the
    sheet that uses that field (axes, no marks). PerformanceRecording uses
    param='[Datasource].[none:Field:nk]' plus an owning worksheet name.
    """
    issues: list[str] = []
    for dash in root.findall(".//dashboards/dashboard"):
        dname = dash.get("name", "?")
        for z in dash.findall(".//zone[@type='filter']"):
            param = z.get("param", "")
            owner = z.get("name", "")
            if not owner:
                issues.append(f"{dname}: filter zone missing owning worksheet name")
            if not re.search(r"\[federated\.[^\]]+\]\.\[none:[^\]]+:nk\]", param):
                issues.append(
                    f"{dname}: filter param must be federated none: instance ref, "
                    f"got {param!r}"
                )
    return not issues, issues


def validate_no_worksheet_title_children(root: ET.Element) -> tuple[bool, list[str]]:
    """Reject worksheet-level <title> children (Tableau D2E8DA72).

    Worksheet content model is (((layout-options?)|(repository-location?)),table).
    A direct <title> under <worksheet> is undeclared and blocks Tableau Public open.
    """
    issues: list[str] = []
    for ws in root.findall("./worksheets/worksheet"):
        for child in list(ws):
            if child.tag == "title":
                issues.append(
                    f"worksheet {ws.get('name')!r}: invalid direct child <title> "
                    "(D2E8DA72; content model allows table only after optional "
                    "layout-options/repository-location)"
                )
    return not issues, issues


def validate_dashboard_viewpoints(root: ET.Element) -> tuple[bool, list[str]]:
    """Ensure each dashboard sheet zone has a matching window viewpoint.

    Tableau Public error 2805CF18: "Dashboard references sheet 'X' which has no
    visual representation in the workbook." Genuine TWBs list embedded worksheet
    names under window[@class='dashboard']/viewpoints/viewpoint — not the
    dashboard name itself.
    """
    issues: list[str] = []
    dash_windows = {
        w.get("name"): w
        for w in root.findall(".//windows/window[@class='dashboard']")
    }
    for dash in root.findall(".//dashboards/dashboard"):
        dname = dash.get("name", "?")
        zone_sheets = [
            z.get("name")
            for z in dash.findall(".//zone")
            if z.get("name") and z.get("type") is None
        ]
        win = dash_windows.get(dname)
        if win is None:
            issues.append(f"{dname}: missing dashboard window")
            continue
        viewpoints = {
            vp.get("name")
            for vp in win.findall("./viewpoints/viewpoint")
            if vp.get("name")
        }
        if dname in viewpoints:
            issues.append(
                f"{dname}: viewpoint uses dashboard name {dname!r} "
                "(expected embedded worksheet names)"
            )
        for sheet in zone_sheets:
            if sheet not in viewpoints:
                issues.append(
                    f"{dname}: sheet zone {sheet!r} has no viewpoint "
                    "(no visual representation)"
                )
    # Worksheet windows should include a viewpoint node.
    for w in root.findall(".//windows/window[@class='worksheet']"):
        if w.find("viewpoint") is None:
            issues.append(
                f"worksheet window {w.get('name')!r}: missing <viewpoint> node"
            )
    return not issues, issues


def main() -> int:
    results = {}
    if not TWB.exists():
        print(f"FAIL: missing {TWB}")
        return 1

    try:
        tree = ET.parse(TWB)
        root = tree.getroot()
        results["xml_parse"] = True
    except ET.ParseError as e:
        print(f"FAIL xml parse: {e}")
        return 1

    worksheets = {ws.get("name") for ws in root.findall(".//worksheets/worksheet")}
    dashboards = {d.get("name") for d in root.findall(".//dashboards/dashboard")}
    dash_ws_refs = {
        z.get("name")
        for z in root.findall(".//dashboard//zone")
        if z.get("name") and z.get("type") is None
    }

    missing_ws = EXPECTED_WORKSHEETS - worksheets
    missing_db = EXPECTED_DASHBOARDS - dashboards
    missing_refs = dash_ws_refs - worksheets

    results["worksheets"] = not missing_ws and len(worksheets) >= 25
    results["dashboards"] = not missing_db
    results["dash_refs"] = not missing_refs

    captions = set()
    formulas = {}
    for col in root.findall(".//datasource/column"):
        cap = col.get("caption")
        if cap:
            captions.add(cap)
        calc = col.find("calculation")
        if calc is not None and cap:
            formulas[cap] = calc.get("formula", "")

    results["calcs"] = REQUIRED_CALCS.issubset(captions)
    share_formula = formulas.get("Share of Internet Churn", "")
    # Prefer base Is_Churned over nested [Churned Count] so worksheet-local
    # formulas do not depend on other calculated fields.
    results["share_internet_fix"] = (
        "Internet Type" in share_formula
        and (
            ("Is_Churned" in share_formula)
            or ("Churned Count" in share_formula and "Customer Status" in share_formula)
        )
        and "Churned Customer Flag" not in share_formula.split("/")[-1]
    )

    extract_ok, extract_issues = validate_extract_datasource(root)
    results["extract_datasource"] = extract_ok

    all_fields = captions | {c.get("name", "").strip("[]") for c in root.findall(".//column[@name]")}
    field_pat = re.compile(r"\[([^\]]+)\]")
    referenced = set()
    for el in root.iter():
        for attr in ("column", "formula"):
            val = el.get(attr)
            if val:
                for m in field_pat.findall(val):
                    if not m.startswith("federated.") and not m.startswith("Calculation_"):
                        if ":" in m:
                            referenced.add(m.split(":", 1)[-1].split(":")[0])
                        else:
                            referenced.add(m)

    # calc dependencies from formulas
    calc_deps_ok = True
    for cap, formula in formulas.items():
        for dep in re.findall(r"\[([^\]]+)\]", formula):
            if dep not in captions and dep not in {
                c.get("caption") for c in root.findall(".//datasource/column[@caption]")
            }:
                # allow base columns
                base_cols = {c.get("caption") for c in root.findall(".//datasource/column[@caption]")}
                if dep not in base_cols:
                    calc_deps_ok = False

    results["calc_deps"] = calc_deps_ok

    filter_instances_ok, filter_issues = validate_filter_instances(root)
    results["filter_instances"] = filter_instances_ok

    ci_derivations_ok, ci_derivation_issues = validate_column_instance_derivations(root)
    results["column_instance_derivations"] = ci_derivations_ok

    viewpoint_ok, viewpoint_issues = validate_dashboard_viewpoints(root)
    results["dashboard_viewpoints"] = viewpoint_ok

    layout_ok, layout_issues = validate_dashboard_layout(root)
    results["dashboard_layout"] = layout_ok

    dash_filter_ok, dash_filter_issues = validate_dashboard_filters(root)
    results["dashboard_filters"] = dash_filter_ok

    render_ok, render_issues = validate_worksheet_renderability(root)
    results["worksheet_renderability"] = render_ok

    ws_title_ok, ws_title_issues = validate_no_worksheet_title_children(root)
    results["no_worksheet_title_children"] = ws_title_ok

    dup_ws = len(worksheets) != len(root.findall(".//worksheets/worksheet"))
    dup_db = len(dashboards) != len(root.findall(".//dashboards/dashboard"))
    results["no_dupes"] = not dup_ws and not dup_db

    raw = TWB.read_text(encoding="utf-8")
    filter_raw_ok, filter_raw_issues = validate_filter_member_raw_xml(raw)
    results["filter_member_escaping"] = filter_raw_ok
    filter_issues = filter_issues + filter_raw_issues

    forbidden = {
        "selection-relaxation": "selection-relaxation" in raw,
        "simple-id": "<simple-id" in raw,
        "viz_zone_type": 'type="viz"' in raw,
        "worksheet_zone_type": 'type="worksheet"' in raw,
        "sheet_zone_type": 'type="sheet"' in raw,
        "windows_source_width": "source-width" in raw,
        "invalid_action_target": "<target " in raw,
        "uuid_zone_id": bool(re.search(r'id="[0-9a-f]{8}-', raw)),
        "double_escaped_filter_member": 'member="&amp;quot;' in raw or "member='&amp;quot;" in raw,
    }
    results["schema_patterns"] = not any(forbidden.values())

    print("VALIDATION RESULTS")
    for k, v in results.items():
        print(f"  {k}: {'PASS' if v else 'FAIL'}")
    if forbidden:
        print("  forbidden pattern scan:")
        for k, found in forbidden.items():
            print(f"    {k}: {'FOUND' if found else 'absent'}")
    if missing_ws:
        print("  missing worksheets:", sorted(missing_ws))
    if missing_refs:
        print("  broken dash refs:", sorted(missing_refs))
    if not results["share_internet_fix"]:
        print("  share formula:", share_formula)
    if filter_issues:
        print("  dangling filter field refs:")
        for issue in filter_issues:
            print(f"    {issue}")
    if ci_derivation_issues:
        print("  invalid column-instance derivations:")
        for issue in ci_derivation_issues:
            print(f"    {issue}")
    if viewpoint_issues:
        print("  dashboard viewpoint issues:")
        for issue in viewpoint_issues:
            print(f"    {issue}")
    if layout_issues:
        print("  dashboard layout issues:")
        for issue in layout_issues:
            print(f"    {issue}")
    if dash_filter_issues:
        print("  dashboard filter issues:")
        for issue in dash_filter_issues:
            print(f"    {issue}")
    if render_issues:
        print("  worksheet renderability issues:")
        for issue in render_issues:
            print(f"    {issue}")
    if ws_title_issues:
        print("  invalid worksheet <title> children (D2E8DA72):")
        for issue in ws_title_issues:
            print(f"    {issue}")
    if extract_issues:
        print("  extract datasource issues:")
        for issue in extract_issues:
            print(f"    {issue}")

    failed = [k for k, v in results.items() if not v]
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
