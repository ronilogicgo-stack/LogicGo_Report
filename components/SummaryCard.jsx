"use client";

import {
  Wallet,
  Target,
  TrendingUp,
  Landmark,
  HandCoins,
  Scale,
  Undo2,
  ArrowRightLeft,
  PiggyBank,
  WalletCards,
} from "lucide-react";

// Maps each metric label to an icon that hints at what it means at a
// glance - not decoration, a scanning aid for a dashboard full of
// similarly-formatted numbers.
const ICONS = {
  "Opening Dues": Wallet,
  "Sales Target": Target,
  "Sales Achievement": TrendingUp,
  "Collection Target": Target,
  "Collection Achievement": HandCoins,
  "Collection Gap": Scale,
  "Sales Return": Undo2,
  "Other Transaction": ArrowRightLeft,
  "Net Sales": Landmark,
  "Dues Recovery": PiggyBank,
  "Closing Dues": WalletCards,
};

/**
 * Shared metric card used on the Sales Person's own dashboard and the
 * Admin's per-employee detail page - so both panels look and behave
 * identically. `belowTarget` / `aboveTarget` are purely visual flags;
 * they never change what value is calculated or displayed.
 */
export default function SummaryCard({ label, value, highlight, belowTarget, aboveTarget }) {
  const Icon = ICONS[label];

  const tone = belowTarget
    ? "border-red-200 bg-red-50"
    : aboveTarget
    ? "border-emerald-200 bg-emerald-50"
    : highlight
    ? "border-slate-800 bg-slate-900"
    : "border-slate-200 bg-white";

  const labelColor = belowTarget
    ? "text-red-600"
    : aboveTarget
    ? "text-emerald-600"
    : highlight
    ? "text-slate-400"
    : "text-slate-500";

  const valueColor = belowTarget
    ? "text-red-700"
    : aboveTarget
    ? "text-emerald-700"
    : highlight
    ? "text-white"
    : "text-slate-900";

  const iconColor = belowTarget
    ? "text-red-400"
    : aboveTarget
    ? "text-emerald-400"
    : highlight
    ? "text-slate-500"
    : "text-slate-300";

  return (
    <div className={`rounded-xl border shadow-sm p-3 sm:p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className={`text-xs ${labelColor}`}>{label}</p>
        {Icon && <Icon size={15} className={`shrink-0 ${iconColor}`} strokeWidth={2} />}
      </div>
      <p className={`text-base sm:text-lg font-bold mt-1 num ${valueColor}`}>{value}</p>
      {belowTarget && (
        <p className="text-[11px] text-red-600 font-medium mt-0.5">Below target</p>
      )}
      {aboveTarget && (
        <p className="text-[11px] text-emerald-600 font-medium mt-0.5">Above target</p>
      )}
    </div>
  );
}
