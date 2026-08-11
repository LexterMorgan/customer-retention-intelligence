# Excel BI Dashboard Product Requirements Document

**Project:** Customer Retention Intelligence  
**Deliverable:** One polished, interactive Excel dashboard workbook  
**Phase:** Repository audit and product requirements only  
**Status:** Approved for build planning only after review of the open issue in Section 20  
**Analytical snapshot:** Q2 2022 California telecom customers

---

## 1. Objective

Create one portfolio-grade Excel BI dashboard that presents the established churn and retention analysis as a coherent executive application.

The dashboard must answer, in order:

1. How serious is churn?
2. Where is churn concentrated?
3. What customer characteristics and stated reasons are associated with churn?
4. Which descriptive customer segments deserve retention attention?

The workbook must demonstrate Excel-specific BI capability through native PivotTables, PivotCharts, slicers, shared report connections, coordinated filtering, structured formulas, and a clean application-like presentation. It must complement the existing Tableau deliverable rather than reproduce every Tableau view.

Correctness and working interactivity take precedence over visual polish.

---

## 2. Scope

### In scope

- One presentation sheet containing the complete dashboard experience.
- A single embedded customer-level source table based on `data/processed/customers_clean.csv`.
- Dynamic KPI cards backed by a slicer-connected PivotTable.
- A compact set of PivotTables and PivotCharts selected for the four-part business story.
- Three coordinated slicers: Contract, Tenure Band, and Internet Type.
- Workbook-only helper fields required for reliable PivotTable calculations.
- Supporting Pivot, calculation/QA, and data sheets kept separate from the presentation.
- Native Excel configuration of PivotTables, PivotCharts, slicers, and report connections.
- Baseline metric and interaction validation.
- Explicit descriptive, non-causal language.

### Product boundary

This PRD defines the workbook product and acceptance criteria. It does not authorize workbook generation, an implementation script, a build plan, source-data changes, or modifications to SQL, Python analysis, or Tableau.

---

## 3. Existing Assets to Reuse

### Canonical data and lineage

- `data/processed/customers_clean.csv` — 7,043 customer-level rows and 46 fields; proposed workbook source.
- `data/raw/telecom_customer_churn.csv` — 7,043 customer-level rows and 38 source fields; lineage/reference only.
- `data/raw/telecom_zipcode_population.csv` — 1,671 ZIP-level lookup rows; already joined into the clean data as `Zip_Population`.
- `data/raw/telecom_data_dictionary.csv` — raw field definitions; reference only.
- `analysis/data_cleaning.py` — authoritative cleaning and derived-field pipeline.
- `docs/churn_definition.md` — cross-tool source of truth for churn and retention definitions.

### Established analysis and metric logic

- `analysis/exploratory_analysis.py`
- `analysis/business_insights.md`
- `sql/01_kpi_overview.sql`
- `sql/02_churn_by_contract.sql`
- `sql/03_churn_by_tenure.sql`
- `sql/04_churn_by_internet.sql`
- `sql/05_churn_by_offer.sql`
- `sql/07_churn_by_billing.sql`
- `sql/08_churn_reasons.sql`
- `sql/09_high_risk_segments.sql`
- `sql/10_customer_risk_ranking.sql`
- `sql/11_business_impact.sql`

### Tableau metric governance to preserve

- `tableau/calculated_fields.md`
- `tableau/validate_tableau_metrics.py`

The Tableau workbook itself is not an Excel template and must not be modified.

### Existing Excel planning

- `excel/workbook_spec.md` — useful metric, scenario, and validation groundwork, but superseded by this PRD for final dashboard scope and architecture.

---

## 4. Source of Truth

### Decision

`data/processed/customers_clean.csv` is the Excel analytical source of truth.

### Evidence

- It is the output of the existing cleaning pipeline, not an independently transformed extract.
- It preserves all 7,043 raw customer rows and one row per unique `Customer ID`.
- It standardizes categorical nulls and preserves the literal Offer value `None`.
- It includes the approved churn flags, analytical bands, quality flag, add-on count, and ZIP population join.
- Existing Python, SQL, Tableau, and Excel documentation already use it.
- Its benchmark KPIs reconcile with the canonical project definitions.

