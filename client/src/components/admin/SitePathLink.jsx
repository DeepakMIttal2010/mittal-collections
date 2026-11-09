// A storefront page path shown in an admin report (visit logs, GA top
// pages), as a link that opens that page in a new tab. Paths come from the
// visitor's browser or GA, so only a same-site path ("/..." but not "//")
// becomes a link -- anything else ("//host", "javascript:", junk) stays
// plain text.
export const isSitePath = (path) =>
  typeof path === "string" && path.startsWith("/") && !path.startsWith("//");

function SitePathLink({ path, className = "" }) {
  if (!isSitePath(path)) return <span className={className}>{path}</span>;

  return (
    <a
      href={path}
      target="_blank"
      rel="noopener noreferrer"
      title={path}
      className={`${className} text-blue-700 hover:underline`}
    >
      {path}
    </a>
  );
}

export default SitePathLink;
