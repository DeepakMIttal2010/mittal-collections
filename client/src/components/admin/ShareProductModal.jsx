import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "react-toastify";
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

// Builds an Instagram-ready caption: Hinglish hook, a description
// highlight, size/fabric/what's-included when the product has them, the
// local-delivery message, price, a CTA, the link, then hashtags — not
// just a bare "name — price" line.
const buildCaption = (product, productLink) => {
  const content = CATEGORY_CONTENT[product.category?.name] || DEFAULT_CATEGORY_CONTENT;
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

  lines.push("Order karein — niche link se 👇");
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

  ctx.textBaseline = "alphabetic";
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 12;
  ctx.fillText("MITTAL", 60, 100);
  ctx.fillStyle = "#f59e0b";
  ctx.fillText("COLLECTIONS", 60 + ctx.measureText("MITTAL ").width, 100);

  if (hasDiscount) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#dc2626";
    const badgeText = `${discountPct}% OFF`;
    ctx.font = "700 34px system-ui, sans-serif";
    const badgeW = ctx.measureText(badgeText).width + 48;

    const popT = Math.min(elapsedMs / BADGE_POP_MS, 1);
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

  y += 60;
  ctx.shadowBlur = 0;
  ctx.font = "500 34px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("Shop now at mittalcollections.com", 60, y);

  const qrSize = 220;
  const qrX = CANVAS_W - qrSize - 60;
  const qrY = CANVAS_H - qrSize - 70;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  ctx.textAlign = "center";
  ctx.font = "700 30px system-ui, sans-serif";
  const ctaText = "👉 Click Here to Buy";
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
  ctx.fillText("(or scan below)", ctaX, ctaY + 30);
  ctx.textAlign = "left";
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
  const [selectedMusic, setSelectedMusic] = useState(DEFAULT_MUSIC);

  const productLink = `${window.location.origin}${productUrl(product)}`;
  const hasDiscount = product.oldPrice && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((product.oldPrice - product.price) / product.oldPrice) * 100,
      )
    : 0;

  const overlayInfo = { product, hasDiscount, discountPct };

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
    setVideoRecording(true);
    setVideoUrl(null);
    setVideoBlob(null);

    try {
      const mimeType = pickVideoMimeType();
      if (!mimeType) {
        throw new Error("This browser can't record video. Try a different browser.");
      }

      const images = (product.images?.length ? product.images : [product.image]).slice(
        0,
        MAX_SLIDES,
      );
      const loadedImages = await Promise.all(images.map((src) => loadImage(imgUrl(src))));

      const qrDataUrl = await QRCode.toDataURL(productLink, { width: 260, margin: 1 });
      const qrImg = await loadImage(qrDataUrl);

      const canvas = videoCanvasRef.current;
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d");

      const slideMs = Math.max(SLIDE_MS, MIN_VIDEO_MS / loadedImages.length);
      const totalMs = slideMs * loadedImages.length;

      // Bake the chosen track directly into the recording rather than
      // leaving "add music" as a manual step on Instagram/Facebook,
      // which is easy to skip. Skipped entirely for "none" — no
      // AudioContext, no extra permission prompt, video stays silent.
      let audioCtx = null;
      const videoStream = canvas.captureStream(30);
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

      const stopped = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      recorder.start();

      let frameHandle;
      const startedAt = performance.now();

      const drawFrame = () => {
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
      };

      frameHandle = requestAnimationFrame(drawFrame);

      await stopped;
      cancelAnimationFrame(frameHandle);
      if (audioCtx) await audioCtx.close();

      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
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
    if (next === "video" && !videoUrl && !videoRecording) {
      generateVideo();
    }
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
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                    —
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
                    <p className="text-[11px] text-slate-400 mt-1">
                      Change this, then Regenerate below to re-record with
                      the new track.
                    </p>
                  </div>

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

                  {!videoRecording && (
                    <button
                      onClick={generateVideo}
                      className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
                    >
                      Regenerate
                    </button>
                  )}
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
                Silent slideshow video cycling through the product's photos —
                add trending audio yourself when posting to Reels/Stories.
                Same caption-copy behavior as the image on share.
              </p>
            )}

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
