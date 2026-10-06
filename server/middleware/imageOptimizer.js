import sharp from "sharp";

import cloudinary from "../config/cloudinary.js";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

const isVideo = (mimetype) => mimetype.startsWith("video/");

// Same slugify logic duplicated per-controller for name -> slug (see
// productController.js etc.) — reimplemented here rather than imported,
// since middleware shouldn't reach into a controller module.
const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// Cloudinary defaults to a random public_id ("p6mvck0p6ey8ynxv681b") —
// fine for the asset itself, but that random string is also the
// filename Google Images indexes the photo under, and a descriptive
// filename ("pure-cotton-fitted-bedsheet-blue-1-...") is a real (if
// minor) ranking signal there that a random one just throws away.
// `index` (this file's position among the files in this request) keeps
// multiple photos of the same product from colliding on the same slug;
// the trailing random suffix guarantees uniqueness even across repeated
// uploads for the same product, without relying on exactly how
// Cloudinary's own unique_filename/overwrite defaults interact with an
// explicitly-provided public_id.
const buildDescriptivePublicId = (namePrefix, index) => {
  if (!namePrefix) return undefined;

  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${namePrefix}-${index + 1}-${suffix}`;
};

const optimizeBuffer = async (file) => {
  const pipeline = sharp(file.buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (file.mimetype === "image/png") {
    return pipeline.png({ quality: JPEG_QUALITY, compressionLevel: 9 }).toBuffer();
  }

  if (file.mimetype === "image/webp") {
    return pipeline.webp({ quality: JPEG_QUALITY }).toBuffer();
  }

  return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
};

// multer's fileFilter only checks the client-supplied Content-Type
// header for the file part, which any caller fully controls — it's not
// a real content check. Normally sharp's resize/re-encode in
// optimizeBuffer decodes the buffer as a side effect and throws on
// anything that isn't genuinely that image format, which is the real
// validation. But a caller can skip that entirely via the
// "optimizeImages=false" form field (meant for admin-curated assets
// that shouldn't be recompressed) — and that field isn't restricted to
// admin routes, so an authenticated customer posting straight to
// POST /api/reviews (uploadReviewMedia + this middleware, no admin gate)
// could set it to upload an arbitrary file mislabeled as an image with
// no content check at all. Decoding (without re-encoding) whenever
// optimization is skipped closes that off while still letting a
// legitimate caller avoid the recompression cost.
const assertValidImage = async (file) => {
  await sharp(file.buffer).metadata();
};

// Same spirit as assertValidImage above, but videos have no equivalent
// "decode it and see" library already in this dependency tree (adding
// one, e.g. ffmpeg, is a real infra change, not a validation tweak) — so
// this checks the file's actual container signature instead of trusting
// file.mimetype (multer's fileFilter only checks the client-supplied
// Content-Type header, which any caller fully controls). Every video
// upload reaches this with zero content check today, via
// POST /api/reviews (uploadReviewMedia + this middleware — no admin
// gate, reachable by any authenticated customer) as well as admin
// product-media uploads — an attacker could otherwise host an arbitrary
// file on this site's Cloudinary account mislabeled as video/mp4.
// mp4/mov (QuickTime) share the ISO base media file format container,
// identified by an "ftyp" box at byte offset 4; webm is Matroska-based,
// identified by its EBML header magic bytes.
const assertValidVideo = (file) => {
  const buffer = file.buffer;

  const isIsoBmff =
    buffer.length >= 8 && buffer.toString("ascii", 4, 8) === "ftyp";

  const isWebm =
    buffer.length >= 4 &&
    buffer[0] === 0x1a &&
    buffer[1] === 0x45 &&
    buffer[2] === 0xdf &&
    buffer[3] === 0xa3;

  if (!isIsoBmff && !isWebm) {
    throw new Error("File is not a valid MP4, MOV or WEBM video");
  }
};

const uploadBufferToCloudinary = (buffer, resourceType, publicId) =>
  new Promise((resolve, reject) => {
    const options = {
      folder: "mittal-collections",
      resource_type: resourceType,
    };

    if (publicId) options.public_id = publicId;

    if (resourceType === "image") {
      options.quality = "auto:good";
      options.fetch_format = "auto";
    }

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });

    stream.end(buffer);
  });

const processFile = async (file, shouldOptimize, publicId) => {
  if (isVideo(file.mimetype)) {
    assertValidVideo(file);

    const result = await uploadBufferToCloudinary(file.buffer, "video", publicId);
    file.path = result.secure_url;
    // Exposed so callers can validate/act on Cloudinary-reported metadata
    // (e.g. review videos rejecting clips over the allowed duration) —
    // the URL alone doesn't carry that.
    file.cloudinaryResult = result;
    return;
  }

  if (!shouldOptimize) {
    await assertValidImage(file);
  }

  const buffer = shouldOptimize ? await optimizeBuffer(file) : file.buffer;
  const result = await uploadBufferToCloudinary(buffer, "image", publicId);

  file.path = result.secure_url;
  file.cloudinaryResult = result;
};

// Uploads req.file / req.files to Cloudinary, optionally resizing + re-encoding
// images via sharp first (videos always pass through untouched). Controlled by
// the "optimizeImages" form field (default: on). Handles req.file (single),
// req.files as an array (upload.array), and req.files as an object of arrays
// (upload.fields).
const imageOptimizer = async (req, res, next) => {
  try {
    const shouldOptimize = req.body.optimizeImages !== "false";
    // Products/categories/subcategories send "name"; articles send
    // "title" — either way, a descriptive Cloudinary public_id instead
    // of Cloudinary's random default (see buildDescriptivePublicId).
    // Falls back to no override (Cloudinary's own random id) for any
    // upload that doesn't carry one of these fields, e.g. reviews.
    const namePrefix = (() => {
      const raw = req.body.name || req.body.title;
      return raw ? slugify(raw) : null;
    })();
    let fileIndex = 0;
    const tasks = [];

    if (req.file) {
      tasks.push(
        processFile(
          req.file,
          shouldOptimize,
          buildDescriptivePublicId(namePrefix, fileIndex++),
        ),
      );
    }

    if (Array.isArray(req.files)) {
      tasks.push(
        ...req.files.map((file) =>
          processFile(
            file,
            shouldOptimize,
            buildDescriptivePublicId(namePrefix, fileIndex++),
          ),
        ),
      );
    } else if (req.files && typeof req.files === "object") {
      Object.values(req.files).forEach((fileArray) => {
        tasks.push(
          ...fileArray.map((file) =>
            processFile(
              file,
              shouldOptimize,
              buildDescriptivePublicId(namePrefix, fileIndex++),
            ),
          ),
        );
      });
    }

    await Promise.all(tasks);

    next();
  } catch (error) {
    console.error("Image Optimizer Error:", error);

    res.status(500).json({
      success: false,
      message: "Image upload failed",
    });
  }
};

export default imageOptimizer;
