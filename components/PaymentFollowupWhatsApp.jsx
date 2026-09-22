"use client";

/**
 * ⚠️ EASY-TO-REMOVE FEATURE
 * Everything for WhatsApp messaging lives in this one file. To remove
 * the feature entirely: delete this file, remove its import and the
 * few JSX blocks marked "WHATSAPP FEATURE" in
 * components/PaymentFollowupBranch.jsx, and optionally drop the
 * payment_followup_whatsapp_targets table in Supabase. Nothing else
 * in the app depends on this.
 *
 * How sending works (a real WhatsApp limitation, not a bug):
 * - For a saved phone number, we open a wa.me link with the message
 *   pre-filled in the chat's text box - WhatsApp itself never lets a
 *   third-party site auto-press Send, so the person still has to
 *   click Send once inside WhatsApp.
 * - For a saved group (WhatsApp gives no way to pre-fill text into an
 *   existing group chat via a link), we instead copy the message to
 *   the clipboard and open the group chat, so the person just pastes
 *   and sends.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabaseClient";

function buildMessage(record) {
  return [
    `Executive: ${record.executive_name || "-"}`,
    `Company: ${record.company_name || "-"}`,
    `Area: ${record.area || "-"}`,
    `Due: ${record.due_amount ?? 0}`,
    `Latest Followup: ${record.latestFollowup || "-"}`,
    record.note ? `Note: ${record.note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Small popover on a table/card row - pick a saved contact/group and
 * send this one record's details to it. */
export function WhatsAppSendButton({ record, targets }) {
  const [open, setOpen] = useState(false);
  const defaultTarget =
    targets.find((t) => t.label.trim().toLowerCase() === (record.executive_name || "").trim().toLowerCase()) ||
    targets[0];
  const [selectedId, setSelectedId] = useState(defaultTarget?.id || "");

  if (targets.length === 0) return null;

  function send() {
    const target = targets.find((t) => t.id === selectedId);
    if (!target) return;
    const message = buildMessage(record);

    if (target.target_type === "number") {
      const digitsOnly = target.target_value.replace(/[^\d]/g, "");
      window.open(`https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`, "_blank");
    } else {
      navigator.clipboard?.writeText(message).catch(() => {});
      window.open(target.target_value, "_blank");
      alert("Message copied - paste it (Ctrl+V) into the WhatsApp group and press Send.");
    }
    setOpen(false);
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-emerald-600 underline"
      >
        WhatsApp
      </button>
      {open && (
        <div className="absolute z-20 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-2 w-56">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full border rounded px-2 py-1 text-xs mb-2"
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.target_type === "group" ? "Group" : "Number"})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={send}
              className="flex-1 bg-emerald-600 text-white text-xs rounded px-2 py-1"
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/** Editor-only panel to add/remove saved WhatsApp contacts and groups
 * for this branch. */
export function WhatsAppContactsManager({ branchId, targets, onChange, canEdit }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("number");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function addTarget(e) {
    e.preventDefault();
    if (!label.trim() || !value.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("payment_followup_whatsapp_targets")
      .insert({ branch_id: branchId, label: label.trim(), target_type: type, target_value: value.trim() })
      .select()
      .single();
    setSaving(false);
    if (error) {
      alert(`Could not save: ${error.message}`);
      return;
    }
    onChange([...targets, data]);
    setLabel("");
    setValue("");
  }

  async function removeTarget(id) {
    if (!confirm("Remove this WhatsApp contact/group?")) return;
    await supabase.from("payment_followup_whatsapp_targets").delete().eq("id", id);
    onChange(targets.filter((t) => t.id !== id));
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold text-slate-700"
      >
        📱 WhatsApp Contacts {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {targets.length === 0 ? (
            <p className="text-xs text-slate-400">No contacts/groups saved yet.</p>
          ) : (
            <div className="space-y-1">
              {targets.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm bg-slate-50 rounded px-3 py-1.5">
                  <span>
                    <span className="font-medium">{t.label}</span>{" "}
                    <span className="text-xs text-slate-400">
                      ({t.target_type === "group" ? "Group" : "Number"}: {t.target_value})
                    </span>
                  </span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeTarget(t.id)}
                      className="text-xs text-red-500 underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {canEdit && (
            <form onSubmit={addTarget} className="flex flex-wrap gap-2 items-end pt-2 border-t">
              <div>
                <label className="text-xs text-slate-500">Label (e.g. Executive name)</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="block border rounded px-2 py-1 text-sm w-40"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="block border rounded px-2 py-1 text-sm"
                >
                  <option value="number">Phone Number</option>
                  <option value="group">Group Link</option>
                </select>
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-slate-500">
                  {type === "number" ? "Phone (with country code, e.g. 8801XXXXXXXXX)" : "Group Invite Link"}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="block border rounded px-2 py-1 text-sm w-full"
                />
              </div>
              <button disabled={saving} className="bg-slate-900 text-white text-xs rounded px-3 py-1.5">
                {saving ? "Saving..." : "Add"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
