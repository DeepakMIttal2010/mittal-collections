import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "react-toastify";
import fixWebmDuration from "fix-webm-duration";
import {
  FaTimes,
  FaShareAlt,
  FaDownload,
  FaWhatsapp,
  FaInstagram,
  FaFacebookF,
  FaImage,
  FaVideo,
  FaCopy,
  FaExclamationTriangle,
} from "react-icons/fa";

import { imgUrl } from "../../services/api";
import { productUrl } from "../../utils/productUrl";

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const MAX_SLIDES = 5;

// Royalty-free (Pixabay Content License — free for commercial use, no
// attribution required), pre-downloaded so the admin never has to hunt
// for background music per product. Baked directly into the recorded
// video rather than left as a manual "add sound on Instagram/Facebook"
// step, which is easy to forget.
const MUSIC_TRACKS = [
  { value: "none", label: "No music" },
  { value: "warm-acoustic-guitar", label: "Warm Acoustic Guitar" },
  { value: "acoustic-guitar-music", label: "Acoustic Guitar" },
  { value: "soft-background", label: "Soft Background" },
  { value: "soft-music-1", label: "Soft Music (1)" },
  { value: "soft-music-2", label: "Soft Music (2)" },
];
const DEFAULT_MUSIC = "warm-acoustic-guitar";
// Fade the track in/out at the start/end instead of a hard cut, and cap
// its volume well under the (silent) recording headroom so it reads as
// background music, not the main event.
const MUSIC_VOLUME = 0.55;
const MUSIC_FADE_MS = 500;

// Hinglish hook line + hashtag set per category, matching the style of
// posts already being written by hand for the brand's Instagram — see
// the "Ghar ke entrance ko dijiye naya look" doormat post this was
// modeled on.
const CATEGORY_CONTENT = {
  "Doormats": {
    hook: "Ghar ke entrance ko dijiye naya look ✨",
    hashtags: ["#doormat", "#antislipmat", "#entrancedecor"],
  },
  "Cushion Covers": {
    hook: "Apne sofa ko dijiye ek stylish touch ✨",
    hashtags: ["#cushioncovers", "#sofadecor", "#cushioncoversale"],
  },
  "Bedsheets": {
    hook: "Apne bedroom ko dijiye ek royal touch ✨",
    hashtags: ["#bedsheets", "#beddingsets", "#bedroomdecor"],
  },
};
const DEFAULT_CATEGORY_CONTENT = {
  hook: "Apne ghar ko dijiye ek naya look ✨",
  hashtags: ["#homedecor"],
};
const COMMON_HASHTAGS = [
  "#homedecorindia",
  "#ghardecor",
  "#onlineshoppingindia",
  "#interiordesignindia",
  "#mittalcollections",
];

// Shared by the caption text and the video's opening hook overlay, so the
// two always say the same thing rather than drifting apart.
const getCategoryContent = (product) =>
  CATEGORY_CONTENT[product.category?.name] || DEFAULT_CATEGORY_CONTENT;

// Builds an Instagram-ready caption: Hinglish hook, a description
// highlight, size/fabric/what's-included when the product has them, the
// local-delivery message, price, a CTA, the link, then hashtags — not
// just a bare "name — price" line.
const buildCaption = (product, productLink) => {
  const content = getCategoryContent(product);
  const hasDiscount = product.oldPrice && product.oldPrice > product.price;

  const lines = [content.hook];

  const firstSentence = (product.description || "").split(/(?<=[.!])\s/)[0]?.trim();
  if (firstSentence) lines.push(firstSentence);

  if (product.whatsIncluded) lines.push(`📦 ${product.whatsIncluded}`);
  if (product.size) lines.push(`📏 Size: ${product.size}`);
  if (product.fabric) lines.push(`🧵 Fabric: ${product.fabric}`);

  lines.push("🚚 Free Delivery in Vasundhara & nearby areas | COD available");
  lines.push(
    hasDiscount
      ? `💰 ₹${product.price} (MRP ₹${product.oldPrice})`
      : `💰 ₹${product.price}`,
  );

  // Instagram/Facebook never make a caption URL tappable, no matter how
  // it's formatted — pointing to the bio link is the only CTA that
  // actually works there. The raw link is still included below so
  // whoever's posting can manually copy it into the bio-link tool, and
  // so a determined viewer can still long-press-copy it themselves.
  lines.push("Order karein — bio link se 👆");
  lines.push("(ya neeche wala link copy karke browser mein paste karein)");
  lines.push("");
  lines.push(productLink);
  lines.push(".");
  lines.push([...content.hashtags, ...COMMON_HASHTAGS].join(" "));

  return lines.join("\n");
};
const SLIDE_MS = 1600;
// 5s felt rushed for a product Reel — barely enough time to register the
// photo, let alone read the price/CTA overlay on top of it. ~9s matches
// the low end of what actually performs well for a simple product
// carousel (most guidance is 7-15s), while still keeping the per-slide
// share generation fast.
const MIN_VIDEO_MS = 9000;
// How far a slide zooms in over its own duration (Ken Burns effect) — a
// completely static frame for 1.5-4.5s (see slideMs below) reads as
// "frozen" and is exactly the kind of opening that gets a Reel scrolled
// past. Zooming continuously keeps the frame visibly alive from the very
// first frame, not just once the next photo cuts in.
const ZOOM_END_SCALE = 1.12;
// How long the dissolve between two slides takes — a hard jump-cut
// reads as choppy; a short crossfade feels like an intentional edit
// instead of a slideshow. Capped relative to slideMs elsewhere so it
// never eats a meaningful chunk of a very short slide's own screen time.
const CROSSFADE_MS = 300;

