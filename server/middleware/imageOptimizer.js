import sharp from "sharp";

import cloudinary from "../config/cloudinary.js";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 85;

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

const uploadBufferToCloudinary = (buffer) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "mittal-collections",
        quality: "auto:good",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );

    stream.end(buffer);
  });

const processFile = async (file, shouldOptimize) => {
  const buffer = shouldOptimize ? await optimizeBuffer(file) : file.buffer;
  const result = await uploadBufferToCloudinary(buffer);

  file.path = result.secure_url;
};

// Uploads req.file / req.files to Cloudinary, optionally resizing + re-encoding
// via sharp first. Controlled by the "optimizeImages" form field (default: on).
const imageOptimizer = async (req, res, next) => {
  try {
    const shouldOptimize = req.body.optimizeImages !== "false";

    if (req.file) {
      await processFile(req.file, shouldOptimize);
    }

    if (req.files && req.files.length > 0) {
      await Promise.all(req.files.map((file) => processFile(file, shouldOptimize)));
    }

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
