import { applyCloudinaryTransform, cloudinarySrcSet, isCloudinaryUploadUrl } from "../utils/cloudinaryUrl";

export const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// transform is an optional Cloudinary transformation string (e.g.
// "w_400,q_auto,f_auto") — applied only to Cloudinary-hosted images so a
// thumbnail doesn't ship the same ~1600px master asset as the product
// hero. Legacy /uploads/* images ignore it, since they're served as-is.
export const imgUrl = (path, transform) => {
  if (!path) return path;

  if (!path.startsWith("http")) return `${SERVER_URL}${path}`;

  // typeof check, not just truthiness: passing imgUrl straight to
  // Array.map hands it the element's index as `transform` (a number),
  // which crashed the whole product page once this function started
  // calling transform.replace below.
  if (typeof transform === "string" && transform && isCloudinaryUploadUrl(path)) {
    // See utils/cloudinaryUrl.js for the f_webp/c_limit rules.
    return applyCloudinaryTransform(path, transform);
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

  return cloudinarySrcSet(path, widths, extraTransform);
};

const API_BASE_URL = `${SERVER_URL}/api`;

export default API_BASE_URL;
