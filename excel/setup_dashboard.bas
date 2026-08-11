Attribute VB_Name = "CustomerRetentionDashboardSetup"
Option Explicit

' Customer Retention Intelligence - native Excel setup
' Import this standard module into PERSONAL.XLSB (recommended) or an XLSM
' controller, activate customer_retention_dashboard.xlsx, and run:
'     BuildRetentionDashboard

Private Const DASH_SHEET As String = "01_Dashboard"
Private Const PIVOT_SHEET As String = "02_Pivots"
Private Const CALC_SHEET As String = "03_Calculations"
Private Const DATA_SHEET As String = "04_Data"
Private Const SOURCE_TABLE As String = "tblCustomers"

Private mStep As String
Private mOldCalculation As XlCalculation
Private mOldScreenUpdating As Boolean
Private mOldEnableEvents As Boolean
Private mOldDisplayAlerts As Boolean
Private mStateCaptured As Boolean
Private mSlicerError As String

Public Sub BuildRetentionDashboard()
    Dim wb As Workbook
    Dim lo As ListObject
    Dim pc As PivotCache
    Dim slicersBuilt As Boolean
    Dim originalNumber As Long
    Dim originalDescription As String

    On Error GoTo BuildFailed

    Set wb = ActiveWorkbook
    BeginApplicationState
    mStep = "validating the target workbook"
    Set lo = Preflight(wb)
    ShowSupportSheets wb

    If ExistingBuildIsComplete(wb) Then
        mStep = "refreshing the existing native dashboard"
        RefreshValidateAndFinalize wb
        GoTo BuildSucceeded
    End If

    mStep = "removing prior native dashboard objects"
    DeleteNativeObjects wb

    mStep = "creating the shared PivotCache"
    Set pc = wb.PivotCaches.Create( _
        SourceType:=xlDatabase, _
        SourceData:=lo.Name)

    On Error Resume Next
    pc.RefreshOnFileOpen = True
    pc.MissingItemsLimit = xlMissingItemsNone
    On Error GoTo BuildFailed

    mStep = "creating six PivotTables"
    CreatePivotTables wb, pc

    mStep = "configuring six PivotTables"
    ConfigurePivotTables wb

    mStep = "creating three PivotCharts"
    CreatePivotCharts wb

    mStep = "creating and connecting three slicers"
    slicersBuilt = CreateAndConnectSlicers(wb)

    If Not slicersBuilt Then
        mStep = "preparing the Mac slicer fallback"
        DeleteAllSlicerCaches wb
        ShowSupportSheets wb
        wb.Save
        ShowSlicerFallback wb
        GoTo BuildSucceeded
    End If

    mStep = "refreshing and validating the completed dashboard"
    RefreshValidateAndFinalize wb

BuildSucceeded:
    RestoreApplicationState
    Exit Sub

BuildFailed:
    originalNumber = Err.Number
    originalDescription = Err.Description
    On Error Resume Next
    If Not wb Is Nothing Then
        ShowSupportSheets wb
        wb.Worksheets(PIVOT_SHEET).Activate
    End If
    RestoreApplicationState
    MsgBox _
        "Dashboard setup stopped while " & mStep & "." & vbCrLf & vbCrLf & _
        "Error " & originalNumber & ": " & originalDescription & vbCrLf & vbCrLf & _
        "Support sheets remain visible so the issue can be inspected.", _
        vbCritical, _
        "Customer Retention Dashboard"
End Sub

Private Function Preflight(ByVal wb As Workbook) As ListObject
    Dim lo As ListObject

    If wb Is Nothing Then
        Err.Raise vbObjectError + 700, , "No active workbook was found."
    End If

    If Not SheetExists(wb, DASH_SHEET) _
       Or Not SheetExists(wb, PIVOT_SHEET) _
       Or Not SheetExists(wb, CALC_SHEET) _
       Or Not SheetExists(wb, DATA_SHEET) Then
        Err.Raise vbObjectError + 701, , _
            "The active workbook is not the four-sheet dashboard scaffold."
    End If

    On Error Resume Next
    Set lo = wb.Worksheets(DATA_SHEET).ListObjects(SOURCE_TABLE)
    On Error GoTo 0

    If lo Is Nothing Then
        Err.Raise vbObjectError + 702, , _
            "ListObject tblCustomers was not found on 04_Data."
    End If

    If lo.ListRows.Count <> 7043 Then
        Err.Raise vbObjectError + 703, , _
            "tblCustomers must contain 7,043 data rows; found " & _
            Format$(lo.ListRows.Count, "#,##0") & "."
    End If

    If lo.ListColumns.Count <> 55 Then
        Err.Raise vbObjectError + 704, , _
            "tblCustomers must contain 55 columns; found " & _
            lo.ListColumns.Count & "."
    End If

    RequireColumn lo, "Customer ID"
    RequireColumn lo, "Customer Status"
    RequireColumn lo, "Contract"
    RequireColumn lo, "Tenure_Band"
    RequireColumn lo, "Tenure_Band_Slicer"
    RequireColumn lo, "Internet Service"
    RequireColumn lo, "Internet Type"
    RequireColumn lo, "Churn Reason"
    RequireColumn lo, "Existing_Flag"
    RequireColumn lo, "Is_Churned"
    RequireColumn lo, "Is_Retained"
    RequireColumn lo, "Churn_Rate_Value"
    RequireColumn lo, "MRVL_Row"
    RequireColumn lo, "Descriptive_Churn_Risk_Tier"

    Set Preflight = lo