### Source-use rules

- Embed the clean dataset in the workbook as an Excel Table named `tblCustomers`.
- Do not link the final portfolio workbook to a user-specific external CSV path.
- Do not re-run or recreate the cleaning pipeline inside Excel.
- Do not alter or overwrite the processed CSV.
- Raw files are for lineage, dictionary reference, and QA only.
- No field required by the proposed dashboard is missing from the clean dataset. Workbook-only helper fields may be added to the embedded Excel Table without changing the CSV.

---

## 5. Data Fields Available

The clean dataset has 46 columns at one row per customer.

### Identity and demographics

- `Customer ID`
- `Gender`
- `Age`
- `Married`
- `Number of Dependents`
- `Number of Referrals`

### Geography

- `City`
- `Zip Code`
- `Latitude`
- `Longitude`
- `Zip_Population`

### Lifecycle and acquisition

- `Tenure in Months`
- `Tenure_Band`
- `Age_Band`
- `Offer`

### Phone and internet services

- `Phone Service`
- `Avg Monthly Long Distance Charges`
- `Multiple Lines`
- `Internet Service`
- `Internet Type`
- `Avg Monthly GB Download`
- `Online Security`
- `Online Backup`
- `Device Protection Plan`
- `Premium Tech Support`
- `Streaming TV`
- `Streaming Movies`
- `Streaming Music`
- `Unlimited Data`
- `Add_On_Count`

### Contract, billing, and value

- `Contract`
- `Paperless Billing`
- `Payment Method`
- `Monthly Charge`
- `Charge_Band`
- `Total Charges`
- `Total Refunds`
- `Total Extra Data Charges`
- `Total Long Distance Charges`
- `Total Revenue`
- `Flag_Negative_Monthly_Charge`

### Outcome fields

- `Customer Status`
- `Churn Category`
- `Churn Reason`
- `Is_Churned`
- `Is_Retained`

### Important field handling

- `Offer = None` is a valid category, not missing data.
- `Internet Type = N/A` means the customer has no internet service.
- `Churn Category` and `Churn Reason` are populated for churned customers only.
- `Tenure_Band`, `Age_Band`, and `Charge_Band` are established pipeline outputs and must not be recreated with different boundaries.
- All 120 negative monthly-charge rows remain in scope; 114 belong to existing customers and six to Joined customers.

---

## 6. Business Definitions

### Customer populations

- **Total Customers:** all 7,043 customer records.
- **Churned:** `Customer Status = "Churned"`.
- **Retained:** `Customer Status = "Stayed"`.
- **Joined:** `Customer Status = "Joined"`.
- **Existing Customers:** Churned + Stayed.

Joined customers remain in the workbook but are excluded from churn and retention rate denominators.

### Interpretation rules

- Churn and retention findings are descriptive and associational, not causal.
- Churn Category and Churn Reason are self-reported exit themes, not verified causes.
- Descriptive Churn Risk Tiers are rule-based segments, not predictions or individual churn probabilities.
- Total Revenue and Total Charges are historical cumulative measures strongly influenced by tenure.
- Segment definitions may overlap.
- The data is a Q2 2022 snapshot and does not support time-trend analysis.

### Share-of-churn convention

- Default executive share of churn uses all 1,869 churned customers as the denominator.
- Internet-only share of churn uses 1,756 churned internet customers and must be explicitly labeled.
- The proposed dashboard does not require a share-of-churn KPI. If shown in a tooltip or annotation, use the all-churn denominator by default.

---

## 7. KPI Definitions and Formulas

The dashboard will display six primary cards. All cards must respond to the three dashboard slicers.

