"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabaseClient";

export default function RmaNewForm({ basePath }) {
  const supabase = createClient();
  const router = useRouter();
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    product_name: "",
    product_model: "",
    serial_number: "",
    issue_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.customer_name.trim() || !form.product_name.trim()) {
      setError("Customer Name and Product Name are required.");
      return;
    }
    setSaving(true);

    // Note: there is deliberately no "created_by" field here - the
    // database trigger always stamps the actual logged-in user,
    // regardless of anything sent from this form.
    const { data: rma, error: insertError } = await supabase
      .from("rma_records")
      .insert(form)
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    await supabase.from("rma_audit_log").insert({
      rma_id: rma.id,
      action: "created",
      new_value: "Created",
      remark: form.issue_description || null,
    });

    router.push(`${basePath}/${rma.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-lg sm:text-xl font-bold">New RMA</h1>
        <Link href={basePath} className="text-sm text-blue-600 underline">
          ← All RMAs
        </Link>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-3">
        <Input
          label="Customer Name *"
          value={form.customer_name}
          onChange={(v) => setForm({ ...form, customer_name: v })}
        />
        <Input
          label="Customer Phone"
          value={form.customer_phone}
          onChange={(v) => setForm({ ...form, customer_phone: v })}
        />
        <Input
          label="Product Name *"
          value={form.product_name}
          onChange={(v) => setForm({ ...form, product_name: v })}
        />
        <Input
          label="Product Model"
          value={form.product_model}
          onChange={(v) => setForm({ ...form, product_model: v })}
        />
        <Input
          label="Serial Number"
          value={form.serial_number}
          onChange={(v) => setForm({ ...form, serial_number: v })}
        />
        <div>
          <label className="text-xs text-slate-500">Issue Description</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
            rows={3}
            value={form.issue_description}
            onChange={(e) => setForm({ ...form, issue_description: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={saving} className="bg-black text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
          {saving ? "Creating..." : "Create RMA"}
        </button>
      </div>
    </form>
  );
}

function Input({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-500">{label}</label>
      <input
        type="text"
        className="w-full border rounded-lg px-3 py-2 mt-0.5 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