End Function

Private Sub RequireColumn(ByVal lo As ListObject, ByVal columnName As String)
    Dim lc As ListColumn

    On Error Resume Next
    Set lc = lo.ListColumns(columnName)
    On Error GoTo 0

    If lc Is Nothing Then
        Err.Raise vbObjectError + 705, , _
            "Required source column is missing: " & columnName
    End If
End Sub

Private Sub CreatePivotTables(ByVal wb As Workbook, ByVal pc As PivotCache)
    Dim ws As Worksheet
    Dim pt As PivotTable

    Set ws = wb.Worksheets(PIVOT_SHEET)
    ws.Visible = xlSheetVisible
    ws.Activate
    PrintPivotCreationDiagnostics pc, ws

    On Error GoTo FailKPIContext
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=A3"; _
                " | TableName=PT_KPI_Context"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("A3"), _
        TableName:="PT_KPI_Context")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=A3"; _
                " | TableName=PT_KPI_Context"
    On Error GoTo 0

    On Error GoTo FailInternetType
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=A12"; _
                " | TableName=PT_InternetType"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("A12"), _
        TableName:="PT_InternetType")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=A12"; _
                " | TableName=PT_InternetType"
    On Error GoTo 0

    On Error GoTo FailChurnReasons
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=A24"; _
                " | TableName=PT_ChurnReasons"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("A24"), _
        TableName:="PT_ChurnReasons")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=A24"; _
                " | TableName=PT_ChurnReasons"
    On Error GoTo 0

    On Error GoTo FailRiskTier
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=A38"; _
                " | TableName=PT_RiskTier"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("A38"), _
        TableName:="PT_RiskTier")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=A38"; _
                " | TableName=PT_RiskTier"
    On Error GoTo 0

    On Error GoTo FailRiskTierVolume
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=F38"; _
                " | TableName=PT_RiskTierVolume"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("F38"), _
        TableName:="PT_RiskTierVolume")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=F38"; _
                " | TableName=PT_RiskTierVolume"
    On Error GoTo 0

    On Error GoTo FailContractTenure
    Debug.Print "BEFORE PivotTables.Add"; _
                " | Destination=A52"; _
                " | TableName=PT_ContractTenure"
    Set pt = ws.PivotTables.Add( _
        PivotCache:=pc, _
        TableDestination:=ws.Range("A52"), _
        TableName:="PT_ContractTenure")
    Debug.Print "AFTER PivotTables.Add"; _
                " | Destination=A52"; _
                " | TableName=PT_ContractTenure"
    On Error GoTo 0
    Exit Sub

FailKPIContext:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "A3", "PT_KPI_Context"
FailInternetType:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "A12", "PT_InternetType"
FailChurnReasons:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "A24", "PT_ChurnReasons"
FailRiskTier:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "A38", "PT_RiskTier"
FailRiskTierVolume:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "F38", "PT_RiskTierVolume"
FailContractTenure:
    ReportPivotCreationFailure Err.Number, Err.Description, _
                               "A52", "PT_ContractTenure"
End Sub

Private Sub PrintPivotCreationDiagnostics( _
    ByVal pc As PivotCache, _
    ByVal ws As Worksheet)

    Dim diagnosticValue As Variant
    Dim diagnosticNumber As Long
    Dim diagnosticDescription As String

    Debug.Print String$(72, "-")
    Debug.Print "PIVOT CREATION DIAGNOSTICS"

    On Error Resume Next

    Err.Clear
    diagnosticValue = ws.Name
    diagnosticNumber = Err.Number
    diagnosticDescription = Err.Description
    If diagnosticNumber = 0 Then
        Debug.Print "ws.Name valid=True"; _
                    " | Value=" & CStr(diagnosticValue)
    Else
        Debug.Print "ws.Name valid=False"; _
                    " | Err.Number=" & diagnosticNumber; _
                    " | Err.Description=" & diagnosticDescription
    End If

    Err.Clear
    diagnosticValue = Empty
    diagnosticValue = pc.RecordCount
    diagnosticNumber = Err.Number
    diagnosticDescription = Err.Description
    If diagnosticNumber = 0 Then
        Debug.Print "pc.RecordCount valid=True"; _
                    " | Value=" & CStr(diagnosticValue)
    Else
        Debug.Print "pc.RecordCount valid=False"; _
                    " | Err.Number=" & diagnosticNumber; _
                    " | Err.Description=" & diagnosticDescription
    End If

    Err.Clear
    diagnosticValue = Empty
    diagnosticValue = pc.SourceData
    diagnosticNumber = Err.Number
    diagnosticDescription = Err.Description
    If diagnosticNumber = 0 Then
        If IsArray(diagnosticValue) Then
            Debug.Print "pc.SourceData valid=True"; _
                        " | Type=Array"
        Else
            Debug.Print "pc.SourceData valid=True"; _
                        " | Value=" & CStr(diagnosticValue)
        End If
    Else
        Debug.Print "pc.SourceData valid=False"; _
                    " | Err.Number=" & diagnosticNumber; _
                    " | Err.Description=" & diagnosticDescription
    End If

    On Error GoTo 0
    Debug.Print String$(72, "-")
