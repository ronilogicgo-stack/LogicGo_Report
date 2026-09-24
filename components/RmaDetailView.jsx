"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";
import { RMA_STATUSES, STATUS_COLORS, ACTION_LABELS, formatDateTime } from "@/lib/rma";
import {
  ShieldCheck, RefreshCw, MessageSquare, CalendarClock, Stethoscope,
  Wrench, CheckCircle2, Truck, PackageCheck, ChevronDown,
} from "lucide-react";

export default function RmaDetailView({ basePath, canEdit }) {
  const supabase = createClient();
  const { id } = useParams();

  const [rma, setRma] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openAction, setOpenAction] = useState(null);

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
        <Link href={basePath} className="text-sm text-blue-600 underline">
          ← All RMAs
        </Link>
      </div>

      {rma.tracking_code && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-indigo-500">Give this code to the customer to track online (no login needed)</p>
            <p className="font-mono font-semibold tracking-widest text-indigo-800">{rma.tracking_code}</p>
          </div>
          <button
            onClick={() => navigator.clipboard?.writeText(rma.tracking_code)}
            className="text-xs bg-white border border-indigo-200 text-indigo-600 rounded-lg px-3 py-1.5 whitespace-nowrap"
          >
            Copy
          </button>
        </div>
      )}

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
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3">
          <h2 className="font-semibold text-sm">Actions</h2>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!rma.controlled_by && (
            <button
              disabled={busy}
              onClick={() => callAction("rma_take_control", { p_rma_id: id })}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-xl px-4 py-3.5 text-base font-medium disabled:opacity-50"
            >
              <ShieldCheck size={20} /> Take Control
            </button>
          )}

          <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            <AccordionItem
              icon={RefreshCw}
              title="Change Status"
              subtitle={rma.status}
              open={openAction === "status"}
              onToggle={() => setOpenAction(openAction === "status" ? null : "status")}
            >
              <select
                value={statusChoice}
                onChange={(e) => setStatusChoice(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              >
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
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                onClick={() =>
                  callAction("rma_change_status", { p_rma_id: id, p_new_status: statusChoice, p_remark: statusRemark || null }, [
                    () => setStatusRemark(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Update
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={MessageSquare}
              title="Add Remark"
              open={openAction === "remark"}
              onToggle={() => setOpenAction(openAction === "remark" ? null : "remark")}
            >
              <input
                type="text"
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
                placeholder="e.g. Power IC damaged. Replacement part required."
              />
              <ActionButton
                busy={busy}
                disabled={!remarkText.trim()}
                onClick={() =>
                  callAction("rma_add_remark", { p_rma_id: id, p_remark: remarkText }, [
                    () => setRemarkText(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Add
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={CalendarClock}
              title="Estimated Delivery"
              subtitle={rma.estimated_delivery ? formatDateTime(rma.estimated_delivery) : null}
              open={openAction === "delivery"}
              onToggle={() => setOpenAction(openAction === "delivery" ? null : "delivery")}
            >
              <input
                type="datetime-local"
                value={estDate}
                onChange={(e) => setEstDate(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Reason (optional)"
                value={estReason}
                onChange={(e) => setEstReason(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                disabled={!estDate}
                onClick={() =>
                  callAction(
                    "rma_update_estimated_delivery",
                    { p_rma_id: id, p_new_date: new Date(estDate).toISOString(), p_reason: estReason || null },
                    [() => setEstDate(""), () => setEstReason(""), () => setOpenAction(null)]
                  )
                }
              >
                Update
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={Stethoscope}
              title="Diagnosis"
              subtitle={rma.diagnosis}
              open={openAction === "diagnosis"}
              onToggle={() => setOpenAction(openAction === "diagnosis" ? null : "diagnosis")}
            >
              <input
                type="text"
                value={diagnosisText}
                onChange={(e) => setDiagnosisText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                disabled={!diagnosisText.trim()}
                onClick={() =>
                  callAction("rma_add_diagnosis", { p_rma_id: id, p_diagnosis: diagnosisText }, [
                    () => setDiagnosisText(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Save
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={Wrench}
              title="Repair Action"
              subtitle={rma.repair_action}
              open={openAction === "repair"}
              onToggle={() => setOpenAction(openAction === "repair" ? null : "repair")}
            >
              <input
                type="text"
                value={repairText}
                onChange={(e) => setRepairText(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                disabled={!repairText.trim()}
                onClick={() =>
                  callAction("rma_add_repair", { p_rma_id: id, p_repair: repairText }, [
                    () => setRepairText(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Save
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={CheckCircle2}
              title="QC"
              subtitle={rma.qc_result}
              open={openAction === "qc"}
              onToggle={() => setOpenAction(openAction === "qc" ? null : "qc")}
            >
              <select
                value={qcResult}
                onChange={(e) => setQcResult(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              >
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
              </select>
              <input
                type="text"
                placeholder="Remarks (optional)"
                value={qcRemarks}
                onChange={(e) => setQcRemarks(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                onClick={() =>
                  callAction("rma_qc_complete", { p_rma_id: id, p_result: qcResult, p_remarks: qcRemarks || null }, [
                    () => setQcRemarks(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Save
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={Truck}
              title="Courier"
              subtitle={rma.courier_company}
              open={openAction === "courier"}
              onToggle={() => setOpenAction(openAction === "courier" ? null : "courier")}
            >
              <input
                type="text"
                placeholder="Courier Company"
                value={courierCompany}
                onChange={(e) => setCourierCompany(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Tracking Number"
                value={courierTracking}
                onChange={(e) => setCourierTracking(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                disabled={!courierCompany.trim()}
                onClick={() =>
                  callAction("rma_courier_update", { p_rma_id: id, p_company: courierCompany, p_tracking: courierTracking }, [
                    () => setCourierCompany(""),
                    () => setCourierTracking(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Save
              </ActionButton>
            </AccordionItem>

            <AccordionItem
              icon={PackageCheck}
              title="Customer Received"
              subtitle={rma.receiver_name}
              open={openAction === "received"}
              onToggle={() => setOpenAction(openAction === "received" ? null : "received")}
            >
              <input
                type="text"
                placeholder="Receiver Name"
                value={receiverName}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <input
                type="text"
                placeholder="Delivery Method (e.g. Office Pickup)"
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
                className="w-full border rounded-lg px-3 py-2.5 text-sm"
              />
              <ActionButton
                busy={busy}
                disabled={!receiverName.trim()}
                onClick={() =>
                  callAction("rma_customer_received", { p_rma_id: id, p_receiver: receiverName, p_method: deliveryMethod }, [
                    () => setReceiverName(""),
                    () => setDeliveryMethod(""),
                    () => setOpenAction(null),
                  ])
                }
              >
                Save
              </ActionButton>
            </AccordionItem>
          </div>

          <button
            disabled={busy}
            onClick={() => {
              if (confirm("Close this RMA? This marks it fully complete.")) callAction("rma_close", { p_rma_id: id });
            }}
            className="w-full bg-gray-700 text-white rounded-xl px-4 py-3.5 text-base font-medium disabled:opacity-50"
          >
            Close RMA
          </button>
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

function AccordionItem({ icon: Icon, title, subtitle, open, onToggle, children }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex items-center gap-3 min-w-0">
          <Icon size={19} className="text-slate-400 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-700">{title}</span>
            {subtitle && <span className="block text-xs text-slate-400 truncate">{subtitle}</span>}
          </span>
        </span>
        <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-4 pb-4 space-y-2 bg-slate-50">{children}</div>}
    </div>
  );
}

function ActionButton({ busy, disabled, onClick, children }) {
  return (
    <button
      disabled={busy || disabled}
      onClick={onClick}
      className="w-full bg-slate-900 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50"
    >
      {children}
    </button>
  );
}