| KPI card | Definition | Baseline | Pivot-backed calculation |
|---|---|---:|---|
| Existing Customers | Churned + Stayed in current filter context | 6,589 | `SUM(Existing_Flag)` |
| Churned Customers | Churned in current filter context | 1,869 | `SUM(Is_Churned)` |
| Retained Customers | Stayed in current filter context | 4,720 | `SUM(Is_Retained)` |
| Churn Rate | Churned / Existing | 28.37% | `GETPIVOTDATA(Churned) / GETPIVOTDATA(Existing)` |
| Retention Rate | Retained / Existing | 71.63% | `GETPIVOTDATA(Retained) / GETPIVOTDATA(Existing)` |
| Monthly Recurring Value Lost | Sum of Monthly Charge for churned customers | $137,086.65 | `SUM(MRVL_Row)` |

### Secondary context

- Total Customers = 7,043.
- Joined Customers = 454.
- These values may appear as compact context text under the title, not as primary cards.
- Under slicers, secondary values may respond to the current filter context if displayed.

### KPI behavior

- The six cards must be sourced from a hidden/shared-cache KPI PivotTable through `GETPIVOTDATA` or direct cell references to that pivot.
- Formula-only `COUNTIFS` cards disconnected from slicers are not acceptable for the dashboard.
- Division-by-zero results must display an em dash or `N/A`, not an Excel error.
- Baseline display formats: counts with thousands separators, rates at one decimal on cards and two decimals in QA, MRVL as whole-dollar or two-decimal currency according to available space.
- MRVL includes existing negative monthly-charge credits/adjustments because the established project logic does not remove them.

---

## 8. Required Helper/Calculated Fields

These fields may be added only to the embedded `tblCustomers` table or the workbook calculation layer. They must not be added to the source CSV in this phase.

| Helper field | Required logic | Purpose |
|---|---|---|
| `Existing_Flag` | `1` for Churned or Stayed; otherwise `0` | Dynamic denominator and existing-customer counts |
| `Churn_Rate_Value` | `Is_Churned` for existing customers; blank for Joined | `AVERAGE` in PivotTables gives segment churn rate without Joined |
| `Retention_Rate_Value` | `Is_Retained` for existing customers; blank for Joined | Dynamic retention rate |
| `MRVL_Row` | Monthly Charge when Churned; otherwise `0` | Slicer-responsive MRVL |
| `Tenure_Band_Sort` | 1 through 6 in approved lifecycle order | Stable non-alphabetical sorting |
| `Risk_Points` | Approved rule below | Descriptive tier derivation |
| `Descriptive_Churn_Risk_Tier` | Approved thresholds below | Retention-attention view |
| `Risk_Tier_Sort` | Very High 1, High 2, Medium 3, Low 4 | Stable business order |

### Approved risk-point rule

- Month-to-Month contract: +3
- Tenure Band 0–6 months: +3
- Fiber Optic: +2
- Number of Dependents = 0: +1
- Married = No: +1

### Approved risk-tier thresholds

- Very High: 6 or more points
- High: 4–5 points
- Medium: 2–3 points
- Low: 0–1 points

### Validation-only calculation

The Calculations sheet should retain a QA check for the established high-risk intersection:

`Contract = Month-to-Month AND Tenure_Band = 0-6 months AND Internet Type = Fiber Optic`

Baseline: 487 existing customers, 444 churned, 91.17% churn.

This intersection does not require a dashboard field or visual because the Risk Tier component covers the retention-attention stage of the story with broader context.

---

## 9. Final Dashboard Components

### A. Header and filter context

- Compact title: **Customer Churn & Retention**
- Subtitle: **Q2 2022 California Telecom Snapshot**
- Source/filter note: **Rates exclude Joined customers**
- Three slicers aligned in one compact strip.
- A visible “clear filters” instruction; no macro button is required.

### B. KPI row

Six aligned cards in the order:

1. Existing Customers
2. Churned Customers
3. Retained Customers
4. Churn Rate
5. Retention Rate
6. Monthly Recurring Value Lost

The Churn Rate and MRVL cards receive the strongest accent treatment.

### C. Contract × Tenure concentration heatmap

**Question answered:** Where is churn concentrated?