End Sub

Private Sub ReportPivotCreationFailure( _
    ByVal errorNumber As Long, _
    ByVal errorDescription As String, _
    ByVal destinationCell As String, _
    ByVal tableName As String)

    Debug.Print "FAILED PivotTables.Add"
    Debug.Print "Err.Number=" & errorNumber
    Debug.Print "Err.Description=" & errorDescription
    Debug.Print "Destination=" & destinationCell
    Debug.Print "TableName=" & tableName
    Debug.Print String$(72, "-")

    Err.Raise errorNumber, _
              "CreatePivotTables." & tableName, _
              errorDescription
End Sub

Private Sub ConfigurePivotTables(ByVal wb As Workbook)
    ConfigureKPI GetPivot(wb, "PT_KPI_Context")
    ConfigureInternet GetPivot(wb, "PT_InternetType")
    ConfigureReasons GetPivot(wb, "PT_ChurnReasons")
    ConfigureRiskRate GetPivot(wb, "PT_RiskTier")
    ConfigureRiskVolume GetPivot(wb, "PT_RiskTierVolume")
    ConfigureContractTenure GetPivot(wb, "PT_ContractTenure")
End Sub

Private Sub PreparePivot(ByVal pt As PivotTable)
    pt.ManualUpdate = True
    pt.PreserveFormatting = True
    pt.HasAutoFormat = False
    pt.RowGrand = False
    pt.ColumnGrand = False

    On Error Resume Next
    pt.InGridDropZones = False
    pt.ShowTableStyleRowStripes = False
    pt.ShowTableStyleColumnStripes = False
    pt.RowAxisLayout xlTabularRow
    On Error GoTo 0
End Sub

Private Sub FinishPivot(ByVal pt As PivotTable)
    pt.ManualUpdate = False
    pt.RefreshTable
End Sub

Private Sub ConfigureKPI(ByVal pt As PivotTable)
    Dim df As PivotField

    PreparePivot pt
    Set df = AddValue(pt, "Existing_Flag", "Existing Customers", xlSum, "#,##0")
    Set df = AddValue(pt, "Is_Churned", "Churned Customers", xlSum, "#,##0")
    Set df = AddValue(pt, "Is_Retained", "Retained Customers", xlSum, "#,##0")
    Set df = AddValue(pt, "MRVL_Row", _
                      "Monthly Recurring Value Lost", xlSum, "$#,##0.00")
    FinishPivot pt
End Sub

Private Sub ConfigureInternet(ByVal pt As PivotTable)
    Dim rowField As PivotField
    Dim pageField As PivotField
    Dim df As PivotField

    PreparePivot pt

    Set pageField = pt.PivotFields("Internet Service")
    pageField.Orientation = xlPageField
    pageField.Position = 1
    pageField.CurrentPage = "Yes"

    Set rowField = pt.PivotFields("Internet Type")
    rowField.Orientation = xlRowField
    rowField.Position = 1
    DisableSubtotals rowField

    Set df = AddValue(pt, "Churn_Rate_Value", "Churn Rate", xlAverage, "0.0%")
    rowField.AutoSort xlDescending, df.Name
    FinishPivot pt
End Sub

Private Sub ConfigureReasons(ByVal pt As PivotTable)
    Dim rowField As PivotField
    Dim pageField As PivotField
    Dim df As PivotField

    PreparePivot pt

    Set pageField = pt.PivotFields("Customer Status")
    pageField.Orientation = xlPageField
    pageField.Position = 1
    pageField.CurrentPage = "Churned"

    Set rowField = pt.PivotFields("Churn Reason")
    rowField.Orientation = xlRowField
    rowField.Position = 1
    DisableSubtotals rowField

    Set df = AddValue(pt, "Customer ID", "Churned Customers", xlCount, "#,##0")

    On Error Resume Next
    rowField.PivotItems("(blank)").Visible = False
    On Error GoTo 0

    rowField.AutoSort xlDescending, df.Name
    rowField.PivotFilters.Add _
        Type:=xlTopCount, _
        DataField:=df, _
        Value1:=5
    FinishPivot pt
