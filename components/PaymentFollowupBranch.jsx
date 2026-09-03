"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Phone, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabaseClient";
import { fmt, dateKey, sortFollowups, followupPriority } from "@/lib/calculations";
import { downloadCSV } from "@/lib/csv";
import ExportButtons from "@/components/ExportButtons";

/** Normalizes a Bangladeshi phone number (with or without a leading 0
 * or the 880 country code, with or without dashes/spaces) into a bare
 * international-format digit string, e.g. "01712-358262" -> "8801712358262". */
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "880" + digits.slice(1);
  if (digits.length === 10) return "880" + digits;
  return digits;
}

function PhoneActions({ phone }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return <span>{phone || "-"}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span>{phone}</span>
      <a
        href={`tel:+${normalized}`}
        title="Call"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 shrink-0"
      >
        <Phone size={12} strokeWidth={2.5} />
      </a>
      <a
        href={`https://wa.me/${normalized}`}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 shrink-0"
      >
        <MessageCircle size={12} strokeWidth={2.5} />
      </a>
    </span>
  );
}

/** Shows at most `n` words, with the full text available as a native
 * hover tooltip - used for Location and Note so the table doesn't get
 * cluttered with long addresses/notes. */
function TruncatedText({ text, words = 3, className = "" }) {
  if (!text) return <span className={className}>-</span>;
  const parts = String(text).trim().split(/\s+/);
  const preview = parts.length > words ? parts.slice(0, words).join(" ") + "…" : text;
  return (
    <span className={className} title={text}>
      {preview}
    </span>
  );
}

const emptyForm = {
  serial: "",
  entry_date: dateKey(),
  executive_name: "",
  area_name: "",
  company_name: "",
  phone_number: "",
  location: "",
  received_amount: "",
  due_amount: "",
  payment_status: "Due",
  ledger_due: "",
  note: "",
  followup_date: "",
};

/** The 5 stored follow-up slots are collapsed into ONE editable date in
 * the form - simpler to use, while still preserving history. Finds
 * whichever of the 5 slots currently holds the latest date (the one
 * driving the red/yellow priority) so editing it updates that slot;
 * if none are set yet, the new date goes into slot 1. */
function latestFollowupSlot(record) {
  const slots = [
    record?.followup_date_1,
    record?.followup_date_2,
    record?.followup_date_3,
    record?.followup_date_4,
    record?.followup_date_5,
  ];
  let idx = -1;
  let val = null;
  slots.forEach((d, i) => {
    if (d && (!val || d > val)) {
      val = d;
      idx = i;
    }
  });
  return { index: idx === -1 ? 0 : idx, value: val };
}

function buildFollowupSlots(record, newDateValue) {
  const slots = [
    record?.followup_date_1 || null,
    record?.followup_date_2 || null,
    record?.followup_date_3 || null,
    record?.followup_date_4 || null,
    record?.followup_date_5 || null,
  ];
  const { index } = latestFollowupSlot(record);
  slots[index] = newDateValue || null;
  return {
    followup_date_1: slots[0],
    followup_date_2: slots[1],
    followup_date_3: slots[2],
    followup_date_4: slots[3],
    followup_date_5: slots[4],
  };
}

const ROW_TONE = {
  red: "bg-red-50",
  yellow: "bg-amber-50",
  normal: "",
};

const BADGE_TONE = {
  red: "bg-red-100 text-red-700",
  yellow: "bg-amber-100 text-amber-700",
  normal: "bg-slate-100 text-slate-500",
};

const BADGE_LABEL = {
  red: "Overdue",
  yellow: "Due tomorrow",
  normal: "On track",
};

/**
 * The Payment Follow-Up table for ONE branch - shared by both the
 * Admin's view (which always has full edit rights over every branch)
 * and a team member's view (whose rights depend on whether they were
 * granted "editor" or "viewer" access to this specific branch).
 *
 * Priority (red/yellow/normal) is computed fresh every time this loads
 * from whichever follow-up date is most recent - there's no manual
 * reordering or locking needed, unlike the original spreadsheet.
 */
