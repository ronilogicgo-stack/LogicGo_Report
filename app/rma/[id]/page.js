"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { RMA_STATUSES, STATUS_COLORS, ACTION_LABELS, formatDateTime } from "@/lib/rma";
import { useRmaAccess } from "../layout";

export default function RmaDetailPage() {
  const supabase = createClient();
  const { id } = useParams();
  const { canEdit } = useRmaAccess();

  const [rma, setRma] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Small per-action form state
  const [remarkText, setRemarkText] = useState("");
  const [statusChoice, setStatusChoice] = useState("");
  const [statusRemark, setStatusRemark] = useState("");
  const [estDate, setEstDate] = useState("");
  const [estReason, setEstReason] = useState("");
  const [diagnosisText, setDiagnosisText] = useState("");
  const [repairText, setRepairText] = useState("");
  const [qcResult, setQcResult] = useState("Passed");
  const [qcRemarks, setQcRemarks] = useState("");
  const [courierCompany, setCourierCompany] = useState("");
  const [courierTracking, setCourierTracking] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: r }, { data: log }] = await Promise.all([
      supabase.from("rma_records").select("*").eq("id", id).single(),
      supabase.from("rma_audit_log").select("*").eq("rma_id", id).order("created_at", { ascending: true }),
    ]);
    setRma(r || null);
    setTimeline(log || []);
    if (r) setStatusChoice(r.status);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`rma_detail_${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rma_records", filter: `id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "rma_audit_log", filter: `rma_id=eq.${id}` }, () => load())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [supabase, id, load]);

  async function callAction(fn, args, resetFns = []) {
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase.rpc(fn, args);
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    resetFns.forEach((r) => r());
    load();
  }

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!rma) return <p className="text-slate-500">RMA not found.</p>;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">{rma.rma_number}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[rma.status]}`}>{rma.status}</span>
        </div>
        <Link href="/rma" className="text-sm text-blue-600 underline">
          ← All RMAs
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-slate-500">Customer</p>
            <p className="font-medium">{rma.customer_name}</p>
            <p className="text-slate-500">{rma.customer_phone}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Product</p>
            <p className="font-medium">
              {rma.product_name} {rma.product_model && `(${rma.product_model})`}
            </p>
            {rma.serial_number && <p className="text-slate-500">SN: {rma.serial_number}</p>}
          </div>
        </div>
        {rma.issue_description && (
          <div>
            <p className="text-xs text-slate-500">Issue</p>
            <p>{rma.issue_description}</p>
          </div>
        )}
        <div className="border-t pt-2 text-xs text-slate-500">
          Created By: <span className="font-medium text-slate-700">{rma.created_by_name}</span> (
          {rma.created_by_role}) · {formatDateTime(rma.created_at)}
        </div>
        {rma.controlled_by_name && (
          <div className="text-xs text-slate-500">
            Taken Under Control By:{" "}
            <span className="font-medium text-slate-700">{rma.controlled_by_name}</span> ·{" "}
            {formatDateTime(rma.controlled_at)}
          </div>
        )}
        {rma.estimated_delivery && (
          <div className="text-xs text-slate-500">
            Estimated Delivery: <span className="font-medium text-slate-700">{formatDateTime(rma.estimated_delivery)}</span>
          </div>
        )}
        {rma.diagnosis && (
          <div className="text-xs text-slate-500">
            Diagnosis: <span className="font-medium text-slate-700">{rma.diagnosis}</span> (by{" "}
            {rma.diagnosis_by_name}, {formatDateTime(rma.diagnosis_at)})
          </div>
        )}
        {rma.repair_action && (
          <div className="text-xs text-slate-500">
            Repair: <span className="font-medium text-slate-700">{rma.repair_action}</span> (by{" "}
            {rma.repair_by_name}, {formatDateTime(rma.repair_at)})
          </div>
        )}
        {rma.qc_result && (
          <div className="text-xs text-slate-500">
            QC: <span className="font-medium text-slate-700">{rma.qc_result}</span> (by {rma.qc_by_name},{" "}
            {formatDateTime(rma.qc_at)})
          </div>
        )}
        {rma.courier_company && (
          <div className="text-xs text-slate-500">
            Courier: <span className="font-medium text-slate-700">{rma.courier_company} · {rma.courier_tracking}</span>{" "}
            (by {rma.courier_by_name}, {formatDateTime(rma.courier_at)})
          </div>
        )}
        {rma.receiver_name && (
          <div className="text-xs text-slate-500">
            Delivered To: <span className="font-medium text-slate-700">{rma.receiver_name} ({rma.delivery_method})</span>{" "}
            (by {rma.delivered_by_name}, {formatDateTime(rma.delivered_at)})
          </div>
        )}
      </div>

      {canEdit && rma.status !== "Closed" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
          <h2 className="font-semibold text-sm">Actions</h2>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!rma.controlled_by && (
            <button
              disabled={busy}
              onClick={() => callAction("rma_take_control", { p_rma_id: id })}
              className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Take Control
            </button>
          )}

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Change Status</p>
            <div className="flex flex-wrap gap-2">
              <select value={statusChoice} onChange={(e) => setStatusChoice(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                {RMA_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Remark (optional)"
                value={statusRemark}
                onChange={(e) => setStatusRemark(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <button
                disabled={busy}
                onClick={() =>
                  callAction("rma_change_status", { p_rma_id: id, p_new_status: statusChoice, p_remark: statusRemark || null }, [
                    () => setStatusRemark(""),
                  ])
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Add Remark</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1"
                placeholder="e.g. Power IC damaged. Replacement part required."
              />
              <button
                disabled={busy || !remarkText.trim()}
                onClick={() => callAction("rma_add_remark", { p_rma_id: id, p_remark: remarkText }, [() => setRemarkText("")])}
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Estimated Delivery</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="datetime-local"
                value={estDate}
                onChange={(e) => setEstDate(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm"
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={estReason}
                onChange={(e) => setEstReason(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <button
                disabled={busy || !estDate}
                onClick={() =>
                  callAction(
                    "rma_update_estimated_delivery",
                    { p_rma_id: id, p_new_date: new Date(estDate).toISOString(), p_reason: estReason || null },
                    [() => setEstDate(""), () => setEstReason("")]
                  )
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Update
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Diagnosis</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1"
              />
              <button
                disabled={busy || !diagnosisText.trim()}
                onClick={() =>
                  callAction("rma_add_diagnosis", { p_rma_id: id, p_diagnosis: diagnosisText }, [() => setDiagnosisText("")])
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Repair Action</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={repairText}
                onChange={(e) => setRepairText(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1"
              />
              <button
                disabled={busy || !repairText.trim()}
                onClick={() => callAction("rma_add_repair", { p_rma_id: id, p_repair: repairText }, [() => setRepairText("")])}
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">QC</p>
            <div className="flex flex-wrap gap-2">
              <select value={qcResult} onChange={(e) => setQcResult(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
              </select>
              <input
                type="text"
                placeholder="Remarks (optional)"
                value={qcRemarks}
                onChange={(e) => setQcRemarks(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <button
                disabled={busy}
                onClick={() =>
                  callAction("rma_qc_complete", { p_rma_id: id, p_result: qcResult, p_remarks: qcRemarks || null }, [
                    () => setQcRemarks(""),
                  ])
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Courier</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Courier Company"
                value={courierCompany}
                onChange={(e) => setCourierCompany(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]"
              />
              <input
                type="text"
                placeholder="Tracking Number"
                value={courierTracking}
                onChange={(e) => setCourierTracking(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]"
              />
              <button
                disabled={busy || !courierCompany.trim()}
                onClick={() =>
                  callAction("rma_courier_update", { p_rma_id: id, p_company: courierCompany, p_tracking: courierTracking }, [
                    () => setCourierCompany(""),
                    () => setCourierTracking(""),
                  ])
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-slate-500 mb-1">Customer Received</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Receiver Name"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]"
              />
              <input
                type="text"
                placeholder="Delivery Method (e.g. Office Pickup)"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
                className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]"
              />
              <button
                disabled={busy || !receiverName.trim()}
                onClick={() =>
                  callAction("rma_customer_received", { p_rma_id: id, p_receiver: receiverName, p_method: deliveryMethod }, [
                    () => setReceiverName(""),
                    () => setDeliveryMethod(""),
                  ])
                }
                className="bg-slate-900 text-white rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t pt-3">
            <button
              disabled={busy}
              onClick={() => {
                if (confirm("Close this RMA? This marks it fully complete.")) callAction("rma_close", { p_rma_id: id });
              }}
              className="bg-gray-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Close RMA
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
        <h2 className="font-semibold text-sm mb-3">Activity Timeline</h2>
        <div className="space-y-3">
          {timeline.map((t) => (
            <div key={t.id} className="border-l-2 border-slate-200 pl-3">
              <p className="text-xs text-slate-400">{formatDateTime(t.created_at)}</p>
              <p className="text-sm font-medium">{ACTION_LABELS[t.action] || t.action}</p>
              {t.previous_value && t.new_value && (
                <p className="text-xs text-slate-500">
                  {t.previous_value} → {t.new_value}
                </p>
              )}
              {!t.previous_value && t.new_value && <p className="text-xs text-slate-500">{t.new_value}</p>}
              {t.remark && <p className="text-xs text-slate-600 italic">"{t.remark}"</p>}
              <p className="text-xs text-slate-400">
                By: {t.user_name_snapshot} ({t.user_role_snapshot})
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
