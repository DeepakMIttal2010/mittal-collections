export default function Field({ label, children }) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="block mb-1">{label}</span>
      {children}
    </label>
  );
}
