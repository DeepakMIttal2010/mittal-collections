export const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// A substring check like path.includes("res.cloudinary.com/") is exactly
// what CodeQL's incomplete-url-substring-sanitization query exists to
// catch — that text can appear anywhere in a URL (e.g.
// "https://evil.com/res.cloudinary.com/upload/x"), so it doesn't actually
// prove the image is Cloudinary-hosted. Parsing the URL and checking the
// real hostname does.
const isCloudinaryUploadUrl = (path) => {
  try {
    const url = new URL(path);
    return url.hostname === "res.cloudinary.com" && url.pathname.includes("/upload/");
  } catch {
    return false;
  }
};

// transform is an optional Cloudinary transformation string (e.g.
// "w_400,q_auto,f_auto") — applied only to Cloudinary-hosted images so a
// thumbnail doesn't ship the same ~1600px master asset as the product
// hero. Legacy /uploads/* images ignore it, since they're served as-is.
export const imgUrl = (path, transform) => {
  if (!path) return path;

  if (!path.startsWith("http")) return `${SERVER_URL}${path}`;

  if (transform && isCloudinaryUploadUrl(path)) {
    // f_auto is meant to content-negotiate WebP/AVIF via the request's
    // Accept header, but a live check (Deep SEO Round 6) found real
    // browser requests still got served JPEG despite requesting it and
    // the response advertising Vary: Accept -- an edge-cache-not-really-
    // varying-by-Accept problem, not a code bug, and not something
    // fixable from here. f_webp sidesteps content negotiation (and its
    // caching pitfall) entirely by asking for one fixed, near-universally
    // supported modern format instead of asking Cloudinary to guess per
    // request -- confirmed via the same live check that forcing an
    // explicit format (f_avif there) reliably returns that format.
    const resolvedTransform = transform.replace(/f_auto\b/, "f_webp");
    return path.replace("/upload/", `/upload/${resolvedTransform}/`);
  }

  return path;
};

// Builds a srcset string offering the same Cloudinary image at several
// widths, so the browser picks whichever one actually matches how big
// it's rendering (paired with a `sizes` attribute at the call site) —
// instead of every viewport downloading one fixed size regardless of
// its real display width, which is what PageSpeed Insights' "Improve
// image delivery" audit flags (5+ MB of it on the homepage alone).
// Only meaningful for Cloudinary-hosted images, same restriction imgUrl
// itself applies — legacy /uploads/* images have no on-the-fly resizing,
// so there's nothing to build a srcset out of for those.
export const imgSrcSet = (path, widths, extraTransform = "q_auto,f_auto") => {
  if (!path || !isCloudinaryUploadUrl(path)) return undefined;

  return widths
    .map((w) => `${imgUrl(path, `w_${w},${extraTransform}`)} ${w}w`)
    .join(", ");
};

const API_BASE_URL = `${SERVER_URL}/api`;

export default API_BASE_URL;
