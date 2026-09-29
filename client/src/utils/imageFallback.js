// Every product/category photo comes from Cloudinary — a deleted asset
// or a transient fetch failure otherwise renders the browser's default
// broken-image icon, with no visual sign of what was supposed to be
// there. Swaps to the site's own icon as a graceful placeholder;
// `onerror = null` first so a failure loading THAT (unlikely, it's a
// local static asset) can't loop forever.
export const handleImageError = (e) => {
  e.target.onerror = null;
  // srcSet (ProductCard's responsive images) takes priority over src when
  // both are present — clearing it first, or the browser keeps trying the
  // broken Cloudinary candidates instead of falling back to the new src.
  e.target.srcset = "";
  e.target.src = "/icon-512.png";
  e.target.classList.add("opacity-40");
};
