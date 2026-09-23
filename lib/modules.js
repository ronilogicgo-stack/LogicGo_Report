/** Every add-on module that participates in the generic module_access
 * system. Adding a brand-new module later just means adding one entry
 * here (plus the module's own tables/pages/RLS calling
 * has_module_access('its_key')) - no new access-grant UI needed. */
export const KNOWN_MODULES = [
  { key: "pos", label: "POS" },
  { key: "annual_report", label: "Annual Report" },
  { key: "rma", label: "RMA" },
];

export function moduleLabel(key) {
  return KNOWN_MODULES.find((m) => m.key === key)?.label || key;
}

export const ACCESS_LEVELS = [
  { value: "none", label: "No access" },
  { value: "viewer", label: "Viewer" },
  { value: "editor", label: "Editor" },
  { value: "agency_owner", label: "Agency Owner" },
];