End Sub

Private Sub ConfigureRiskRate(ByVal pt As PivotTable)
    Dim rowField As PivotField
    Dim df As PivotField

    PreparePivot pt
    Set rowField = pt.PivotFields("Descriptive_Churn_Risk_Tier")
    rowField.Orientation = xlRowField
    rowField.Position = 1
    DisableSubtotals rowField
    Set df = AddValue(pt, "Churn_Rate_Value", "Churn Rate", xlAverage, "0.0%")
    FinishPivot pt
    ApplyRiskOrder rowField
End Sub

Private Sub ConfigureRiskVolume(ByVal pt As PivotTable)
    Dim rowField As PivotField
    Dim df As PivotField

    PreparePivot pt
    Set rowField = pt.PivotFields("Descriptive_Churn_Risk_Tier")
    rowField.Orientation = xlRowField
    rowField.Position = 1
    DisableSubtotals rowField
    Set df = AddValue(pt, "Existing_Flag", "Existing Customers", xlSum, "#,##0")
    FinishPivot pt
    ApplyRiskOrder rowField
End Sub

Private Sub ConfigureContractTenure(ByVal pt As PivotTable)
    Dim rowField As PivotField
    Dim columnField As PivotField
    Dim df As PivotField

    PreparePivot pt

    Set rowField = pt.PivotFields("Tenure_Band")
    rowField.Orientation = xlRowField
    rowField.Position = 1
    DisableSubtotals rowField

    Set columnField = pt.PivotFields("Contract")
    columnField.Orientation = xlColumnField
    columnField.Position = 1
    DisableSubtotals columnField

    Set df = AddValue(pt, "Churn_Rate_Value", "Churn Rate", xlAverage, "0.0%")
    Set df = AddValue(pt, "Existing_Flag", "Existing Customers", xlSum, "#,##0")
    FinishPivot pt
    ApplyTenureOrder rowField
    ApplyContractOrder columnField
End Sub

Private Function AddValue( _
    ByVal pt As PivotTable, _
    ByVal sourceName As String, _
    ByVal caption As String, _
    ByVal aggregate As XlConsolidationFunction, _
    ByVal numberFormat As String) As PivotField

    Set AddValue = pt.AddDataField( _
        pt.PivotFields(sourceName), caption, aggregate)
    AddValue.NumberFormat = numberFormat
End Function

Private Sub DisableSubtotals(ByVal pf As PivotField)
    Dim i As Long

    On Error Resume Next
    For i = 1 To 12
        pf.Subtotals(i) = False
    Next i
    On Error GoTo 0
End Sub

Private Sub ApplyRiskOrder(ByVal pf As PivotField)
    ApplyManualOrder pf, Array("Very High", "High", "Medium", "Low")
End Sub

Private Sub ApplyTenureOrder(ByVal pf As PivotField)
    ApplyManualOrder pf, Array( _
        "0-6 months", _
        "7-12 months", _
        "13-24 months", _
        "25-36 months", _
        "37-48 months", _
        "49-72 months")
End Sub

Private Sub ApplyContractOrder(ByVal pf As PivotField)
    ApplyManualOrder pf, Array("Month-to-Month", "One Year", "Two Year")
End Sub

Private Sub ApplyManualOrder(ByVal pf As PivotField, ByVal labels As Variant)
    Dim i As Long

    On Error Resume Next
    pf.AutoSort xlManual, pf.Name
    For i = LBound(labels) To UBound(labels)
        pf.PivotItems(CStr(labels(i))).Position = i + 1
    Next i
    On Error GoTo 0
End Sub

Private Sub CreatePivotCharts(ByVal wb As Workbook)
    CreateOnePivotChart wb, _
        "PT_InternetType", "PC_InternetType", "Q16:X26", _
        RGB(62, 107, 137), "0.0%"

    CreateOnePivotChart wb, _
        "PT_ChurnReasons", "PC_ChurnReasons", "A31:M37", _
        RGB(201, 76, 76), "#,##0"

    CreateOnePivotChart wb, _
        "PT_RiskTier", "PC_RiskTier", "N31:U37", _
        RGB(201, 76, 76), "0.0%"
End Sub

