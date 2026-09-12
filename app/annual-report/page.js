"use client";

import { useEffect, useState, useCallback, useMemo, Fragment } from "react";
import { createClient } from "@/lib/supabaseClient";
import { fmt, summarizeFromTotals } from "@/lib/calculations";
import { useAnnualReportAccess } from "./layout";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function AnnualReportPage() {
  const supabase = createClient();
  const { canEdit } = useAnnualReportAccess();
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawData, setRawData] = useState([]);
  const [remarksMap, setRemarksMap] = useState({});
  const [savingRemarksFor, setSavingRemarksFor] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [{ data, error: rpcError }, { data: remarkRows }] = await Promise.all([
      supabase.rpc("get_annual_report_data", { p_year: year }),
      supabase.from("annual_report_remarks").select("user_id, remarks").eq("year", year),
    ]);
    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }
    setRawData(data || []);
    setRemarksMap(Object.fromEntries((remarkRows || []).map((r) => [r.user_id, r.remarks])));
    setLoading(false);
  }, [supabase, year]);

  useEffect(() => {
    load();
  }, [load]);

  // Group the flat (user, month) rows from the DB into one row per
  // sales person with a summarized object per month, plus a grand total.
  const people = useMemo(() => {
    const byUser = new Map();
    for (const row of rawData) {
      if (!byUser.has(row.user_id)) {
        byUser.set(row.user_id, {
          user_id: row.user_id,
          full_name: row.full_name,
          location: row.location,
          months: Array(12).fill(null),
        });
      }
      const person = byUser.get(row.user_id);
      const monthIdx = new Date(row.month).getUTCMonth();
      person.months[monthIdx] = summarizeFromTotals(
        {
          total_sales: row.total_sales,
          total_collections: row.total_collections,
          total_sales_return: row.total_sales_return,
          total_other_transaction: row.total_other_transaction,
        },
        {
          sales_target: row.sales_target,
          collection_target: row.collection_target,
          opening_dues: row.opening_dues,
        }
      );
    }

    return Array.from(byUser.values())
      .map((person) => {
        const grandTotal = person.months.reduce(
          (acc, m) => {
            if (!m) return acc;
            acc.sales_target += m.sales_target;
            acc.sales_achievement += m.sales_achievement;
            acc.collection_target += m.collection_target;
            acc.collection_achievement += m.collection_achievement;
            acc.sales_return += m.sales_return;
            acc.net_sales += m.net_sales;
            return acc;
          },
          {
            sales_target: 0,
            sales_achievement: 0,
            collection_target: 0,
            collection_achievement: 0,
            sales_return: 0,
            net_sales: 0,
          }
        );
        grandTotal.collection_gap = grandTotal.net_sales - grandTotal.collection_achievement;
        return { ...person, grandTotal };
      })
      .sort(
        (a, b) =>
          (a.location || "").localeCompare(b.location || "") || a.full_name.localeCompare(b.full_name)
      );
  }, [rawData]);

  async function saveRemark(userId, value) {
    setSavingRemarksFor(userId);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await supabase.from("annual_report_remarks").upsert(
      {
        user_id: userId,
        year,
        remarks: value,
        updated_by: session?.user?.id || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,year" }
    );
    setSavingRemarksFor(null);
  }

  async function exportToExcel() {
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Monthly & Yearly Sales Report", {
        views: [{ state: "frozen", xSplit: 4, ySplit: 6 }],
      });

      const TOTAL_COLS = 3 + 12 * 8 + 7 + 1; // 107, matches the reference template

      ws.mergeCells(1, 1, 1, 4);
      ws.getCell(1, 1).value = "LogicGo";
      ws.getCell(1, 1).font = { bold: true, size: 18 };

      ws.getCell(2, 1).value =
        "House No: 308, Samir Tower, Level: 4, Samir Tower, S J Jahanara Imam Sharani, Elephant Rd, Dhaka 1205";

      ws.mergeCells(3, 1, 3, 4);
      const titleCell = ws.getCell(3, 1);
      titleCell.value = `Sales & Collections Report FY- ${year}`;
      titleCell.font = { bold: true, size: 16 };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFBD4B4" } };

      const headerFont = { bold: true, size: 12 };
      const headerAlign = { horizontal: "center", vertical: "middle" };

      ws.mergeCells(4, 1, 6, 1);
      ws.getCell(4, 1).value = "SL";
      ws.mergeCells(4, 2, 6, 2);
      ws.getCell(4, 2).value = "Sales Person : ";
      ws.mergeCells(4, 3, 6, 3);
      ws.getCell(4, 3).value = "Location";

      let col = 4;
      for (let m = 0; m < 12; m++) {
        ws.mergeCells(4, col, 6, col);
        ws.getCell(4, col).value = "Opening Balance Dues";
        col++;

        ws.mergeCells(4, col, 4, col + 6);
        ws.getCell(4, col).value = `${MONTH_NAMES[m]}'${String(year).slice(-2)}`;

        ws.mergeCells(5, col, 5, col + 1);
        ws.getCell(5, col).value = "Sales";
        ws.getCell(6, col).value = "Target";
        ws.getCell(6, col + 1).value = "Achievement";

        ws.mergeCells(5, col + 2, 5, col + 3);
        ws.getCell(5, col + 2).value = "Collections";
        ws.getCell(6, col + 2).value = "Target";
        ws.getCell(6, col + 3).value = "Achievement";

        ws.mergeCells(5, col + 4, 6, col + 4);
        ws.getCell(5, col + 4).value = "Collection Gap = Total Sales - Total Collections";
        ws.mergeCells(5, col + 5, 6, col + 5);
        ws.getCell(5, col + 5).value = "Sales Return";
        ws.mergeCells(5, col + 6, 6, col + 6);
        ws.getCell(5, col + 6).value = "Net Sales";

        col += 7;
      }

      // Grand Total FY block (7 cols): Sales T/A, Collections T/A, Gap, Return, Net
      const gtCol = col;
      ws.mergeCells(4, gtCol, 4, gtCol + 6);
      ws.getCell(4, gtCol).value = `Grand Total FY-${year}`;
      ws.mergeCells(5, gtCol, 5, gtCol + 1);
      ws.getCell(5, gtCol).value = "Sales";
      ws.getCell(6, gtCol).value = "Target";
      ws.getCell(6, gtCol + 1).value = "Achievement";
      ws.mergeCells(5, gtCol + 2, 5, gtCol + 3);
      ws.getCell(5, gtCol + 2).value = "Collections";
      ws.getCell(6, gtCol + 2).value = "Target";
      ws.getCell(6, gtCol + 3).value = "Achievement";
      ws.mergeCells(5, gtCol + 4, 6, gtCol + 4);
      ws.getCell(5, gtCol + 4).value = "Collection Gap = Total Sales - Total Collections";
      ws.mergeCells(5, gtCol + 5, 6, gtCol + 5);
      ws.getCell(5, gtCol + 5).value = "Sales Return";
      ws.mergeCells(5, gtCol + 6, 6, gtCol + 6);
      ws.getCell(5, gtCol + 6).value = "Net Sales";

      const remarksCol = gtCol + 7;
      ws.mergeCells(4, remarksCol, 6, remarksCol);
      ws.getCell(4, remarksCol).value = "Remaks";

      for (let r = 4; r <= 6; r++) {
        for (let c = 1; c <= TOTAL_COLS; c++) {
          const cell = ws.getCell(r, c);
          cell.font = headerFont;
          cell.alignment = headerAlign;
        }
      }

      // --- Data rows ---
      let rowNum = 7;
      people.forEach((person, idx) => {
        const row = [idx + 1, person.full_name, person.location];
        person.months.forEach((m) => {
          const s = m || {
            opening_dues: 0,
            sales_target: 0,
            sales_achievement: 0,
            collection_target: 0,
            collection_achievement: 0,
            collection_gap: 0,
            sales_return: 0,
            net_sales: 0,
          };
          row.push(
            s.opening_dues,
            s.sales_target,
            s.sales_achievement,
            s.collection_target,
            s.collection_achievement,
            s.collection_gap,
            s.sales_return,
            s.net_sales
          );
        });
        row.push(
          person.grandTotal.sales_target,
          person.grandTotal.sales_achievement,
          person.grandTotal.collection_target,
          person.grandTotal.collection_achievement,
          person.grandTotal.collection_gap,
          person.grandTotal.sales_return,
          person.grandTotal.net_sales
        );
        row.push(remarksMap[person.user_id] || "");
        ws.getRow(rowNum).values = row;
        rowNum++;
      });

      ws.getColumn(1).width = 5;
      ws.getColumn(2).width = 22;
      ws.getColumn(3).width = 12;
      for (let c = 4; c <= TOTAL_COLS; c++) {
        ws.getColumn(c).width = 13;
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Sales_Person_Wise_Monthly_Sales_Report_${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold">Monthly &amp; Yearly Sales Report</h1>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={exportToExcel}
            disabled={exporting || loading || people.length === 0}
            className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            {exporting ? "Exporting..." : "⬇ Export to Excel"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : people.length === 0 ? (
        <p className="text-slate-500">No sales persons found.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="sticky left-0 bg-gray-100 border p-1.5 z-10" rowSpan={3}>
                  SL
                </th>
                <th className="sticky left-8 bg-gray-100 border p-1.5 z-10 min-w-[140px]" rowSpan={3}>
                  Sales Person
                </th>
                <th className="border p-1.5 min-w-[100px]" rowSpan={3}>
                  Location
                </th>
                {MONTH_NAMES.map((name) => (
                  <th key={name} className="border p-1.5" colSpan={8}>
                    {name}
                  </th>
                ))}
                <th className="border p-1.5" colSpan={7}>
                  Grand Total FY-{year}
                </th>
                <th className="border p-1.5 min-w-[160px]" rowSpan={3}>
                  Remarks
                </th>
              </tr>
              <tr>
                {MONTH_NAMES.map((name) => (
                  <Fragment key={name}>
                    <th className="border p-1 font-normal" rowSpan={2}>
                      Opening Dues
                    </th>
                    <th className="border p-1" colSpan={2}>
                      Sales
                    </th>
                    <th className="border p-1" colSpan={2}>
                      Collections
                    </th>
                    <th className="border p-1 font-normal" rowSpan={2}>
                      Gap
                    </th>
                    <th className="border p-1 font-normal" rowSpan={2}>
                      Sales Return
                    </th>
                    <th className="border p-1 font-normal" rowSpan={2}>
                      Net Sales
                    </th>
                  </Fragment>
                ))}
                <th className="border p-1" colSpan={2}>
                  Sales
                </th>
                <th className="border p-1" colSpan={2}>
                  Collections
                </th>
                <th className="border p-1 font-normal" rowSpan={2}>
                  Gap
                </th>
                <th className="border p-1 font-normal" rowSpan={2}>
                  Sales Return
                </th>
                <th className="border p-1 font-normal" rowSpan={2}>
                  Net Sales
                </th>
              </tr>
              <tr>
                {MONTH_NAMES.map((name) => (
                  <Fragment key={name}>
                    <th className="border p-1 font-normal">Target</th>
                    <th className="border p-1 font-normal">Achv.</th>
                    <th className="border p-1 font-normal">Target</th>
                    <th className="border p-1 font-normal">Achv.</th>
                  </Fragment>
                ))}
                <th className="border p-1 font-normal">Target</th>
                <th className="border p-1 font-normal">Achv.</th>
                <th className="border p-1 font-normal">Target</th>
                <th className="border p-1 font-normal">Achv.</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person, idx) => (
                <tr key={person.user_id} className="border-t">
                  <td className="sticky left-0 bg-white border p-1.5 text-center z-10">{idx + 1}</td>
                  <td className="sticky left-8 bg-white border p-1.5 z-10 font-medium">{person.full_name}</td>
                  <td className="border p-1.5">{person.location}</td>
                  {person.months.map((m, mi) => {
                    const s = m || {
                      opening_dues: 0,
                      sales_target: 0,
                      sales_achievement: 0,
                      collection_target: 0,
                      collection_achievement: 0,
                      collection_gap: 0,
                      sales_return: 0,
                      net_sales: 0,
                    };
                    return (
                      <Fragment key={mi}>
                        <td className="border p-1 text-right num">{fmt(s.opening_dues)}</td>
                        <td className="border p-1 text-right num">{fmt(s.sales_target)}</td>
                        <td className="border p-1 text-right num">{fmt(s.sales_achievement)}</td>
                        <td className="border p-1 text-right num">{fmt(s.collection_target)}</td>
                        <td className="border p-1 text-right num">{fmt(s.collection_achievement)}</td>
                        <td className="border p-1 text-right num">{fmt(s.collection_gap)}</td>
                        <td className="border p-1 text-right num">{fmt(s.sales_return)}</td>
                        <td className="border p-1 text-right num font-medium">{fmt(s.net_sales)}</td>
                      </Fragment>
                    );
                  })}
                  <td className="border p-1 text-right num bg-orange-50">{fmt(person.grandTotal.sales_target)}</td>
                  <td className="border p-1 text-right num bg-orange-50">
                    {fmt(person.grandTotal.sales_achievement)}
                  </td>
                  <td className="border p-1 text-right num bg-orange-50">
                    {fmt(person.grandTotal.collection_target)}
                  </td>
                  <td className="border p-1 text-right num bg-orange-50">
                    {fmt(person.grandTotal.collection_achievement)}
                  </td>
                  <td className="border p-1 text-right num bg-orange-50">
                    {fmt(person.grandTotal.collection_gap)}
                  </td>
                  <td className="border p-1 text-right num bg-orange-50">{fmt(person.grandTotal.sales_return)}</td>
                  <td className="border p-1 text-right num bg-orange-50 font-semibold">
                    {fmt(person.grandTotal.net_sales)}
                  </td>
                  <td className="border p-1">
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={remarksMap[person.user_id] || ""}
                        onBlur={(e) => saveRemark(person.user_id, e.target.value)}
                        placeholder={savingRemarksFor === person.user_id ? "Saving..." : ""}
                        className="w-40 border rounded px-1.5 py-1 text-xs"
                      />
                    ) : (
                      remarksMap[person.user_id] || "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