- Native PivotTable with Contract as columns and Tenure Band as rows.
- Value: Average of `Churn_Rate_Value`, formatted as a percentage.
- Approved tenure order, not alphabetical.
- Conditional formatting using one restrained sequential scale.
- A compact paired supporting pivot may show existing-customer counts if it fits without reducing readability.
- Grand totals should be hidden if they make the matrix harder to scan.
- Joined customers are excluded through the blank rate helper.

This replaces separate Contract and Tenure charts because the interaction view communicates both structural dimensions in less space and preserves the strongest established multivariate finding.

### D. Churn Rate by Internet Type

**Question answered:** Which service characteristic is associated with churn?

- Horizontal bar PivotChart.
- Internet customers only; exclude `Internet Type = N/A`.
- Value: Average of `Churn_Rate_Value`.
- Sort descending by churn rate.
- Direct percentage labels; no legend.
- Subtitle or note: **Internet customers only; association, not causation.**

### E. Top 5 Stated Churn Reasons

**Question answered:** What do churned customers say about why they left?

- Horizontal bar PivotChart.
- Internal report filter: `Customer Status = Churned`.
- Rows: Churn Reason.
- Value: Count of Customer ID.
- Top 5 value filter, sorted descending.
- Direct count labels.
- Required note: **Self-reported exit reasons — not verified causes.**

Specific reasons are more actionable than showing both category and reason charts. Churn Category remains available for QA/supporting analysis but is not a second dashboard visual.

### F. Descriptive Churn Risk Tiers

**Question answered:** Which segments deserve retention attention?

- Horizontal bar PivotChart ordered Very High, High, Medium, Low.
- Value: Average of `Churn_Rate_Value`.
- Existing-customer volume displayed as an adjacent compact table or linked labels from the supporting pivot.
- Required label: **Rule-based descriptive tiers — not predictive probabilities.**
- Baseline validation:
  - Very High: 2,156 existing customers, 66.51% churn
  - High: 1,259, 20.65%
  - Medium: 1,714, 7.29%
  - Low: 1,460, 3.42%

### Components retained as support, not dashboard visuals

- Churn Category summary.
- Offer analysis and Offer E context.
- Payment Method and Monthly Charge Band analysis.
- Baseline high-risk intersection QA.

These analyses remain represented by source fields and QA definitions but do not compete for presentation space.

---

## 10. Proposed Slicers

### 1. Contract

- Values: Month-to-Month, One Year, Two Year.
- Business value: tests the strongest structural churn association.
- Controls: all dashboard KPI and visual PivotTables.
- KPI response: yes.
- Reliability: high when all pivots share one source table and pivot cache.
- Limitation: filtering Contract narrows the Contract columns in the heatmap by design.

### 2. Tenure Band

- Values in approved order: 0–6, 7–12, 13–24, 25–36, 37–48, 49–72 months.
- Business value: enables lifecycle exploration and early-tenure focus.
- Controls: all dashboard KPI and visual PivotTables.
- KPI response: yes.
- Reliability: high with a sort helper/manual custom order.
- Limitation: filtering Tenure Band narrows heatmap rows by design.

### 3. Internet Type

- Values: Fiber Optic, Cable, DSL, and N/A.
- Business value: tests the strongest service-type association and its overlap with contract/tenure.
- Controls: all dashboard KPI and visual PivotTables.
- KPI response: yes.
- Reliability: high for shared-cache pivots.
- Limitation: the Internet Type chart is intentionally internet-only. Selecting N/A will produce no bars in that chart while the other components continue to show the no-internet segment. This behavior must be validated and explained in the chart subtitle or tooltip.

### Slicers not selected

- **Offer:** valuable supporting analysis, but Offer E is strongly confounded and a fourth slicer would add clutter.
- **Payment Method:** useful descriptor but lower priority than the three selected dimensions.
- **Customer Status:** excluded because selecting Joined or Stayed can make churn-rate and churn-reason views misleading or empty.
- **Descriptive Risk Tier:** excluded because it is already the final story component and would create circular/self-filtering behavior.
- **Age Band:** contextual, not a top retention-priority dimension.

---