Private Sub CreateOnePivotChart( _
    ByVal wb As Workbook, _
    ByVal pivotName As String, _
    ByVal chartName As String, _
    ByVal wellAddress As String, _
    ByVal seriesColor As Long, _
    ByVal labelFormat As String)

    Dim pt As PivotTable
    Dim ws As Worksheet
    Dim well As Range
    Dim ch As Chart
    Dim co As ChartObject
    Dim ser As Series

    Set pt = GetPivot(wb, pivotName)
    Set ws = wb.Worksheets(DASH_SHEET)
    Set well = ws.Range(wellAddress)

    Set ch = wb.Charts.Add
    ch.SetSourceData Source:=pt.TableRange1
    ch.ChartType = xlBarClustered
    Set ch = ch.Location(Where:=xlLocationAsObject, Name:=DASH_SHEET)

    Set co = ws.ChartObjects(ws.ChartObjects.Count)
    co.Name = chartName
    co.Left = well.Left + 3
    co.Top = well.Top + 3
    co.Width = well.Width - 6
    co.Height = well.Height - 6
    co.Placement = xlMoveAndSize

    Set ch = co.Chart
    ch.HasTitle = False
    ch.HasLegend = False

    On Error Resume Next
    ch.ShowAllFieldButtons = False
    ch.ChartArea.Format.Line.Visible = 0
    ch.PlotArea.Format.Line.Visible = 0
    ch.ChartArea.Format.Fill.Solid
    ch.ChartArea.Format.Fill.ForeColor.RGB = RGB(255, 255, 255)
    ch.PlotArea.Format.Fill.Solid
    ch.PlotArea.Format.Fill.ForeColor.RGB = RGB(255, 255, 255)
    ch.Axes(xlCategory).ReversePlotOrder = True
    ch.Axes(xlValue).HasMajorGridlines = False
    ch.Axes(xlValue).Delete
    On Error GoTo 0

    If ch.SeriesCollection.Count <> 1 Then
        Err.Raise vbObjectError + 720, , _
            chartName & " did not produce exactly one data series."
    End If

    Set ser = ch.SeriesCollection(1)

    On Error Resume Next
    ser.Format.Fill.Solid
    ser.Format.Fill.ForeColor.RGB = seriesColor
    ser.Format.Line.Visible = 0
    ser.ApplyDataLabels
    ser.DataLabels.Position = xlLabelPositionOutsideEnd
    ser.DataLabels.NumberFormat = labelFormat
    ser.DataLabels.Font.Name = "Aptos"
    ser.DataLabels.Font.Size = 9
    ch.ChartGroups(1).GapWidth = 45
    ch.Axes(xlCategory).TickLabels.Font.Name = "Aptos"
    ch.Axes(xlCategory).TickLabels.Font.Size = 9
    On Error GoTo 0

    If ChartPivotName(co) <> pivotName Then
        Err.Raise vbObjectError + 721, , _
            chartName & " was not created as a PivotChart."
    End If
End Sub

Private Function CreateAndConnectSlicers(ByVal wb As Workbook) As Boolean
    Dim originalNumber As Long
    Dim originalDescription As String

    On Error GoTo MacSlicerUnavailable

    AddOneSlicer wb, _
        "Contract", "SC_Contract", "SL_Contract", _
        "Contract", "A4:H6", 3

    AddOneSlicer wb, _
        "Tenure_Band_Slicer", "SC_TenureBand", "SL_TenureBand", _
        "Tenure Band", "I4:P6", 3

    AddOneSlicer wb, _
        "Internet Type", "SC_InternetType", "SL_InternetType", _
        "Internet Type", "Q4:X6", 4

    CreateAndConnectSlicers = True
    Exit Function

MacSlicerUnavailable:
    originalNumber = Err.Number
    originalDescription = Err.Description
    mSlicerError = "Error " & originalNumber & ": " & originalDescription
    If InStr(1, Application.OperatingSystem, "Mac", vbTextCompare) = 0 Then
        Err.Raise originalNumber, "CreateAndConnectSlicers", originalDescription
    End If
    CreateAndConnectSlicers = False
End Function

Private Sub AddOneSlicer( _
    ByVal wb As Workbook, _
    ByVal fieldName As String, _
    ByVal cacheName As String, _
    ByVal slicerName As String, _
    ByVal caption As String, _
    ByVal wellAddress As String, _
    ByVal columns As Long)

    Dim pt As PivotTable
    Dim ws As Worksheet
    Dim well As Range
    Dim sc As SlicerCache
    Dim sl As Slicer
    Dim pivotNames As Variant
    Dim item As Variant

    Set pt = GetPivot(wb, "PT_KPI_Context")
    Set ws = wb.Worksheets(DASH_SHEET)
    Set well = ws.Range(wellAddress)

    Set sc = wb.SlicerCaches.Add(pt, fieldName, cacheName)
    Set sl = sc.Slicers.Add( _
        SlicerDestination:=ws, _
        Name:=slicerName, _
        Caption:=caption, _
        Top:=well.Top + 2, _
        Left:=well.Left + 2, _
        Width:=well.Width - 4, _
        Height:=well.Height - 4)

    sl.NumberOfColumns = columns

    On Error Resume Next
    sl.Style = "SlicerStyleLight2"
    sl.Shape.Placement = xlMoveAndSize
    On Error GoTo 0

    pivotNames = RequiredPivotNames()
    For Each item In pivotNames
        Set pt = GetPivot(wb, CStr(item))
        If Not SlicerHasPivot(sc, pt.Name) Then
            sc.PivotTables.AddPivotTable pt
        End If
    Next item
End Sub

