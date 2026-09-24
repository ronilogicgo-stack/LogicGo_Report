"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

const MILESTONE_STYLES = {
  Received: "🧾",
  "Under Repair": "🔧",
  "QC Passed": "✅",
  "QC Failed": "⚠️",
  "Sent to Courier": "🚚",
  Delivered: "📦",
  Closed: "🏁",
};

function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TrackRmaPage() {
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleTrack(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setResult(null);
    setNotFound(false);

    const { data, error } = await supabase.rpc("rma_public_track", { p_tracking_code: code.trim() });

    setLoading(false);
    if (error || !data || data.length === 0) {
      setNotFound(true);
      return;
    }
    setResult(data[0]);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 sm:p-8 space-y-5">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-800">Track Your Repair</h1>
          <p className="text-sm text-slate-500 mt-1">Enter the tracking code you were given</p>
        </div>

        <form onSubmit={handleTrack} className="space-y-3">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A1B2C3D4E5F6"
            className="w-full border rounded-lg px-4 py-3 text-center tracking-widest font-mono text-sm uppercase"
          />
          <button
            disabled={loading}
            className="w-full bg-indigo-600 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Checking..." : "Track"}
          </button>
        </form>

        {notFound && (
          <p className="text-sm text-red-600 text-center">
            No repair found for that code. Please double-check it and try again.
          </p>
        )}

        {result && (
          <div className="border-t pt-4 space-y-3">
            <div className="text-center">
              <p className="text-xs text-slate-400">{result.rma_number}</p>
              <p className="text-lg font-semibold text-slate-800">{result.product_name}</p>
              {result.product_model && <p className="text-sm text-slate-500">{result.product_model}</p>}
              <span className="inline-block mt-2 text-sm font-medium bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full">
                {result.status}
              </span>
            </div>

            {result.estimated_delivery && (
              <p className="text-sm text-center text-slate-600">
                Estimated Delivery: <span className="font-medium">{formatDate(result.estimated_delivery)}</span>
              </p>
            )}
            {result.courier_company && (
              <p className="text-sm text-center text-slate-600">
                Courier: <span className="font-medium">{result.courier_company}</span>
                {result.courier_tracking && ` (${result.courier_tracking})`}
              </p>
            )}

            <div className="space-y-2 pt-2">
              {(result.milestones || []).map((m, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="text-lg">{MILESTONE_STYLES[m.label] || "•"}</span>
                  <span className="flex-1 text-slate-700">{m.label}</span>
                  <span className="text-slate-400 text-xs">{formatDate(m.at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center pt-2">
          <Link href="/login" className="text-xs text-slate-400 underline">
            Staff Login
          </Link>
        </div>
      </div>
    </div>
  );
}