// The opening beat is a big Hinglish hook line and nothing else — every
// frame showing price/CTA/QR from the very first instant read as a
// static ad card rather than something worth watching. The hook then
// fades out just as the product info fades in, so there's no dead gap.
const HOOK_SHOW_MS = 1600;
const HOOK_FADE_MS = 400;
const INFO_FADE_IN_START_MS = 1300;
const INFO_FADE_MS = 500;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Canvas has no built-in text wrapping — measure and break manually.
const wrapText = (ctx, text, maxWidth) => {
  const words = text.split(" ");
  const lines = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  return lines;
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

// An image loaded without a proper CORS response (older, pre-Cloudinary
// products can still have such URLs in their images[] array) loads and
// draws to canvas just fine, but silently "taints" the canvas — any
// later attempt to read its pixels (which is exactly what
// captureStream()+MediaRecorder does every frame) then fails, and the
// recorded video just freezes on whatever frame was drawn right before
// the tainting image, for the rest of its length, while the separately
// recorded audio track keeps playing to the end. Probing each image
// against a throwaway canvas before using it in the slideshow catches
// this ahead of time instead of silently breaking the recording.
const isCanvasSafeImage = (img) => {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    const probeCtx = probe.getContext("2d");
    probeCtx.drawImage(img, 0, 0, 1, 1);
    probeCtx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
};

// Draws the product photo, cover-fit, filling the whole canvas. `zoom`
// (1 = plain cover-fit, >1 = zoomed in further) drives the Ken Burns
// effect in the video — always centered, so the same call also works
// unchanged for the static image/preview canvas (zoom defaults to 1).
const drawBackground = (ctx, img, zoom = 1) => {
  const scale = Math.max(CANVAS_W / img.width, CANVAS_H / img.height) * zoom;
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (CANVAS_W - drawW) / 2, (CANVAS_H - drawH) / 2, drawW, drawH);
};

// How long (ms) the discount badge takes to pop in from small to full
// size at the very start of the video — a static badge sitting there
// from frame one is easy to skim past; a quick scale-in is what actually
// catches the eye in that first instant.
const BADGE_POP_MS = 400;

// Draws the Instagram-Story-style segmented progress bar at the top —
// tells the viewer more photos are coming (encouraging them to keep
// watching instead of swiping away after the first), and shows how far
// through the current one they are.
const drawProgressBars = (ctx, totalSlides, currentIndex, slideProgress) => {
  if (totalSlides <= 1) return;

  const margin = 16;
  const gap = 8;
  const barH = 6;
  const barY = 28;
  const totalGap = gap * (totalSlides - 1);
  const barW = (CANVAS_W - margin * 2 - totalGap) / totalSlides;

  for (let i = 0; i < totalSlides; i++) {
    const x = margin + i * (barW + gap);
    const fill = i < currentIndex ? 1 : i === currentIndex ? slideProgress : 0;

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.roundRect(x, barY, barW, barH, barH / 2);
    ctx.fill();

    if (fill > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(x, barY, barW * fill, barH, barH / 2);
      ctx.fill();
    }
  }
};