Private Sub RefreshValidateAndFinalize(ByVal wb As Workbook)
    Dim pc As PivotCache

    ShowSupportSheets wb
    ClearAllSlicerFilters wb

    Set pc = GetPivot(wb, "PT_KPI_Context").PivotCache
    pc.Refresh
    wb.RefreshAll
    DoEvents

    ReapplyDynamicLayout wb
    Application.CalculateFull

    ValidateNativeBuild wb
    ValidateBenchmarks wb

    wb.Worksheets(PIVOT_SHEET).Visible = xlSheetHidden
    wb.Worksheets(CALC_SHEET).Visible = xlSheetHidden
    wb.Worksheets(DATA_SHEET).Visible = xlSheetHidden

    With wb.Worksheets(DASH_SHEET)
        .Visible = xlSheetVisible
        .Activate
        .Range("A1").Select
        ActiveWindow.Zoom = 75
        ActiveWindow.DisplayGridlines = False
        ActiveWindow.DisplayHeadings = False
    End With

    wb.Save
    MsgBox _
        "Dashboard setup is complete." & vbCrLf & vbCrLf & _
        "Six PivotTables, three PivotCharts, and three connected slicers " & _
        "were refreshed and validated.", _
        vbInformation, _
        "Customer Retention Dashboard"
End Sub

Private Sub ReapplyDynamicLayout(ByVal wb As Workbook)
    Dim pf As PivotField
    Dim df As PivotField

    Set pf = GetPivot(wb, "PT_InternetType").PivotFields("Internet Type")
    Set df = GetPivot(wb, "PT_InternetType").DataFields("Churn Rate")
    pf.AutoSort xlDescending, df.Name

    Set pf = GetPivot(wb, "PT_ChurnReasons").PivotFields("Churn Reason")
    Set df = GetPivot(wb, "PT_ChurnReasons").DataFields("Churned Customers")
    pf.AutoSort xlDescending, df.Name

    ApplyRiskOrder GetPivot(wb, "PT_RiskTier") _
        .PivotFields("Descriptive_Churn_Risk_Tier")
    ApplyRiskOrder GetPivot(wb, "PT_RiskTierVolume") _
        .PivotFields("Descriptive_Churn_Risk_Tier")
    ApplyTenureOrder GetPivot(wb, "PT_ContractTenure") _
        .PivotFields("Tenure_Band")
    ApplyContractOrder GetPivot(wb, "PT_ContractTenure") _
        .PivotFields("Contract")
End Sub

Private Sub ValidateNativeBuild(ByVal wb As Workbook)
    Dim names As Variant
    Dim item As Variant
    Dim pt As PivotTable
    Dim sharedIndex As Long
    Dim sc As SlicerCache

    names = RequiredPivotNames()
    For Each item In names
        Set pt = GetPivot(wb, CStr(item))
        If sharedIndex = 0 Then sharedIndex = pt.CacheIndex
        If pt.CacheIndex <> sharedIndex Then
            Err.Raise vbObjectError + 730, , _
                "PivotTable " & pt.Name & " does not use the shared PivotCache."
        End If
    Next item

    RequireChart wb, "PC_InternetType", "PT_InternetType"
    RequireChart wb, "PC_ChurnReasons", "PT_ChurnReasons"
    RequireChart wb, "PC_RiskTier", "PT_RiskTier"

    RequireDataField GetPivot(wb, "PT_KPI_Context"), "Existing Customers"
    RequireDataField GetPivot(wb, "PT_KPI_Context"), "Churned Customers"
    RequireDataField GetPivot(wb, "PT_KPI_Context"), "Retained Customers"
    RequireDataField GetPivot(wb, "PT_KPI_Context"), "Monthly Recurring Value Lost"
    RequireDataField GetPivot(wb, "PT_InternetType"), "Churn Rate"
    RequireDataField GetPivot(wb, "PT_ChurnReasons"), "Churned Customers"
    RequireDataField GetPivot(wb, "PT_RiskTier"), "Churn Rate"
    RequireDataField GetPivot(wb, "PT_RiskTierVolume"), "Existing Customers"
    RequireDataField GetPivot(wb, "PT_ContractTenure"), "Churn Rate"
    RequireDataField GetPivot(wb, "PT_ContractTenure"), "Existing Customers"

    Set sc = FindSlicerCache(wb, "Contract")
    RequireSixConnections sc, "Contract"

    Set sc = FindSlicerCache(wb, "Tenure_Band_Slicer")
    RequireSixConnections sc, "Tenure_Band_Slicer"

    Set sc = FindSlicerCache(wb, "Internet Type")
    RequireSixConnections sc, "Internet Type"
End Sub

