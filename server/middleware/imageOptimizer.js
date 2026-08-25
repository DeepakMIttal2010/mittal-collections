import sharp from "sharp";

import cloudinary from "../config/cloudinary.js";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

const isVideo = (mimetype) => mimetype.startsWith("video/");

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

const uploadBufferToCloudinary = (buffer, resourceType) =>
  new Promise((resolve, reject) => {
    const options = {
      folder: "mittal-collections",
      resource_type: resourceType,
    };

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

const processFile = async (file, shouldOptimize) => {
  if (isVideo(file.mimetype)) {
    const result = await uploadBufferToCloudinary(file.buffer, "video");
    file.path = result.secure_url;
    // Exposed so callers can validate/act on Cloudinary-reported metadata
    // (e.g. review videos rejecting clips over the allowed duration) —
    // the URL alone doesn't carry that.
    file.cloudinaryResult = result;
    return;
  }

  const buffer = shouldOptimize ? await optimizeBuffer(file) : file.buffer;
  const result = await uploadBufferToCloudinary(buffer, "image");

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
    const tasks = [];

    if (req.file) {
      tasks.push(processFile(req.file, shouldOptimize));
    }

    if (Array.isArray(req.files)) {
      tasks.push(...req.files.map((file) => processFile(file, shouldOptimize)));
    } else if (req.files && typeof req.files === "object") {
      Object.values(req.files).forEach((fileArray) => {
        tasks.push(...fileArray.map((file) => processFile(file, shouldOptimize)));
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
