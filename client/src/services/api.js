export const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// transform is an optional Cloudinary transformation string (e.g.
// "w_400,q_auto,f_auto") — applied only to Cloudinary-hosted images so a
// thumbnail doesn't ship the same ~1600px master asset as the product
// hero. Legacy /uploads/* images ignore it, since they're served as-is.
export const imgUrl = (path, transform) => {
  if (!path) return path;

  if (!path.startsWith("http")) return `${SERVER_URL}${path}`;

  if (transform && path.includes("res.cloudinary.com/") && path.includes("/upload/")) {
    return path.replace("/upload/", `/upload/${transform}/`);
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
  if (!path || !path.startsWith("http")) return undefined;
  if (!path.includes("res.cloudinary.com/") || !path.includes("/upload/")) {
    return undefined;
  }

  return widths
    .map((w) => `${imgUrl(path, `w_${w},${extraTransform}`)} ${w}w`)
    .join(", ");
};

const API_BASE_URL = `${SERVER_URL}/api`;

export default API_BASE_URL;