Private Sub ValidateBenchmarks(ByVal wb As Workbook)
    Dim ws As Worksheet

    Set ws = wb.Worksheets(CALC_SHEET)
    Application.CalculateFull

    AssertNear ws.Range("C5").Value2, 6589, 0.01, "Existing Customers"
    AssertNear ws.Range("C6").Value2, 1869, 0.01, "Churned Customers"
    AssertNear ws.Range("C7").Value2, 4720, 0.01, "Retained Customers"
    AssertNear ws.Range("C8").Value2, 1869# / 6589#, 0.000001, "Churn Rate"
    AssertNear ws.Range("C9").Value2, 4720# / 6589#, 0.000001, "Retention Rate"
    AssertNear ws.Range("C10").Value2, 137086.65, 0.01, _
               "Monthly Recurring Value Lost"
    AssertNear ws.Range("C15").Value2, 7043, 0.01, "Total Customers"
    AssertNear ws.Range("C16").Value2, 454, 0.01, "Joined Customers"
End Sub

Private Sub AssertNear( _
    ByVal actual As Variant, _
    ByVal expected As Double, _
    ByVal tolerance As Double, _
    ByVal label As String)

    If IsError(actual) Or Not IsNumeric(actual) Then
        Err.Raise vbObjectError + 733, , label & " is not numeric."
    End If

    If Abs(CDbl(actual) - expected) > tolerance Then
        Err.Raise vbObjectError + 734, , _
            label & " failed validation. Expected " & expected & _
            "; found " & actual & "."
    End If
End Sub

Private Function ExistingBuildIsComplete(ByVal wb As Workbook) As Boolean
    On Error GoTo NotComplete
    ValidateNativeBuild wb
    ExistingBuildIsComplete = True
    Exit Function

NotComplete:
    Err.Clear
    ExistingBuildIsComplete = False
End Function

Private Sub DeleteNativeObjects(ByVal wb As Workbook)
    Dim ws As Worksheet
    Dim names As Variant
    Dim item As Variant
    Dim pt As PivotTable

    DeleteAllSlicerCaches wb

    Set ws = wb.Worksheets(DASH_SHEET)
    DeleteChartIfPresent ws, "PC_InternetType"
    DeleteChartIfPresent ws, "PC_ChurnReasons"
    DeleteChartIfPresent ws, "PC_RiskTier"

    names = Array( _
        "PT_ContractTenure", _
        "PT_RiskTierVolume", _
        "PT_RiskTier", _
        "PT_ChurnReasons", _
        "PT_InternetType", _
        "PT_KPI_Context")

    For Each item In names
        Set pt = Nothing
        On Error Resume Next
        Set pt = wb.Worksheets(PIVOT_SHEET).PivotTables(CStr(item))
        If Not pt Is Nothing Then pt.TableRange2.Clear
        On Error GoTo 0
    Next item
End Sub

Private Sub DeleteAllSlicerCaches(ByVal wb As Workbook)
    DeleteSlicerCacheIfPresent wb, "SC_Contract"
    DeleteSlicerCacheIfPresent wb, "SC_TenureBand"
    DeleteSlicerCacheIfPresent wb, "SC_InternetType"
End Sub

Private Sub DeleteSlicerCacheIfPresent(ByVal wb As Workbook, ByVal cacheName As String)
    On Error Resume Next
    wb.SlicerCaches(cacheName).Delete
    On Error GoTo 0
End Sub

Private Sub DeleteChartIfPresent(ByVal ws As Worksheet, ByVal chartName As String)
    On Error Resume Next
    ws.ChartObjects(chartName).Delete
    On Error GoTo 0
End Sub

Private Function GetPivot(ByVal wb As Workbook, ByVal pivotName As String) As PivotTable
    On Error Resume Next
    Set GetPivot = wb.Worksheets(PIVOT_SHEET).PivotTables(pivotName)
    On Error GoTo 0

    If GetPivot Is Nothing Then
        Err.Raise vbObjectError + 740, , _
            "Required PivotTable was not found: " & pivotName
    End If
End Function

Private Function RequiredPivotNames() As Variant
    RequiredPivotNames = Array( _
        "PT_KPI_Context", _
        "PT_InternetType", _
        "PT_ChurnReasons", _
        "PT_RiskTier", _
        "PT_RiskTierVolume", _
        "PT_ContractTenure")
End Function

Private Function ChartPivotName(ByVal co As ChartObject) As String
    Dim pt As PivotTable

    On Error Resume Next
    Set pt = co.Chart.PivotLayout.PivotTable
    If Not pt Is Nothing Then ChartPivotName = pt.Name
    On Error GoTo 0
End Function

Private Sub RequireChart( _
    ByVal wb As Workbook, _
    ByVal chartName As String, _
    ByVal pivotName As String)

    Dim co As ChartObject

    On Error Resume Next
    Set co = wb.Worksheets(DASH_SHEET).ChartObjects(chartName)
    On Error GoTo 0

    If co Is Nothing Then
        Err.Raise vbObjectError + 741, , _
            "Required PivotChart was not found: " & chartName
    End If

    If ChartPivotName(co) <> pivotName Then
        Err.Raise vbObjectError + 742, , _
            chartName & " is not connected to " & pivotName & "."
    End If