// Draws every branding element on top of whatever background is already
// on the canvas — brand wordmark, discount badge, name, price, CTA + QR.
// Shared between the static image and every video frame so both look
// identical apart from which product photo is showing underneath.
// `elapsedMs`/slide-position args are only meaningful for video frames —
// the static image call omits them, which skips the badge pop-in
// (nothing to animate for a still image) and the progress bar (nothing
// to show progress through).
const drawOverlay = (
  ctx,
  {
    product,
    hasDiscount,
    discountPct,
    qrImg,
    hookText,
    elapsedMs = Infinity,
    totalSlides = 1,
    currentIndex = 0,
    slideProgress = 0,
  },
) => {
  const gradient = ctx.createLinearGradient(0, CANVAS_H * 0.45, 0, CANVAS_H);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawProgressBars(ctx, totalSlides, currentIndex, slideProgress);

  // Brand wordmark stays up throughout — it's small enough not to read as
  // clutter and gives even a half-second glance something to identify.
  ctx.textBaseline = "alphabetic";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 12;
  ctx.fillText("MITTAL", 60, 100);
  ctx.fillStyle = "#f59e0b";
  ctx.fillText("COLLECTIONS", 60 + ctx.measureText("MITTAL ").width, 100);

  // Opening beat: just the hook line, nothing else — every frame showing
  // price/CTA/QR from the very first instant read as a static ad card.
  // The hook fades out right as the product info fades in below, so
  // there's no dead gap in the middle.
  const hookOpacity =
    elapsedMs < HOOK_SHOW_MS
      ? 1
      : clamp01(1 - (elapsedMs - HOOK_SHOW_MS) / HOOK_FADE_MS);

  if (hookText && hookOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = hookOpacity;
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px system-ui, sans-serif";
    const hookLines = wrapText(ctx, hookText, CANVAS_W - 140);
    const lineH = 74;
    let hookY = CANVAS_H * 0.44 - ((hookLines.length - 1) * lineH) / 2;
    // Rises in slightly rather than sitting still while it fades, so the
    // opening beat still reads as motion even before the next photo cuts.
    const riseOffset = (1 - hookOpacity) * 16;
    hookLines.forEach((line) => {
      ctx.fillText(line, CANVAS_W / 2, hookY + riseOffset);
      hookY += lineH;
    });
    ctx.restore();
    ctx.textAlign = "left";
  }

  // Everything below (discount badge, name, price, QR, CTA) fades in as a
  // block once the hook clears, instead of being static from frame one.
  const infoOpacity = clamp01(
    (elapsedMs - INFO_FADE_IN_START_MS) / INFO_FADE_MS,
  );
  if (infoOpacity <= 0) return;

  // The badge's own pop-in is timed relative to when the info block itself
  // starts appearing, not the video's absolute start — otherwise it would
  // finish popping while still fully transparent and never actually be
  // seen animating.
  const infoElapsedMs = Math.max(elapsedMs - INFO_FADE_IN_START_MS, 0);

  ctx.save();
  ctx.globalAlpha = infoOpacity;

  if (hasDiscount) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#dc2626";
    const badgeText = `${discountPct}% OFF`;
    ctx.font = "700 34px system-ui, sans-serif";
    const badgeW = ctx.measureText(badgeText).width + 48;

    const popT = Math.min(infoElapsedMs / BADGE_POP_MS, 1);
    // easeOutBack — overshoots slightly past 1 then settles, reads as a
    // much punchier "pop" than a linear or ease-out scale would.
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const eased =
      1 + c3 * Math.pow(popT - 1, 3) + c1 * Math.pow(popT - 1, 2);
    const badgeScale = popT >= 1 ? 1 : Math.max(eased, 0);

    const badgeCx = CANVAS_W - badgeW / 2 - 50;
    const badgeCy = 55 + 32;
    ctx.save();
    ctx.translate(badgeCx, badgeCy);
    ctx.scale(badgeScale, badgeScale);
    ctx.translate(-badgeCx, -badgeCy);
    ctx.beginPath();
    ctx.roundRect(CANVAS_W - badgeW - 50, 55, badgeW, 64, 32);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badgeText, CANVAS_W - badgeW - 50 + 24, 100);
    ctx.restore();
  }

  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 56px system-ui, sans-serif";
  const nameLines = wrapText(ctx, product.name, CANVAS_W - 120).slice(0, 3);
  let y = CANVAS_H - 430;
  nameLines.forEach((line) => {
    ctx.fillText(line, 60, y);
    y += 66;
  });

  y += 20;
  ctx.font = "800 76px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`₹${product.price}`, 60, y);
  const priceW = ctx.measureText(`₹${product.price}`).width;

  if (hasDiscount) {
    ctx.font = "500 44px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    const oldPriceText = `₹${product.oldPrice}`;
    const oldX = 60 + priceW + 24;
    ctx.fillText(oldPriceText, oldX, y);
    const oldW = ctx.measureText(oldPriceText).width;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(oldX, y - 16);
    ctx.lineTo(oldX + oldW, y - 16);
    ctx.stroke();
  }

  const qrSize = 220;
  const qrX = CANVAS_W - qrSize - 60;
  const qrY = CANVAS_H - qrSize - 70;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // "Scan to Shop", not "Click Here" — nothing in a photo or video is
  // actually tappable; the QR code is the one part of this overlay a
  // viewer can really act on.
  ctx.textAlign = "center";
  ctx.font = "700 30px system-ui, sans-serif";
  const ctaText = "📷 Scan to Shop";
  const ctaW = ctx.measureText(ctaText).width + 56;
  const ctaX = qrX + qrSize / 2;
  const ctaY = qrY - 46;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.roundRect(ctaX - ctaW / 2, ctaY - 44, ctaW, 60, 30);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(ctaText, ctaX, ctaY - 4);

  ctx.font = "500 24px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 8;
  ctx.fillText("or bio link", ctaX, ctaY + 30);
  ctx.textAlign = "left";

  ctx.restore();
};

