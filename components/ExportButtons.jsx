"use client";

/**
 * Two small buttons shown at the top of every report: one downloads
 * the underlying data as a CSV file, the other opens the browser's
 * Print dialog (where "Save as PDF" is a built-in destination on every
 * modern browser/OS) - scoped to just the report content via the
 * `.print-area` class + print CSS in globals.css, so navigation bars
 * and buttons never end up in the PDF.
 */
export default function ExportButtons({ onDownloadCSV, className = "" }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        onClick={onDownloadCSV}
        className="border rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
      >
        ⬇ CSV
      </button>
      <button
        onClick={() => window.print()}
        className="border rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
      >
        🖨 PDF
      </button>
    </div>
  );
}