End Sub

Private Sub RequireDataField(ByVal pt As PivotTable, ByVal fieldName As String)
    Dim pf As PivotField

    On Error Resume Next
    Set pf = pt.DataFields(fieldName)
    On Error GoTo 0

    If pf Is Nothing Then
        Err.Raise vbObjectError + 745, , _
            pt.Name & " is missing required data field " & fieldName & "."
    End If
End Sub

Private Function FindSlicerCache( _
    ByVal wb As Workbook, _
    ByVal fieldName As String) As SlicerCache

    Dim sc As SlicerCache
    Dim sourceName As String

    For Each sc In wb.SlicerCaches
        sourceName = vbNullString
        On Error Resume Next
        sourceName = sc.SourceName
        On Error GoTo 0

        If StrComp(sourceName, fieldName, vbTextCompare) = 0 Then
            Set FindSlicerCache = sc
            Exit Function
        End If
    Next sc

    Err.Raise vbObjectError + 743, , _
        "No slicer cache was found for field " & fieldName & "."
End Function

Private Function SlicerHasPivot( _
    ByVal sc As SlicerCache, _
    ByVal pivotName As String) As Boolean

    Dim i As Long
    Dim itemName As String

    On Error Resume Next
    For i = 1 To sc.PivotTables.Count
        itemName = sc.PivotTables.Item(i).Name
        If StrComp(itemName, pivotName, vbTextCompare) = 0 Then
            SlicerHasPivot = True
            Exit Function
        End If
    Next i
    On Error GoTo 0
End Function

Private Sub RequireSixConnections( _
    ByVal sc As SlicerCache, _
    ByVal fieldName As String)

    Dim names As Variant
    Dim item As Variant

    names = RequiredPivotNames()
    For Each item In names
        If Not SlicerHasPivot(sc, CStr(item)) Then
            Err.Raise vbObjectError + 744, , _
                fieldName & " is not connected to " & CStr(item) & "."
        End If
    Next item
End Sub

Private Sub ClearAllSlicerFilters(ByVal wb As Workbook)
    Dim sc As SlicerCache

    On Error Resume Next
    For Each sc In wb.SlicerCaches
        sc.ClearManualFilter
    Next sc
    On Error GoTo 0
End Sub

Private Sub ShowSlicerFallback(ByVal wb As Workbook)
    wb.Worksheets(PIVOT_SHEET).Activate
    GetPivot(wb, "PT_KPI_Context").TableRange2.Cells(1, 1).Select

    MsgBox _
        "Excel created all six PivotTables and all three PivotCharts, but " & _
        "this Excel build did not permit VBA slicer creation or report " & _
        "connections." & vbCrLf & vbCrLf & _
        mSlicerError & vbCrLf & vbCrLf & _
        "Select PT_KPI_Context and insert slicers for Contract, " & _
        "Tenure_Band_Slicer, and Internet Type. Place them at A4:H6, " & _
        "I4:P6, and Q4:X6 on 01_Dashboard. Connect each slicer to all six " & _
        "PivotTables using Report Connections." & vbCrLf & vbCrLf & _
        "Then rerun BuildRetentionDashboard to validate and finish.", _
        vbExclamation, _
        "Manual Mac Slicer Step Required"
End Sub

Private Sub ShowSupportSheets(ByVal wb As Workbook)
    wb.Worksheets(DASH_SHEET).Visible = xlSheetVisible
    wb.Worksheets(PIVOT_SHEET).Visible = xlSheetVisible
    wb.Worksheets(CALC_SHEET).Visible = xlSheetVisible
    wb.Worksheets(DATA_SHEET).Visible = xlSheetVisible
End Sub

Private Function SheetExists( _
    ByVal wb As Workbook, _
    ByVal sheetName As String) As Boolean

    Dim ws As Worksheet

    On Error Resume Next
    Set ws = wb.Worksheets(sheetName)
    SheetExists = Not ws Is Nothing
    On Error GoTo 0
End Function

Private Sub BeginApplicationState()
    mOldCalculation = Application.Calculation
    mOldScreenUpdating = Application.ScreenUpdating
    mOldEnableEvents = Application.EnableEvents
    mOldDisplayAlerts = Application.DisplayAlerts
    mStateCaptured = True

    Application.ScreenUpdating = False
    Application.EnableEvents = False
    Application.DisplayAlerts = False
    Application.Calculation = xlCalculationAutomatic
    Application.StatusBar = "Building customer retention dashboard..."
End Sub

Private Sub RestoreApplicationState()
    If Not mStateCaptured Then Exit Sub

    On Error Resume Next
    Application.Calculation = mOldCalculation
    Application.ScreenUpdating = mOldScreenUpdating
    Application.EnableEvents = mOldEnableEvents
    Application.DisplayAlerts = mOldDisplayAlerts
    Application.StatusBar = False
    mStateCaptured = False
    On Error GoTo 0
End Sub
