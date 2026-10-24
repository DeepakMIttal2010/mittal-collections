// Cloudinary URL building with no Vite/browser dependencies, so the same
// code runs in the app (services/api.js's imgUrl/imgSrcSet) and in plain
// Node build scripts (scripts/build-home-html.mjs). The two used to keep
// separate copies; when c_limit was added here (2026-10-20) the build
// script's copy didn't get it, so the homepage's pre-painted hero and its
// preload asked for a different URL than the React hero and every visit
// downloaded the LCP image twice.

// A substring check like path.includes("res.cloudinary.com/") is exactly
// what CodeQL's incomplete-url-substring-sanitization query exists to
// catch — that text can appear anywhere in a URL (e.g.
// "https://evil.com/res.cloudinary.com/upload/x"), so it doesn't actually
// prove the image is Cloudinary-hosted. Parsing the URL and checking the
// real hostname does.
export const isCloudinaryUploadUrl = (path) => {
  try {
    const url = new URL(path);
    return url.hostname === "res.cloudinary.com" && url.pathname.includes("/upload/");
  } catch {
    return false;
  }
};

// Applies a transformation string (e.g. "w_400,q_auto,f_auto") to a
// Cloudinary upload URL. Callers check isCloudinaryUploadUrl first.
export const applyCloudinaryTransform = (path, transform) => {
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
  let resolvedTransform = transform.replace(/f_auto\b/, "f_webp");

  // Ensures a `w_` request never upscales past the source image's real
  // resolution -- without an explicit crop mode, Cloudinary's default
  // scale behavior stretches a smaller original up to fill the
  // requested width, producing visibly blurry images. Found live (Deep
  // SEO round 6, 2026-10-20): 40 of 44 recently-added products had
  // source photos under 1600px, all silently upscaled 1.5x-2.5x by the
  // fixed w_1600 main-image request. c_limit only ever shrinks, never
  // grows, an image.
  if (/\bw_\d+/.test(resolvedTransform) && !/\bc_/.test(resolvedTransform)) {
    resolvedTransform = resolvedTransform.replace(/\bw_\d+/, (w) => `c_limit,${w}`);
  }

  return path.replace("/upload/", `/upload/${resolvedTransform}/`);
};

// srcset entries for a Cloudinary upload URL at several widths.
export const cloudinarySrcSet = (path, widths, extraTransform = "q_auto,f_auto") =>
  widths.map((w) => `${applyCloudinaryTransform(path, `w_${w},${extraTransform}`)} ${w}w`).join(", ");
