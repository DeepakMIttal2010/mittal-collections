// Shopper-facing names for a subcategory's groupLabel (the admin-side
// labels read "By Type", "Size", ...). Shared by CategoryPage and Footer;
// api/render.js keeps its own copy -- keep the two identical.
export function friendlyGroupLabel(groupLabel) {
  if (groupLabel === "By Type") return "Type";
  if (groupLabel === "By Material") return "Material";
  if (groupLabel === "Size") return "Popular Dimensions";
  if (groupLabel === "Bed Size") return "Bed Type";

  return groupLabel;
}

export function friendlyGroupLabelHi(groupLabel) {
  if (groupLabel === "By Type") return "प्रकार";
  if (groupLabel === "By Material") return "मटीरियल";
  if (groupLabel === "Size") return "लोकप्रिय आयाम";
  if (groupLabel === "Bed Size") return "बेड टाइप";
  if (groupLabel === "By Brand") return "ब्रांड";
  if (groupLabel === "By Pattern") return "पैटर्न";
  if (groupLabel === "By Design") return "डिज़ाइन";

  return groupLabel;
}
