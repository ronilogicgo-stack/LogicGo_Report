// =====================================================================
// Small shared CSV export helper, used by every report page so the
// download format (quoting, escaping, filename handling) stays
// consistent everywhere.
// =====================================================================

export function downloadCSV(filename, headers, rows) {
  function escapeCell(value) {
    const s = String(value ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const csv =
    headers.map(escapeCell).join(",") +
    "\n" +
    rows.map((row) => row.map(escapeCell).join(",")).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