// Real Safari only — Chrome/Edge/Android WebView all also contain
// "Safari" in their UA string for legacy compatibility, so a plain
// substring check would misidentify them.
const isRealSafari = () =>
  /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

// Picks the best video mimeType this browser's MediaRecorder actually
// supports. Safari is the only browser with a solid native mp4 muxer —
// recent Chrome versions report isTypeSupported("video/mp4") as true too,
// but Chrome's mp4 recording is still incomplete and can produce a file
// with corrupted/missing track dimension metadata (Facebook rejected one
// such file with "height too short, minimum 120" even though the canvas
// itself was a correct 1080x1920 — the container was the problem, not
// the drawing). So mp4 is only attempted on genuine Safari; everywhere
// else goes straight to webm, which every other browser records reliably.
const pickVideoMimeType = () => {
  const candidates = isRealSafari()
    ? ["video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];

  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
};

function ShareProductModal({ product, onClose }) {
  const isOffline = product.visibility === "offline";
  const canvasRef = useRef(null);
  const videoCanvasRef = useRef(null);
  const [mode, setMode] = useState("image");
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoBlob, setVideoBlob] = useState(null);
  const [videoError, setVideoError] = useState("");
  const [videoWarning, setVideoWarning] = useState("");
  const [selectedMusic, setSelectedMusic] = useState(DEFAULT_MUSIC);

  // Deduped — a product's images[] can legitimately contain the same
  // URL twice (e.g. old bulk-import data). Two grid thumbnails sharing
  // one URL would also share React's `key`, which can make the second
  // one silently reflect the first one's selection state instead of
  // toggling independently — so a duplicate effectively "eats" one of
  // the admin's picks without them realizing why.
  const rawImages = [
    ...new Set(
      (product.images?.length ? product.images : [product.image]).filter(
        Boolean,
      ),
    ),
  ];

  // Every photo is shown in the picker (not just the first few) — the
  // cover photo is pinned first since it's the one the admin is most
  // likely to want as slide 1, and so it's never missing from the grid
  // just because it happens to sit past some cutoff in product.images.
  const allImages =
    product.image && rawImages.includes(product.image)
      ? [product.image, ...rawImages.filter((src) => src !== product.image)]
      : rawImages;

  // Which photos go into the video, AND in what order — tap order IS
  // priority order (1st tap = slide 1, 2nd tap = slide 2, ...), shown as
  // a number badge on each thumbnail instead of a plain checkmark.
  // Tapping an already-selected photo removes it and the rest shift
  // down. All photos start selected in their default (cover-first)
  // order, up to the cap, matching what auto-generation used to do.
  const [selectedImages, setSelectedImages] = useState(() =>
    allImages.slice(0, MAX_SLIDES),
  );

  useEffect(() => {
    setSelectedImages(allImages.slice(0, MAX_SLIDES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product._id]);

  const toggleImageSelection = (src) => {
    setSelectedImages((prev) => {
      if (prev.includes(src)) return prev.filter((s) => s !== src);
      if (prev.length >= MAX_SLIDES) {
        toast.info(`Video mein zyada se zyada ${MAX_SLIDES} photos ja sakti hain`);
        return prev;
      }
      return [...prev, src];
    });
  };

  const productLink = `${window.location.origin}${productUrl(product)}`;
  const hasDiscount = product.oldPrice && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((product.oldPrice - product.price) / product.oldPrice) * 100,
      )
    : 0;

  const hookText = getCategoryContent(product).hook;
  const overlayInfo = { product, hasDiscount, discountPct, hookText };

  useEffect(() => {
    if (isOffline) {
      setRendering(false);
      return;
    }

    const render = async () => {
      try {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;

        const productImg = await loadImage(imgUrl(product.image));
        drawBackground(ctx, productImg);

        const qrDataUrl = await QRCode.toDataURL(productLink, {
          width: 260,
          margin: 1,
        });
        const qrImg = await loadImage(qrDataUrl);

        drawOverlay(ctx, { ...overlayInfo, qrImg });

        setRendering(false);

        if (navigator.canShare?.({ files: [new File([], "x.png", { type: "image/png" })] })) {
          setCanShareFiles(true);
        }
      } catch (err) {
        console.error("Share image render error:", err);
        setError("Could not generate the share image. Try again.");
        setRendering(false);
      }
    };

    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, productLink, hasDiscount, discountPct]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getImageBlob = () =>
    new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));

  const caption = buildCaption(product, productLink);

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success("Caption copied");
    } catch {
      toast.error("Couldn't copy — select and copy the text manually");
    }
  };

  const handleShareImage = async () => {
    const blob = await getImageBlob();
    if (!blob) return;

    const file = new File([blob], `${product.slug || "product"}.png`, {
      type: "image/png",
    });

    try {
      await navigator.clipboard.writeText(caption);
      toast.info("Caption copied — paste it if Instagram/Facebook don't fill it in");
    } catch {
      // Clipboard access can fail (permissions, insecure context) —
      // not worth blocking the share over.
    }

    try {
      await navigator.share({ files: [file], title: product.name, text: caption });
    } catch (err) {
      if (err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const handleDownloadImage = async () => {
    const blob = await getImageBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${product.slug || "product"}-share.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generateVideo = async () => {
    setVideoError("");
    setVideoWarning("");
    setVideoRecording(true);
    setVideoUrl(null);
    setVideoBlob(null);

    try {
      const mimeType = pickVideoMimeType();
      if (!mimeType) {
        throw new Error("This browser can't record video. Try a different browser.");
      }

      const images = selectedImages.length ? selectedImages : allImages.slice(0, 1);

      // Promise.allSettled (not all) plus the taint probe below — one bad
      // photo (a network hiccup, or an older non-CORS image URL) should
      // drop itself from the slideshow, not take the whole video down or
      // freeze the recording partway through.
      const loadResults = await Promise.allSettled(
        images.map((src) => loadImage(imgUrl(src))),
      );

      const loadedImages = loadResults
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value)
        .filter(isCanvasSafeImage);

      if (loadedImages.length === 0) {
        throw new Error(
          "None of the selected photos could be used for the video. Try selecting different photos.",
        );
      }
      if (loadedImages.length < images.length) {
        const dropped = images.length - loadedImages.length;
        setVideoWarning(
          `${dropped} of your ${images.length} selected photos couldn't be used (load failed or unsupported source) — the video below only has the other ${loadedImages.length}.`,
        );
      }

      const qrDataUrl = await QRCode.toDataURL(productLink, { width: 260, margin: 1 });
      const qrImg = await loadImage(qrDataUrl);

      const canvas = videoCanvasRef.current;
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d");

      const slideMs = Math.max(SLIDE_MS, MIN_VIDEO_MS / loadedImages.length);
      const totalMs = slideMs * loadedImages.length;

      // captureStream(30) ("auto" mode) samples the canvas on its own
      // internal clock, independent of when drawFrame below actually
      // paints — under any real CPU hiccup (decoding a large photo, GC,
      // a slow frame) the two clocks drift apart and the recording comes
      // out with uneven-feeling pacing: whichever slide was on-screen
      // during the hiccup gets over- or under-sampled relative to the
      // others, even though drawFrame's own slide-switching math is
      // correct. captureStream(0) ("manual" mode) instead only produces
      // a frame when explicitly told to via requestFrame() — driving
      // that from its own steady setInterval below decouples "how often
      // do we push a frame" from "how often did drawFrame happen to run",
      // giving a consistent recorded frame rate regardless of drawing
      // hiccups.
      let audioCtx = null;
      const videoStream = canvas.captureStream(0);
      const [videoTrack] = videoStream.getVideoTracks();
      let combinedStream = videoStream;

      if (selectedMusic !== "none") {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await fetch(`/audio/${selectedMusic}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((buf) => audioCtx.decodeAudioData(buf));

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.loop = true; // covers products whose track is shorter than the video

        const gainNode = audioCtx.createGain();
        const fadeS = MUSIC_FADE_MS / 1000;
        const totalS = totalMs / 1000;
        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(MUSIC_VOLUME, audioCtx.currentTime + fadeS);
        gainNode.gain.setValueAtTime(MUSIC_VOLUME, audioCtx.currentTime + Math.max(totalS - fadeS, fadeS));
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + totalS);

        const audioDest = audioCtx.createMediaStreamDestination();
        source.connect(gainNode).connect(audioDest);
        source.start();

        combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioDest.stream.getAudioTracks(),
        ]);
      }

      const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 4_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error || event);
        cancelAnimationFrame(frameHandle);
        clearInterval(pushTimer);
        if (recorder.state !== "inactive") recorder.stop();
      };

      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      recorder.start();

      let frameHandle;
      const startedAt = performance.now();

      // Steady 30fps frame push, independent of drawFrame's own actual
      // cadence — see the captureStream(0) comment above.
      const pushTimer = setInterval(() => videoTrack.requestFrame(), 1000 / 30);

      const drawFrame = () => {
        try {
          const elapsed = performance.now() - startedAt;
          const index = Math.min(
            Math.floor(elapsed / slideMs),
            loadedImages.length - 1,
          );
          const slideProgress = Math.min(
            (elapsed - index * slideMs) / slideMs,
            1,
          );
          // Zoom is one continuous motion across the *whole* video, not
          // reset to 1x at the start of every photo — a per-slide zoom
          // that snaps back down at each transition read as the movement
          // stopping instead of a slideshow of several photos still inside
          // one smooth cinematic zoom.
          const overallProgress = Math.min(elapsed / totalMs, 1);
          const zoom = 1 + (ZOOM_END_SCALE - 1) * overallProgress;

          const crossfadeMs = Math.min(CROSSFADE_MS, slideMs * 0.3);
          const crossfadeT =
            index > 0 ? (elapsed - index * slideMs) / crossfadeMs : 1;

          if (crossfadeT < 1) {
            // Still dissolving in from the previous slide — both images
            // share the same current zoom level, since the zoom belongs to
            // the video's timeline, not to either individual photo.
            drawBackground(ctx, loadedImages[index - 1], zoom);
            ctx.save();
            ctx.globalAlpha = Math.max(crossfadeT, 0);
            drawBackground(ctx, loadedImages[index], zoom);
            ctx.restore();
          } else {
            drawBackground(ctx, loadedImages[index], zoom);
          }

          drawOverlay(ctx, {
            ...overlayInfo,
            qrImg,
            elapsedMs: elapsed,
            totalSlides: loadedImages.length,
            currentIndex: index,
            slideProgress,
          });

          if (elapsed < totalMs) {
            frameHandle = requestAnimationFrame(drawFrame);
          } else {
            recorder.stop();
          }
        } catch (frameError) {
          // Whatever went wrong, don't leave the recorder running forever
          // with a frozen canvas while the audio track plays on — stop it
          // now so this at least ends with a (short) video instead of
          // hanging with "Recording video..." shown indefinitely.
          console.error("Video frame draw error:", frameError);
          recorder.stop();
        }
      };

      frameHandle = requestAnimationFrame(drawFrame);

      await stopped;
      cancelAnimationFrame(frameHandle);
      clearInterval(pushTimer);
      if (audioCtx) await audioCtx.close();

      const rawBlob = new Blob(chunks, { type: mimeType.split(";")[0] });

      // MediaRecorder-produced webm never writes a Duration into its
      // header — the browser has to guess at playback time, and various
      // players/tools (including, sometimes, this very <video> preview)
      // can end up cutting playback short of the actual recorded content
      // as a result, which reads exactly like "the last slide never
      // shows up" even though the frames are genuinely in the file. Not
      // an issue for the mp4 path (real Safari), which writes a proper
      // duration natively.
      const recordedMs = performance.now() - startedAt;
      const blob = rawBlob.type.includes("webm")
        ? await fixWebmDuration(rawBlob, recordedMs, { logger: false })
        : rawBlob;

      const url = URL.createObjectURL(blob);
      setVideoBlob(blob);
      setVideoUrl(url);
    } catch (err) {
      console.error("Video generation error:", err);
      setVideoError(err.message || "Could not generate the video. Try again.");
    } finally {
      setVideoRecording(false);
    }
  };

  const handleModeChange = (next) => {
    setMode(next);
  };

  const videoExt = videoBlob?.type.includes("mp4") ? "mp4" : "webm";

  const handleDownloadVideo = () => {
    if (!videoUrl) return;

    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = `${product.slug || "product"}-share.${videoExt}`;
    link.click();
  };

  const handleShareVideo = async () => {
    if (!videoBlob) return;

    const file = new File([videoBlob], `${product.slug || "product"}.${videoExt}`, {
      type: videoBlob.type,
    });

    try {
      await navigator.clipboard.writeText(caption);
      toast.info("Caption copied — paste it if Instagram/Facebook don't fill it in");
    } catch {
      // Not worth blocking the share over a clipboard failure.
    }

    try {
      await navigator.share({ files: [file], title: product.name, text: caption });
    } catch (err) {
      if (err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  const canShareVideoFiles =
    videoBlob &&
    navigator.canShare?.({ files: [new File([], `x.${videoExt}`, { type: videoBlob.type })] });

  if (isOffline) {
    return (
      <div
        onClick={onClose}
        className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-8 text-center"
        >
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
          >
            <FaTimes />
          </button>

          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto mb-4">
            <FaExclamationTriangle className="text-2xl" />
          </div>

          <h3 className="font-bold text-slate-900 text-lg mb-2">
            This product can't be shared
          </h3>

          <p className="text-sm text-slate-500">
            "{product.name}" is set to <strong>Offline Only</strong> — it has
            no public page, so a shared link would show "Product Not Found"
            to anyone who clicks it. It's only sellable in-store via POS/QR
            scan, not meant to be advertised publicly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-600 flex items-center justify-center shadow"
        >
          <FaTimes />
        </button>

        <div className="bg-slate-50 p-4 overflow-y-auto min-h-0 flex items-center justify-center">
          <div className="relative rounded-lg overflow-hidden bg-slate-100 w-full max-w-[280px] aspect-[9/16] mx-auto">
            {mode === "image" ? (
              <>
                {rendering && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    Generating...
                  </div>
                )}
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
              </>
            ) : (
              <>
                {videoRecording && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 text-center px-4">
                    Recording video...
                    <br />
                    (takes a few seconds)
                  </div>
                )}
                {!videoRecording && videoUrl && (
                  <video
                    src={videoUrl}
                    controls
                    loop
                    playsInline
                    className="w-full h-full object-contain"
                  />
                )}
                {!videoRecording && !videoUrl && !videoError && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400 text-center px-4">
                    Select photos and hit Generate Video
                  </div>
                )}
              </>
            )}
            {/* Offscreen canvas used only for recording — never shown directly. */}
            <canvas ref={videoCanvasRef} className="hidden" />
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="p-6 pb-4 overflow-y-auto min-h-0 flex-1">
            <h3 className="font-bold text-slate-900 text-lg mb-1">
              Share Product
            </h3>
            <p className="text-sm text-slate-500 mb-4">{product.name}</p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleModeChange("image")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  mode === "image"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                <FaImage /> Image
              </button>
              <button
                onClick={() => handleModeChange("video")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  mode === "video"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                <FaVideo /> Video
              </button>
            </div>

            {mode === "image" && error && (
              <p className="text-sm text-red-600 mb-3">{error}</p>
            )}
            {mode === "video" && videoError && (
              <p className="text-sm text-red-600 mb-3">{videoError}</p>
            )}
            {mode === "video" && videoWarning && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {videoWarning}
              </p>
            )}

            <div className="space-y-2">
              {mode === "image" ? (
                <>
                  {canShareFiles && (
                    <div className="flex items-center justify-center gap-2 text-xs text-slate-500 mb-1">
                      <span>Share via</span>
                      <FaWhatsapp className="text-base text-[#25D366]" />
                      <FaInstagram className="text-base text-[#E1306C]" />
                      <FaFacebookF className="text-base text-[#1877F2]" />
                      <span>& more</span>
                    </div>
                  )}

                  {canShareFiles && (
                    <button
                      onClick={handleShareImage}
                      disabled={rendering}
                      className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                    >
                      <FaShareAlt />
                      Share
                    </button>
                  )}

                  <button
                    onClick={handleDownloadImage}
                    disabled={rendering}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                  >
                    <FaDownload />
                    Download Image
                  </button>
                </>
              ) : (
                <>
                  <div className="mb-1">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium text-slate-500">
                        Photos & order ({selectedImages.length}/{MAX_SLIDES})
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-1">
                      Tap in the order you want them in the video — the
                      number shown is that photo's slide position.
                      {selectedImages.length >= MAX_SLIDES && (
                        <span className="text-amber-600 font-medium">
                          {" "}
                          Max {MAX_SLIDES} reached — deselect one to add another.
                        </span>
                      )}
                    </p>
                    <div className="grid grid-cols-5 gap-2 max-h-40 overflow-y-auto pr-0.5">
                      {allImages.map((src) => {
                        const orderIndex = selectedImages.indexOf(src);
                        const checked = orderIndex !== -1;
                        const isCover = src === product.image;
                        const atCap = !checked && selectedImages.length >= MAX_SLIDES;
                        return (
                          <button
                            key={src}
                            type="button"
                            onClick={() => toggleImageSelection(src)}
                            disabled={videoRecording}
                            className={`relative aspect-square rounded-lg overflow-hidden border-2 disabled:opacity-50 ${
                              checked
                                ? "border-slate-900"
                                : atCap
                                  ? "border-transparent opacity-30 cursor-not-allowed"
                                  : "border-transparent opacity-50"
                            }`}
                          >
                            <img
                              src={imgUrl(src, "w_120,h_120,c_fill")}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            {isCover && (
                              <span className="absolute top-1 left-1 bg-slate-900/80 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                Main
                              </span>
                            )}
                            {checked && (
                              <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center">
                                {orderIndex + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mb-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">
                      Background music
                    </label>
                    <select
                      value={selectedMusic}
                      onChange={(e) => setSelectedMusic(e.target.value)}
                      disabled={videoRecording}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                    >
                      {MUSIC_TRACKS.map((track) => (
                        <option key={track.value} value={track.value}>
                          {track.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={generateVideo}
                    disabled={videoRecording || selectedImages.length === 0}
                    className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                  >
                    <FaVideo />
                    {videoUrl ? "Regenerate Video" : "Generate Video"}
                  </button>

                  {canShareVideoFiles && (
                    <button
                      onClick={handleShareVideo}
                      disabled={videoRecording || !videoUrl}
                      className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                    >
                      <FaShareAlt />
                      Share
                    </button>
                  )}

                  <button
                    onClick={handleDownloadVideo}
                    disabled={videoRecording || !videoUrl}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                  >
                    <FaDownload />
                    Download Video
                  </button>
                </>
              )}
            </div>

            {mode === "image" ? (
              canShareFiles ? (
                <p className="text-xs text-slate-500 mt-3">
                  Opens your phone's share menu — pick WhatsApp Status,
                  Instagram Story, Facebook or any app. On Instagram/Facebook
                  the caption often won't fill in automatically (their apps
                  block that); it's copied to your clipboard, so just paste it
                  into the caption field.
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-3">
                  Direct share works on mobile. On desktop, download the image
                  and post it from your phone instead.
                </p>
              )
            ) : (
              <p className="text-xs text-slate-500 mt-3">
                Slideshow video cycling through the selected photos, with the
                chosen background music baked in. Same caption-copy behavior
                as the image on share.
              </p>
            )}

            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              ⚠️ Instagram/Facebook never make a caption link tappable — before
              posting, update your bio link (or Linktree) to point at{" "}
              <strong>this product</strong>, or the caption's "bio link" CTA
              won't actually lead anywhere useful.
            </p>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-700">
                  Caption
                </span>
                <button
                  onClick={handleCopyCaption}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
                >
                  <FaCopy />
                  Copy Caption
                </button>
              </div>
              <textarea
                readOnly
                value={caption}
                rows={8}
                className="w-full text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3 resize-none font-mono"
                onClick={(e) => e.target.select()}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareProductModal;