## 11. Slicer → KPI/Chart Connection Matrix

All connected objects must use the same PivotCache based on `tblCustomers`.

| Slicer | KPI cards | Contract × Tenure rate pivot | Paired volume pivot | Internet Type chart | Top 5 Reasons chart | Risk Tier chart/table |
|---|---:|---:|---:|---:|---:|---:|
| Contract | Yes | Yes | Yes | Yes | Yes | Yes |
| Tenure Band | Yes | Yes | Yes | Yes | Yes | Yes |
| Internet Type | Yes | Yes | Yes | Yes | Yes | Yes |

### Connection rules

- The hidden `PT_KPI_Context` PivotTable must be included in every slicer’s Report Connections.
- The reason pivot retains its internal `Customer Status = Churned` filter while accepting the three slicers.
- The internet pivot retains its internal exclusion of `Internet Type = N/A`.
- No visual may use a disconnected duplicate PivotCache.
- Clearing all slicers must restore every baseline benchmark.

---

## 12. Interactivity Requirements

- Slicers support single-select and multi-select.
- Slicer headers and clear-filter controls remain visible.
- All relevant KPI cards and visuals update together.
- The current filter state must be visually obvious.
- Clearing all slicers restores the baseline dashboard.
- KPI cards must not use static values or formula logic disconnected from the slicer context.
- PivotTables must not display `(blank)` items for dashboard dimensions.
- Joined customers remain available in total-context calculations but do not enter churn/retention rates.
- Sorting must remain stable after filtering and refresh:
  - Tenure: 0–6 through 49–72 months.
  - Risk Tier: Very High through Low.
  - Churn Reasons: descending count, Top 5.
- Empty states caused by incompatible filters must display cleanly without `#DIV/0!`, `#REF!`, or misleading zero labels.
- Slicer connections must be verified after every structural PivotTable change.
- The workbook must work without macros.

---

## 13. Workbook Sheet Architecture

Use four sheets. This is the simplest architecture that supports the required interactivity without turning supporting analysis into a second deliverable.

### `01_Dashboard`

- Only presentation sheet.
- Contains header, slicers, KPI cards, heatmap, three charts, notes, and source attribution.
- Gridlines, row/column headings, and formula bar exposure are minimized for presentation.
- No raw PivotTables should be placed in visible dashboard margins.

### `02_Pivots`

- Holds all PivotTables that power cards, charts, and the heatmap.
- Required pivots:
  - `PT_KPI_Context`
  - `PT_ContractTenure_Rate`
  - `PT_ContractTenure_Volume` if used
  - `PT_InternetType`
  - `PT_TopReasons`
  - `PT_RiskTier`
  - compact QA pivots for Churn Category, Offer, Payment Method, and Charge Band only if needed for validation
- All dashboard pivots must share one cache.
- Hidden in the delivery workbook after validation; ordinary hidden state is preferred over “very hidden” for portfolio inspectability.

### `03_Calculations`

- Stores GETPIVOTDATA formulas used by KPI cards.
- Contains baseline QA benchmarks, denominator checks, helper-field definitions, and explanatory notes.
- Contains the high-risk intersection validation.
- Contains no competing business logic.
- Hidden in the delivery workbook but available for review by unhiding.

### `04_Data`

- Contains one Excel Table named `tblCustomers`.
- Embeds the 46 clean source fields plus approved workbook-only helpers.
- No external CSV link in the final workbook.
- Filter buttons may remain available when the sheet is unhidden.
- Hidden in the delivery workbook.

No separate scenario, dictionary, or driver sheet is required. Definitions and caveats belong in `03_Calculations` and compact dashboard notes; the repository remains the full documentation source.

---

## 14. Dashboard Layout Specification

### Canvas

- Approximate 16:9 composition.
- Target visible area: roughly columns A through X and rows 1 through 38, subject to final Excel zoom and display testing.
- Default presentation zoom: approximately 85–95%.
- Dashboard should fit on a typical laptop screen without horizontal scrolling.

### Layout zones

