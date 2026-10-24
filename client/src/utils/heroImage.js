// The homepage hero image's transform, srcset widths and sizes, shared by
// the React Hero (through services/api.js's imgUrl/imgSrcSet) and
// scripts/build-home-html.mjs (its pre-painted copy and <link rel=preload>,
// through utils/cloudinaryUrl.js, the same code imgUrl uses). All three
// must request byte-for-byte the same URLs, or the browser downloads the
// LCP image twice.
//
// w_1000: the image is bounded to the .hero-split-image column (roughly
// half the .container width), so 1000px covers it at up to ~2x density.
export const HERO_IMAGE_TRANSFORM = "w_1000,q_auto,f_auto";
export const HERO_IMAGE_SRCSET_WIDTHS = [500, 800, 1200];
export const HERO_IMAGE_SIZES = "(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 512px";
