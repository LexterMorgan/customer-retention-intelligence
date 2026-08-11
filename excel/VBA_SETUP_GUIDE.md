# Customer Retention Dashboard — Native Excel Setup

The Python build creates a safe macro-free `.xlsx`. The VBA module adds the native Excel objects that Python cannot create reliably: PivotTables, PivotCharts, slicers, and report connections.

## Before you begin

1. Close any older copy of `customer_retention_dashboard.xlsx`.
2. Run the Python build if needed:

   ```bash
   python3 excel/build_excel_dashboard.py
   ```

3. Open `excel/customer_retention_dashboard.xlsx` in Microsoft Excel Desktop.
4. Confirm that `01_Dashboard` opens without an Excel repair warning.

## Import the VBA module

The recommended method keeps the delivered workbook macro-free.

1. In Excel, enable the **Developer** tab:
   - **Excel > Preferences > Ribbon & Toolbar**
   - Enable **Developer**.
2. If `PERSONAL.XLSB` does not exist:
   - Choose **Developer > Record Macro**.
   - Set **Store macro in** to **Personal Macro Workbook**.
   - Start and immediately stop recording.
3. Choose **Developer > Visual Basic**.
4. In Project Explorer, select `VBAProject (PERSONAL.XLSB)`.
5. Choose **File > Import File...**.
6. Import:

   `excel/setup_dashboard.bas`

7. In the Visual Basic Editor choose **Debug > Compile VBAProject**.
8. Save `PERSONAL.XLSB` when prompted.
9. Close the Visual Basic Editor.

Alternative: save the dashboard as `.xlsm`, import the module into that workbook, run it, then keep the `.xlsm`. The macro-free `PERSONAL.XLSB` method is preferred for a portfolio deliverable.

## Run the one-click setup

1. Make sure `customer_retention_dashboard.xlsx` is the active workbook.
2. Choose **Developer > Macros**.
3. Select:

   `PERSONAL.XLSB!BuildRetentionDashboard`

4. Click **Run**.
5. Wait for the completion message.

The macro will:

- validate `tblCustomers` and all required helper fields;
- create one shared PivotCache;
- create and configure six PivotTables;
- create and place three PivotCharts;
- create Contract, Tenure Band, and Internet Type slicers;
- connect each slicer to all six PivotTables;
- refresh and recalculate the workbook;
- validate the approved benchmark values;
- hide the three implementation sheets;
- save and return to `01_Dashboard`.

## Verify the result

Confirm:

- the workbook opens without a repair warning;
- only `01_Dashboard` is visible;
- all three slicers are visible in the filter bar;
- all three native charts are visible and aligned inside their panels;
- baseline KPIs show:
  - Existing Customers: `6,589`
  - Churned Customers: `1,869`
  - Retained Customers: `4,720`
  - Churn Rate: `28.37%` (displayed as `28.4%`)
  - Retention Rate: `71.63%` (displayed as `71.6%`)
  - MRVL: `$137,086.65` (dashboard card rounds to whole dollars)
- changing Contract, Tenure Band, or Internet Type updates the six KPIs, three charts, heatmap, and risk-tier volume labels;
- clearing all slicers restores the baseline values.

## Mac slicer fallback

Some older Excel for Mac builds expose slicers in the user interface but do not expose all slicer APIs to VBA. If the macro reports this limitation, it will leave the completed PivotTables and PivotCharts intact.

1. On `02_Pivots`, select any cell in `PT_KPI_Context`.
2. Choose **PivotTable Analyze > Insert Slicer**.
3. Add:
   - `Contract`
   - `Tenure_Band_Slicer`
   - `Internet Type`
4. Move the slicers to:
   - Contract: `01_Dashboard!A4:H6`
   - Tenure Band: `01_Dashboard!I4:P6`
   - Internet Type: `01_Dashboard!Q4:X6`
5. For each slicer choose **Slicer > Report Connections** and enable:
   - `PT_KPI_Context`
   - `PT_InternetType`
   - `PT_ChurnReasons`
   - `PT_RiskTier`
   - `PT_RiskTierVolume`
   - `PT_ContractTenure`
6. Run `BuildRetentionDashboard` again. It will validate the connections, hide support sheets, refresh, and save.

## Troubleshooting

- If the macro says the active workbook is invalid, activate `customer_retention_dashboard.xlsx` and rerun it.
- If a benchmark fails, clear all slicers and rerun the macro.
- If Excel blocks macros, allow macros for `PERSONAL.XLSB` in **Excel > Preferences > Security**.
- Do not rename the four worksheets, `tblCustomers`, helper fields, PivotTables, PivotCharts, or slicers.
