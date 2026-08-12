import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { FaTimes, FaWhatsapp, FaDownload } from "react-icons/fa";

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

  const handleShare = async () => {
    const blob = await getBlob();
    if (!blob) return;

    const file = new File([blob], `${product.slug || "product"}.png`, {
      type: "image/png",
    });

    try {
      await navigator.share({
        files: [file],
        title: product.name,
        text: `${product.name} — ₹${product.price}\n${productLink}`,
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
    <div className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Share Product</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <FaTimes />
          </button>
        </div>

        <div className="p-5">
          <div className="relative rounded-xl overflow-hidden bg-slate-100 aspect-[9/16]">
            {rendering && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Generating...
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-full object-contain" />
          </div>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="mt-4 space-y-2">
            {canShareFiles && (
              <button
                onClick={handleShare}
                disabled={rendering}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold py-3 rounded-full transition-colors disabled:opacity-50"
              >
                <FaWhatsapp className="text-lg" />
                Share to WhatsApp
              </button>
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

          {!canShareFiles && (
            <p className="text-xs text-slate-500 mt-3 text-center">
              Direct share works on mobile. On desktop, download the image
              and post it to WhatsApp Status from your phone.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShareProductModal;