export default function PaymentFollowupBranch({ branchId, branchName, canEdit }) {
  const supabase = createClient();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payment_followups")
      .select("*")
      .eq("branch_id", branchId);
    setRecords(data || []);
    setLoading(false);
  }, [branchId, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const sorted = useMemo(() => sortFollowups(records), [records]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, normal: 0 };
    for (const r of records) c[followupPriority(r)]++;
    return c;
  }, [records]);

  function startAdd() {
    const nextSerial =
      records.reduce((max, r) => Math.max(max, Number(r.serial) || 0), 0) + 1;
    setForm({ ...emptyForm, serial: nextSerial });
    setEditingId(null);
    setEditingRecord(null);
    setShowForm(true);
  }

  function startEdit(r) {
    setForm({
      serial: r.serial ?? "",
      entry_date: r.entry_date ?? "",
      executive_name: r.executive_name ?? "",
      area_name: r.area_name ?? "",
      company_name: r.company_name ?? "",
      phone_number: r.phone_number ?? "",
      location: r.location ?? "",
      received_amount: r.received_amount ?? "",
      due_amount: r.due_amount ?? "",
      payment_status: r.payment_status ?? "Due",
      ledger_due: r.ledger_due ?? "",
      note: r.note ?? "",
      followup_date: latestFollowupSlot(r).value ?? "",
    });
    setEditingId(r.id);
    setEditingRecord(r);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);

    const payload = {
      branch_id: branchId,
      serial: Number(form.serial) || null,
      entry_date: form.entry_date || null,
      executive_name: form.executive_name,
      area_name: form.area_name,
      company_name: form.company_name,
      phone_number: form.phone_number,
      location: form.location,
      received_amount: Number(form.received_amount) || 0,
      due_amount: Number(form.due_amount) || 0,
      payment_status: form.payment_status,
      ledger_due: Number(form.ledger_due) || 0,
      note: form.note,
      ...buildFollowupSlots(editingId ? editingRecord : null, form.followup_date || null),
    };

    const { error: saveError } = editingId
      ? await supabase.from("payment_followups").update(payload).eq("id", editingId)
      : await supabase.from("payment_followups").insert(payload);

    if (saveError) {
      setError(saveError.message);
    } else {
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    setEditingRecord(null);
      load();
    }
    setSaving(false);
  }

  async function handleDelete(r) {
    if (!confirm(`Delete the record for "${r.company_name}"? This cannot be undone.`)) return;
    const { error: delError } = await supabase.from("payment_followups").delete().eq("id", r.id);
    if (delError) {
      alert(`Could not delete: ${delError.message}`);
      return;
    }
    load();
  }

  function exportCSV() {
    const headers = [
      "Serial", "Entry Date", "Executive", "Area/Client", "Company", "Phone", "Location",
      "Received", "Due", "Status", "Ledger Due", "Note",
      "1st Followup", "2nd Followup", "3rd Followup", "4th Followup", "5th Followup",
    ];
    const rows = sorted.map((r) => [
      r.serial, r.entry_date, r.executive_name, r.area_name, r.company_name, r.phone_number,
      r.location, r.received_amount, r.due_amount, r.payment_status, r.ledger_due, r.note,
      r.followup_date_1, r.followup_date_2, r.followup_date_3, r.followup_date_4, r.followup_date_5,
    ]);
    downloadCSV(`payment_followup_${branchName.replace(/\s+/g, "_")}.csv`, headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">{branchName} · Payment Follow-Up</h1>
          <p className="text-sm text-slate-500">
            {canEdit ? "You can add and edit records here." : "View only - ask an Admin for edit access."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButtons onDownloadCSV={exportCSV} />
          {canEdit && (
            <button
              onClick={startAdd}
              className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-800"
            >
              + Add Record
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 font-medium">
          {counts.red} Overdue
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-700 font-medium">
          {counts.yellow} Due Tomorrow
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 font-medium">
          {counts.normal} On Track
        </span>
      </div>

      {showForm && canEdit && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">
              {editingId ? "Edit Record" : "Add New Record"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
    setEditingRecord(null);
              }}
              className="text-xs text-slate-500 underline"
            >
              Cancel
            </button>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <LabeledInput label="Serial" type="number" value={form.serial} onChange={(v) => setForm({ ...form, serial: v })} />
            <LabeledInput label="Entry Date" type="date" value={form.entry_date} onChange={(v) => setForm({ ...form, entry_date: v })} />
            <LabeledInput label="Executive Name" value={form.executive_name} onChange={(v) => setForm({ ...form, executive_name: v })} />
            <LabeledInput label="Area / Client" value={form.area_name} onChange={(v) => setForm({ ...form, area_name: v })} />
            <LabeledInput label="Company Name" required value={form.company_name} onChange={(v) => setForm({ ...form, company_name: v })} />
            <LabeledInput label="Phone Number" value={form.phone_number} onChange={(v) => setForm({ ...form, phone_number: v })} />
            <LabeledInput label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
            <div>
              <label className="text-xs text-slate-500">Payment Status</label>
              <select
                className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
                value={form.payment_status}
                onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
              >
                <option value="Due">Due</option>
                <option value="Received">Received</option>
              </select>
            </div>
            <LabeledInput label="Received Amount" type="number" value={form.received_amount} onChange={(v) => setForm({ ...form, received_amount: v })} />
            <LabeledInput label="Due Amount" type="number" value={form.due_amount} onChange={(v) => setForm({ ...form, due_amount: v })} />
            <LabeledInput label="Ledger Due" type="number" value={form.ledger_due} onChange={(v) => setForm({ ...form, ledger_due: v })} />
            <LabeledInput label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} />
            <LabeledInput label="Follow-up Date" type="date" value={form.followup_date} onChange={(v) => setForm({ ...form, followup_date: v })} />
          </div>

          <button
            disabled={saving}
            className="bg-slate-900 text-white rounded-lg px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : editingId ? "Update Record" : "Save Record"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : sorted.length === 0 ? (
        <p className="text-slate-500">No records yet.</p>
      ) : (
        <div className="print-area">
          {/* ---------- DESKTOP: table ---------- */}
          <div className="hidden lg:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3">SL</th>
                  <th className="p-3">Entry Date</th>
                  <th className="p-3">Executive</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Location</th>
                  <th className="p-3 text-right num">Received</th>
                  <th className="p-3 text-right num">Due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right num">Ledger Due</th>
                  <th className="p-3">Latest Followup</th>
                  <th className="p-3">Priority</th>
                  {canEdit && <th className="p-3"></th>}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const priority = followupPriority(r);
                  const dates = [
                    r.followup_date_1, r.followup_date_2, r.followup_date_3,
                    r.followup_date_4, r.followup_date_5,
                  ].filter(Boolean);
                  const latest = dates.length ? dates.reduce((m, d) => (d > m ? d : m), dates[0]) : "-";
                  return (
                    <tr key={r.id} className={`border-t ${ROW_TONE[priority]}`}>
                      <td className="p-3 num">{r.serial ?? "-"}</td>
                      <td className="p-3">{r.entry_date || "-"}</td>
                      <td className="p-3">{r.executive_name || "-"}</td>
                      <td className="p-3">
                        <p className="font-medium">{r.company_name}</p>
                        {r.note && (
                          <p
                            className="text-xs text-slate-400 mt-0.5 max-w-[160px] truncate"
                            title={r.note}
                          >
                            {r.note}
                          </p>
                        )}
                      </td>
                      <td className="p-3"><PhoneActions phone={r.phone_number} /></td>
                      <td className="p-3">
                        <TruncatedText text={r.location} words={3} />
                      </td>
                      <td className="p-3 text-right num">{fmt(r.received_amount)}</td>
                      <td className="p-3 text-right num">{fmt(r.due_amount)}</td>
                      <td className="p-3">{r.payment_status}</td>
                      <td className="p-3 text-right num">{fmt(r.ledger_due)}</td>
                      <td className="p-3">{latest}</td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${BADGE_TONE[priority]}`}>
                          {BADGE_LABEL[priority]}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="p-3 whitespace-nowrap space-x-2">
                          <button onClick={() => startEdit(r)} className="text-xs text-blue-600 underline">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(r)} className="text-xs text-red-600 underline">
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ---------- MOBILE: stacked cards ---------- */}
          <div className="lg:hidden space-y-3">
            {sorted.map((r) => {
              const priority = followupPriority(r);
              const dates = [
                r.followup_date_1, r.followup_date_2, r.followup_date_3,
                r.followup_date_4, r.followup_date_5,
              ].filter(Boolean);
              const latest = dates.length ? dates.reduce((m, d) => (d > m ? d : m), dates[0]) : "-";
              return (
                <div key={r.id} className={`rounded-xl border border-slate-200 shadow-sm p-4 ${ROW_TONE[priority]}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold">{r.company_name}</p>
                      <p className="text-xs text-slate-500">
                        {r.executive_name} · <TruncatedText text={r.location} words={3} />
                      </p>
                      {r.note && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate" title={r.note}>
                          {r.note}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 mt-1">
                        <PhoneActions phone={r.phone_number} />
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${BADGE_TONE[priority]}`}>
                      {BADGE_LABEL[priority]}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-sm text-slate-600">
                    <span>Received</span>
                    <span className="text-right num">{fmt(r.received_amount)}</span>
                    <span>Due</span>
                    <span className="text-right num">{fmt(r.due_amount)}</span>
                    <span>Ledger Due</span>
                    <span className="text-right num">{fmt(r.ledger_due)}</span>
                    <span>Latest Followup</span>
                    <span className="text-right">{latest}</span>
                  </div>
                  {canEdit && (
                    <div className="flex gap-4 mt-2 pt-2 border-t">
                      <button onClick={() => startEdit(r)} className="text-xs text-blue-600 underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(r)} className="text-xs text-red-600 underline">
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LabeledInput({ label, value, onChange, type = "text", required }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type={type}
        required={required}
        className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