1. **Rows 1–3:** title, subtitle, source/rate note.
2. **Rows 4–7:** three horizontally aligned slicers with compact widths.
3. **Rows 8–13:** six equal KPI cards.
4. **Rows 15–26, left 60%:** Contract × Tenure heatmap and optional volume companion.
5. **Rows 15–26, right 40%:** Internet Type churn-rate chart.
6. **Rows 28–38, left 55%:** Top 5 stated churn reasons.
7. **Rows 28–38, right 45%:** Descriptive Churn Risk Tiers.
8. **Bottom edge/footer:** concise caveats and source path.

### Layout behavior

- Use consistent card widths, chart heights, and gutters.
- Prevent chart titles, slicers, and labels from overlapping at 100% zoom.
- Keep dashboard objects aligned to cell boundaries for predictable rendering.
- Do not place explanatory paragraphs inside chart areas.
- Use short subtitles/footnotes for scope and interpretation.

---

## 15. Visual/Design System

### Palette

- Background: warm white or very light neutral.
- Primary: deep navy or slate blue.
- Retained/positive: restrained teal.
- Churn/attention: muted red or coral.
- Neutral text: charcoal.
- Heatmap: light neutral to muted red sequential scale.

Do not use a rainbow palette.

### Typography

- One modern sans-serif family available in standard Excel installations.
- Title: 18–22 pt.
- Section/chart titles: 11–13 pt, semibold.
- KPI values: 18–24 pt.
- Supporting labels: 8–10 pt.
- Use consistent capitalization and number formats.

### Styling rules

- Hide worksheet gridlines on the dashboard.
- Use light card fills, minimal borders, and intentional whitespace.
- Avoid 3D effects, shadows that reduce readability, decorative gradients, and excessive legends.
- Use direct labels where possible.
- Keep rate axes consistent where comparison benefits from it.
- Use red only for churn/attention emphasis, not for every visual element.
- Use concise titles that state the metric and scope.
- Accessibility check: labels and values must not rely on color alone.

---

## 16. Technical Implementation Constraints

### A. Cursor/Python can generate reliably

- Read the clean CSV without treating the literal Offer value `None` as missing.
- Write the embedded `04_Data` sheet.
- Create and format `tblCustomers`.
- Add workbook-only helper formulas or values.
- Create formula/QA blocks in `03_Calculations`.
- Create dashboard cells, styles, shapes/cell-based cards, notes, named ranges, conditional formatting, data validation, and standard charts.
- Set workbook calculation properties and basic print/view settings.
- Validate source-based benchmark metrics independently of Excel.

`openpyxl` or XlsxWriter can support these static workbook structures, but neither is sufficient for the required native PivotTable/slicer layer.

### B. Native Excel/manual setup is required

- Create production-grade PivotTables and PivotCaches.
- Create PivotCharts based on those PivotTables.
- Create slicers.
- Configure slicer Report Connections across all relevant pivots.
- Configure PivotTable calculated behavior, value-field formatting, Top 5 filters, and custom ordering.
- Validate refresh behavior and layout in the target desktop Excel version.
- Save the final workbook after Excel recalculation so formula results are cached.

Native desktop Excel is therefore a hard dependency for the final interactive deliverable.

### C. Avoid as fragile or unnecessarily complex

- Do not attempt to synthesize PivotTable or slicer XML with openpyxl.
- Do not use XlsxWriter expecting PivotTable, PivotChart, slicer, or Report Connection creation; it does not support them.
- Do not round-trip the final slicer-enabled workbook through openpyxl after native setup without proving that unsupported extension parts are preserved.
- Do not use an external CSV link in the portfolio file.
- Do not add Power Query solely to simulate refresh for this static snapshot.
- Do not add the Excel Data Model/Power Pivot for a single flat table.
- Do not use macros/VBA for filtering or reset behavior.
- Do not make COM/Windows-only automation the only reproducible build path.
- Do not depend on a calculated PivotField formula that divides row-level flags and can produce Joined-customer divide-by-zero behavior; use blank rate-value helpers and/or GETPIVOTDATA ratios.

