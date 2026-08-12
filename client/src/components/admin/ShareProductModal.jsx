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
} from "react-icons/fa";

import { imgUrl } from "../../services/api";
import { productUrl } from "../../utils/productUrl";

const CANVAS_W = 1080;
const CANVAS_H = 1920;

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

function ShareProductModal({ product, onClose }) {
  const canvasRef = useRef(null);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const [canShareFiles, setCanShareFiles] = useState(false);

  const productLink = `${window.location.origin}${productUrl(product)}`;
  const hasDiscount = product.oldPrice && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round(
        ((product.oldPrice - product.price) / product.oldPrice) * 100,
      )
    : 0;

  useEffect(() => {
    const render = async () => {
      try {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        canvas.width = CANVAS_W;
        canvas.height = CANVAS_H;

        // Background product photo, cover-fit.
        const productImg = await loadImage(imgUrl(product.image));
        const scale = Math.max(
          CANVAS_W / productImg.width,
          CANVAS_H / productImg.height,
        );
        const drawW = productImg.width * scale;
        const drawH = productImg.height * scale;
        ctx.drawImage(
          productImg,
          (CANVAS_W - drawW) / 2,
          (CANVAS_H - drawH) / 2,
          drawW,
          drawH,
        );

        // Bottom gradient so white text stays legible over any photo.
        const gradient = ctx.createLinearGradient(0, CANVAS_H * 0.45, 0, CANVAS_H);
        gradient.addColorStop(0, "rgba(0,0,0,0)");
        gradient.addColorStop(1, "rgba(0,0,0,0.85)");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Brand wordmark, top.
        ctx.textBaseline = "alphabetic";
        ctx.font = "600 40px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 12;
        ctx.fillText("MITTAL", 60, 100);
        ctx.fillStyle = "#f59e0b";
        ctx.fillText("COLLECTIONS", 60 + ctx.measureText("MITTAL ").width, 100);

        // Discount badge, top-right.
        if (hasDiscount) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = "#dc2626";
          const badgeText = `${discountPct}% OFF`;
          ctx.font = "700 34px system-ui, sans-serif";
          const badgeW = ctx.measureText(badgeText).width + 48;
          ctx.beginPath();
          ctx.roundRect(CANVAS_W - badgeW - 50, 55, badgeW, 64, 32);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.fillText(badgeText, CANVAS_W - badgeW - 50 + 24, 100);
        }

        // Product name, wrapped, bottom section.
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

        // Price row.
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

        // Call to action + site domain.
        y += 60;
        ctx.shadowBlur = 0;
        ctx.font = "500 34px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText("Shop now at mittalcollections.com", 60, y);

        // QR code, bottom-right, linking to the product page.
        const qrDataUrl = await QRCode.toDataURL(productLink, {
          width: 260,
          margin: 1,
        });
        const qrImg = await loadImage(qrDataUrl);
        const qrSize = 220;
        const qrX = CANVAS_W - qrSize - 60;
        const qrY = CANVAS_H - qrSize - 70;

        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.roundRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 16);
        ctx.fill();
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // "Click Here to Buy" CTA button pointing at the QR code — a
        // WhatsApp Status image can't carry a real tappable link, so
        // this call-to-action plus the QR scan underneath it is the
        // closest practical substitute.
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
  }, [product, productLink, hasDiscount, discountPct]);

  const getBlob = () =>
    new Promise((resolve) => canvasRef.current.toBlob(resolve, "image/png"));

  const caption = `${product.name} — ₹${product.price}\n${productLink}`;

  const handleShare = async () => {
    const blob = await getBlob();
    if (!blob) return;

    const file = new File([blob], `${product.slug || "product"}.png`, {
      type: "image/png",
    });

    // WhatsApp attaches this text as a caption automatically, but
    // Instagram and Facebook's share targets both ignore pre-filled
    // text for anti-spam reasons — copy it to the clipboard so it's a
    // one-tap paste into their caption field instead of retyping.
    try {
      await navigator.clipboard.writeText(caption);
      toast.info("Caption copied — paste it if Instagram/Facebook don't fill it in");
    } catch {
      // Clipboard access can fail (permissions, insecure context) —
      // not worth blocking the share over.
    }

    try {
      await navigator.share({
        files: [file],
        title: product.name,
        text: caption,
      });
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  };

  const handleDownload = async () => {
    const blob = await getBlob();
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${product.slug || "product"}-share.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

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
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Generating...
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>
        </div>

        <div className="flex flex-col min-h-0">
          <div className="p-6 pb-4 overflow-y-auto min-h-0 flex-1">
            <h3 className="font-bold text-slate-900 text-lg mb-1">
              Share Product
            </h3>
            <p className="text-sm text-slate-500 mb-4">{product.name}</p>

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="space-y-2">
              {canShareFiles && (
                <button
                  onClick={handleShare}
                  disabled={rendering}
                  className="w-full flex items-center justify-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
                >
                  <FaShareAlt />
                  Share
                </button>
              )}

              {canShareFiles && (
                <p className="flex items-center justify-center gap-3 text-slate-400 text-lg -mt-1">
                  <FaWhatsapp className="hover:text-[#25D366] transition-colors" />
                  <FaInstagram className="hover:text-[#E1306C] transition-colors" />
                  <FaFacebookF className="hover:text-[#1877F2] transition-colors" />
                </p>
              )}

              <button
                onClick={handleDownload}
                disabled={rendering}
                className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
              >
                <FaDownload />
                Download Image
              </button>
            </div>

            {canShareFiles ? (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShareProductModal;
