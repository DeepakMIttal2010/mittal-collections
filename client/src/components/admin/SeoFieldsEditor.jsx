// Optional search copy for a category / subcategory landing page (see
// server/models/seoFields.js). Plain name/onChange inputs, so it plugs
// into a form's existing handleChange. Empty fields keep the page's
// generated title and description.
const FIELDS = [
  { name: "seoTitle", label: "SEO title (English)", max: 80, rows: 1, hint: "Shown in Google results. Keep the words people search first, about 50-60 characters. \" | Mittal Collections\" is added automatically." },
  { name: "seoTitleHi", label: "SEO title (Hindi)", max: 80, rows: 1 },
  { name: "seoDescription", label: "Meta description (English)", max: 200, rows: 2, hint: "The 1-2 lines under the title in Google, about 140-160 characters." },
  { name: "seoDescriptionHi", label: "Meta description (Hindi)", max: 200, rows: 2 },
  { name: "aboutText", label: "About text (English)", max: 4000, rows: 6, hint: "Shown below the products. Leave a blank line between paragraphs." },
  { name: "aboutTextHi", label: "About text (Hindi)", max: 4000, rows: 6 },
];

const inputClass =
  "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function SeoFieldsEditor({ values, onChange, idPrefix = "seo" }) {
  const filled = FIELDS.filter((f) => values[f.name]).length;

  return (
    <details className="border border-slate-200 rounded-lg p-4" open={filled > 0}>
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Search (SEO) copy — optional{filled > 0 ? ` (${filled}/6 filled)` : ""}
      </summary>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {FIELDS.map((f) => {
          const id = `${idPrefix}-${f.name}`;
          const value = values[f.name] || "";
          const Tag = f.rows > 1 ? "textarea" : "input";

          return (
            <div key={f.name}>
              <label htmlFor={id} className="flex justify-between text-sm font-medium text-slate-700 mb-1">
                <span>{f.label}</span>
                <span className={`text-xs ${value.length > f.max ? "text-red-600" : "text-slate-400"}`}>
                  {value.length}/{f.max}
                </span>
              </label>
              <Tag
                id={id}
                name={f.name}
                {...(f.rows > 1 ? { rows: f.rows } : { type: "text" })}
                maxLength={f.max}
                value={value}
                onChange={onChange}
                className={inputClass}
              />
              {f.hint && <p className="mt-1 text-xs text-slate-500">{f.hint}</p>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export const emptySeoFields = () => ({
  seoTitle: "",
  seoTitleHi: "",
  seoDescription: "",
  seoDescriptionHi: "",
  aboutText: "",
  aboutTextHi: "",
});

export const seoFieldsFrom = (doc = {}) =>
  Object.fromEntries(Object.keys(emptySeoFields()).map((k) => [k, doc[k] || ""]));

export default SeoFieldsEditor;