### Compatibility and refresh

- Primary target: current Microsoft Excel desktop with native PivotTable and slicer support.
- Excel for the web may display and use existing slicers but is not the authoring/QA environment.
- LibreOffice and Apple Numbers are not supported targets because PivotChart/slicer behavior is not equivalent.
- The embedded table avoids broken external paths.
- “Refresh on open” may be enabled for pivots, but a refreshed result still requires Excel to process the cache.
- If the source CSV changes, the controlled workflow is to replace/regenerate the embedded table and refresh all pivots in native Excel. The workbook is not a live data connection.
- Python libraries write formulas but do not calculate them. Native Excel recalculation is required before final validation and delivery.

---

## 17. Validation Requirements

### Source and grain

- 7,043 rows.
- 7,043 unique Customer IDs.
- No duplicate Customer IDs.
- 46 source columns before workbook-only helpers.
- All raw customer rows preserved.
- ZIP population match remains complete.

### Baseline KPI acceptance

- Total Customers = 7,043.
- Existing Customers = 6,589.
- Churned Customers = 1,869.
- Retained Customers = 4,720.
- Joined Customers = 454.
- Churn Rate = 28.37% (28.4% at one decimal).
- Retention Rate = 71.63% (71.6% at one decimal).
- MRVL = $137,086.65.

### Visual spot checks

- Month-to-Month: 3,202 existing, 1,655 churned, 51.69%.
- Tenure 0–6 months: 1,016 existing, 784 churned, 77.17%.
- Fiber Optic internet customers: 2,934 existing, 1,236 churned, 42.13%.
- Competitor had better devices: 313 churned customers.
- Competitor made better offer: 311 churned customers.
- Very High descriptive tier: 2,156 existing, 66.51% churn.
- High-risk intersection QA: 487 existing, 444 churned, 91.17%.

### Slicer validation

For each slicer:

1. Select one item and verify all connected KPI cards and visuals change.
2. Select multiple items and verify totals reconcile.
3. Clear the slicer and verify baseline restoration.
4. Verify the reason chart remains churned-only.
5. Verify the Internet Type chart remains internet-only.
6. Verify no disconnected pivot remains unchanged.
7. Verify no errors or stale labels appear.

### Presentation validation

- Open without repair warnings.
- No broken links.
- No external data-path prompts.
- No visible `#REF!`, `#DIV/0!`, or `(blank)` dashboard labels.
- Dashboard fits the intended screen composition at the specified zoom.
- All chart labels are readable.
- Hidden support sheets can be unhidden and audited.
- Final file is saved after Refresh All and full recalculation in native Excel.

### Audit discrepancy identified

The existing Tableau validation script reports one non-core failure in the inherited hypothetical scenario:

- Segment monthly lost = $35,246.85.
- 10% monthly preserved has an unrounded value of $3,524.685 and displays as $3,524.68 under Python's rounding behavior.
- Annualizing the unrounded monthly value gives $42,296.22.
- Annualizing the displayed rounded monthly value gives $42,296.16.

This does not affect the requested benchmark KPIs and the scenario is excluded from the final dashboard. If a scenario is reintroduced later, the rounding convention must be specified explicitly.

---

## 18. Definition of Done

The eventual Excel deliverable is complete only when:

- There is one polished dashboard presentation sheet.
- The dashboard follows the four-part business story.
- All six KPI cards reconcile to baseline and respond to slicers.
- Contract, Tenure Band, and Internet Type slicers control every relevant PivotTable and chart defined in the connection matrix.
- The Contract × Tenure heatmap, Internet Type chart, Top 5 Reasons chart, and Risk Tier component are present and readable.
- Joined customers are excluded from all churn/retention denominators under every filter state.
- Risk tiers are labeled descriptive and non-predictive.
- Reason and association caveats are visible.
- All validation requirements pass in native Excel.
- The workbook opens without warnings, repair prompts, broken links, or missing objects.
- The final file contains no macros and no dependency on a local external CSV path.
- Supporting sheets are organized, auditable, and hidden from the default presentation.
- No source CSV, SQL, analysis, or Tableau artifact has been modified to create the workbook.

