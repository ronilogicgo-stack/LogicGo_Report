"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabaseClient";

const GOVERNMENT_HOLIDAY = "Government Holiday";

export default function NotificationsPage() {
  const supabase = createClient();
  const [myId, setMyId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [peopleById, setPeopleById] = useState({});
  const [holidayReasons, setHolidayReasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  // Which inline action panel (if any) is open per-notification, and
  // the draft values inside it before the admin confirms.
  const [openPanel, setOpenPanel] = useState({}); // { [notifId]: 'holiday'|'leave'|'custom' }
  const [holidayChoice, setHolidayChoice] = useState({}); // { [notifId]: string }
  const [newHolidayLabel, setNewHolidayLabel] = useState({}); // { [notifId]: string }
  const [leaveNote, setLeaveNote] = useState({}); // { [notifId]: string }
  const [customNote, setCustomNote] = useState({}); // { [notifId]: string }

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) setMyId(session.user.id);

    const { data: notifs } = await supabase
      .from("admin_notifications")
      .select("*")
      .eq("type", "missed_entry")
      .eq("resolved", false)
      .order("entry_date", { ascending: false });
    setNotifications(notifs || []);

    if (notifs && notifs.length > 0) {
      const ids = [...new Set(notifs.map((n) => n.user_id))];
      const { data: people } = await supabase
        .from("profiles")
        .select("id, full_name, location")
        .in("id", ids);
      const map = {};
      for (const p of people || []) map[p.id] = p;
      setPeopleById(map);
    } else {
      setPeopleById({});
    }

    const { data: reasons } = await supabase
      .from("holiday_reasons")
      .select("*")
      .order("label");
    setHolidayReasons(reasons || []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function togglePanel(notifId, panel) {
    setOpenPanel((prev) => ({ ...prev, [notifId]: prev[notifId] === panel ? null : panel }));
  }

  async function markResolved(notifId, action) {
    await supabase
      .from("admin_notifications")
      .update({
        resolved: true,
        resolved_action: action,
        resolved_at: new Date().toISOString(),
        resolved_by: myId,
      })
      .eq("id", notifId);
  }

  /** Holiday or Leave or Custom: writes a tagged (non-counting) row into
   * the sales person's daily_entries for that exact date, then marks
   * the notification resolved. */
  async function applyTag(notif, entryType, remarks) {
    setBusyId(notif.id);
    const { error: entryError } = await supabase.from("daily_entries").upsert(
      {
        user_id: notif.user_id,
        entry_date: notif.entry_date,
        entry_type: entryType,
        remarks,
      },
      { onConflict: "user_id,entry_date" }
    );
    if (entryError) {
      alert(`Could not save: ${entryError.message}`);
      setBusyId(null);
      return;
    }
    await markResolved(notif.id, entryType);
    setBusyId(null);
    load();
  }

  async function confirmHoliday(notif) {
    const choice = holidayChoice[notif.id];
    const custom = (newHolidayLabel[notif.id] || "").trim();
    const label = choice === "__new__" ? custom : choice;
    if (!label) {
      alert("Please choose or type a holiday reason first.");
      return;
    }
    // Save a brand-new custom reason to the reusable list, so it shows
    // up in the dropdown next time - but only if it's genuinely new.
    if (choice === "__new__" && custom) {
      const alreadyKnown = holidayReasons.some(
        (r) => r.label.toLowerCase() === custom.toLowerCase()
      );
      if (!alreadyKnown) {
        await supabase.from("holiday_reasons").insert({ label: custom });
      }
    }
    applyTag(notif, "holiday", label);
  }

  function confirmLeave(notif) {
    const note = (leaveNote[notif.id] || "").trim();
    applyTag(notif, "leave", note ? `Leave - ${note}` : "Leave");
  }

  function confirmCustom(notif) {
    const note = (customNote[notif.id] || "").trim();
    if (!note) {
      alert("Please type a comment first.");
      return;
    }
    applyTag(notif, "custom", note);
  }

  /** Sends a fill-in request: creates an empty (all-zero) daily_entries
   * row for that date, tagged 'requested' so it shows up as an obvious
   * "please fill this in" row on the sales person's own dashboard. It
   * turns into a normal 'submitted' entry automatically the moment they
   * save real numbers into it. */
  async function sendRequest(notif) {
    setBusyId(notif.id);
    const { error: entryError } = await supabase.from("daily_entries").upsert(
      {
        user_id: notif.user_id,
        entry_date: notif.entry_date,
        entry_type: "requested",
        remarks: "",
      },
      { onConflict: "user_id,entry_date" }
    );
    if (entryError) {
      alert(`Could not send request: ${entryError.message}`);
      setBusyId(null);
      return;
    }
    await markResolved(notif.id, "requested");
    setBusyId(null);
    load();
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-lg sm:text-xl font-bold">Missed Entry Notifications</h1>
        <p className="text-sm text-slate-500">
          Created automatically every night for any active sales person who didn't submit a
          report the day before (Fridays are auto-marked as a holiday and never show up here).
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center text-slate-500">
          No unresolved missed-entry notifications. 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const person = peopleById[n.user_id];
            const panel = openPanel[n.id];
            const busy = busyId === n.id;
            return (
              <div
                key={n.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {person?.full_name || "Unknown"}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        {person?.location ? `· ${person.location}` : ""}
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">
                      Missed entry for <span className="font-medium">{n.entry_date}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      disabled={busy}
                      onClick={() => togglePanel(n.id, "holiday")}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        panel === "holiday" ? "bg-amber-100 border-amber-300" : "bg-white"
                      }`}
                    >
                      Holiday
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => togglePanel(n.id, "leave")}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        panel === "leave" ? "bg-sky-100 border-sky-300" : "bg-white"
                      }`}
                    >
                      Leave
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => togglePanel(n.id, "custom")}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        panel === "custom" ? "bg-violet-100 border-violet-300" : "bg-white"
                      }`}
                    >
                      Custom Comment
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => sendRequest(n)}
                      className="text-xs px-3 py-1.5 rounded-lg border bg-slate-900 text-white disabled:opacity-50"
                    >
                      {busy ? "Sending..." : "Request Entry"}
                    </button>
                  </div>
                </div>

                {panel === "holiday" && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <select
                      className="border rounded-lg px-2 py-1.5 text-sm"
                      value={holidayChoice[n.id] || ""}
                      onChange={(e) =>
                        setHolidayChoice((prev) => ({ ...prev, [n.id]: e.target.value }))
                      }
                    >
                      <option value="">Choose a reason...</option>
                      <option value={GOVERNMENT_HOLIDAY}>{GOVERNMENT_HOLIDAY}</option>
                      {holidayReasons.map((r) => (
                        <option key={r.id} value={r.label}>
                          {r.label}
                        </option>
                      ))}
                      <option value="__new__">+ New reason...</option>
                    </select>
                    {holidayChoice[n.id] === "__new__" && (
                      <input
                        type="text"
                        placeholder="e.g. Eid Vacation"
                        className="border rounded-lg px-2 py-1.5 text-sm"
                        value={newHolidayLabel[n.id] || ""}
                        onChange={(e) =>
                          setNewHolidayLabel((prev) => ({ ...prev, [n.id]: e.target.value }))
                        }
                      />
                    )}
                    <button
                      disabled={busy}
                      onClick={() => confirmHoliday(n)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white disabled:opacity-50"
                    >
                      {busy ? "Saving..." : "Confirm Holiday"}
                    </button>
                  </div>
                )}

                {panel === "leave" && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <input
                      type="text"
                      placeholder="Optional note (e.g. Sick leave)"
                      className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[180px]"
                      value={leaveNote[n.id] || ""}
                      onChange={(e) =>
                        setLeaveNote((prev) => ({ ...prev, [n.id]: e.target.value }))
                      }
                    />
                    <button
                      disabled={busy}
                      onClick={() => confirmLeave(n)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-sky-600 text-white disabled:opacity-50"
                    >
                      {busy ? "Saving..." : "Confirm Leave"}
                    </button>
                  </div>
                )}

                {panel === "custom" && (
                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <input
                      type="text"
                      placeholder="Write a comment/tag for this day"
                      className="border rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[180px]"
                      value={customNote[n.id] || ""}
                      onChange={(e) =>
                        setCustomNote((prev) => ({ ...prev, [n.id]: e.target.value }))
                      }
                    />
                    <button
                      disabled={busy}
                      onClick={() => confirmCustom(n)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-50"
                    >
                      {busy ? "Saving..." : "Confirm"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