---

## 19. Explicitly Excluded / Out of Scope

- Creating the `.xlsx` in this phase.
- Writing an implementation or workbook-build script in this phase.
- Creating `BUILD_PLAN.md` in this phase.
- Modifying source CSVs or rebuilding the cleaning pipeline.
- Modifying SQL, Python analysis logic, or Tableau.
- Predictive churn probabilities, machine-learning scores, or causal claims.
- Time-series or trend analysis.
- Geographic maps or city rankings.
- Gender analysis.
- Add-on-count analysis as a dashboard component.
- Payment Method, Paperless Billing, Charge Band, or Offer as dashboard visuals.
- Customer-level risk ranking tables.
- A separate retention scenario sheet.
- Revenue-at-risk metrics that compete with MRVL.
- Power Query, Power Pivot/Data Model, macros, VBA, or external live connections.
- Supporting dashboards or multiple executive presentation sheets.
- Pixel-level aesthetic optimization during planning.

---

## 20. Open Issues

### Required decision before build planning

Confirm access to Microsoft Excel desktop for the native interactivity pass.

The required PivotTables, PivotCharts, slicers, and multi-pivot Report Connections cannot be created reliably with the repository's current Python tooling or with openpyxl/XlsxWriter alone. If native Excel desktop is not available, the product requirement must change to either:

- use a controlled Excel-capable automation environment, or
- accept a static non-slicer workbook.

The second option would not satisfy this PRD's core interactivity requirement.

### Non-blocking inherited issue

The hypothetical retention scenario in `excel/workbook_spec.md` has a six-cent annual rounding ambiguity described in Section 17. It is non-blocking because the scenario is excluded from this one-dashboard scope.

---

## Changes from `excel/workbook_spec.md`

### Remain

- `customers_clean.csv` as the data source.
- Canonical churn, retention, and MRVL definitions.
- Joined-customer exclusion from rate denominators.
- Formula transparency and auditability.
- PivotTables/PivotCharts as the core exploration mechanism.
- Descriptive risk-point and risk-tier rules.
- No macros/VBA/Power Query by default.
- Existing benchmark values and interpretation caveats.

### Change

- Replace six equally prominent analytical sheets with one dashboard plus three support sheets.
- Replace static formula KPI cards with a shared-cache KPI PivotTable and GETPIVOTDATA so cards respond to slicers.
- Reduce the slicer set to Contract, Tenure Band, and Internet Type.
- Replace separate Contract and Tenure charts with a Contract × Tenure heatmap.
- Reduce the visual set to four story-critical components.
- Use `Is_Churned` and `Is_Retained` directly, adding only the helper fields required for reliable denominators, rates, MRVL, and sorting.
- Move definitions and QA into a hidden Calculations sheet rather than a separate presentation-oriented dictionary sheet.
- Explicitly require native Excel for PivotTable, PivotChart, slicer, and Report Connection creation.

### Remove

- Separate Executive Summary, KPI Analysis, Segment Analysis, Churn Drivers, Retention Scenario, and Data Dictionary presentation tabs.
- Ten PivotTables competing across multiple visible analysis sheets.
- Separate Churn Category and Churn Reason dashboard charts.
- Offer, Payment Method, and Paperless Billing dashboard visuals.
- The editable hypothetical scenario from the final dashboard.
- A Customer Status or Risk Tier slicer.
- Any suggestion that openpyxl/XlsxWriter alone can create the final interactive layer.

### Add

- A complete slicer-to-object connection matrix.
- Slicer-responsive KPI requirements.
- A shared PivotCache requirement.
- Empty-state and filter-reset behavior.
- A four-sheet dashboard/support architecture.
- Native Excel authoring, refresh, recalculation, and compatibility constraints.
- Explicit avoidance of post-slicer openpyxl round-tripping.
- Baseline, visual, interactivity, and presentation acceptance tests.
- Documentation of the inherited scenario rounding discrepancy.
