import multer from "multer";

const storage = multer.memoryStorage();

const IMAGE_TYPES = /jpg|jpeg|png|webp/;
const VIDEO_TYPES = /mp4|webm|mov|quicktime/;

// A rejected file type is an expected, client-side outcome (someone
// picked the wrong file), not a server bug — status = 400 here is what
// errorHandler.js's jsonErrorHandler reads to respond 400 instead of the
// 500 default, and what keeps it out of Sentry (shouldHandleError only
// reports >= 500). A plain `new Error(...)` isn't a multer.MulterError,
// so classifyKnownErrors' own instanceof check doesn't catch these —
// confirmed live in Sentry as an "Unhandled" 500 for exactly this
// message before this existed.
const fileTypeError = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

// File Filter — images only (banners, categories, subcategories)
const imageFileFilter = (req, file, cb) => {
  if (IMAGE_TYPES.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(fileTypeError("Only JPG, JPEG, PNG and WEBP images are allowed."));
  }
};

// File Filter — images + videos (products)
const productMediaFileFilter = (req, file, cb) => {
  if (IMAGE_TYPES.test(file.mimetype) || VIDEO_TYPES.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      fileTypeError(
        "Only JPG, JPEG, PNG, WEBP images and MP4, WEBM, MOV videos are allowed.",
      ),
    );
  }
};

const upload = multer({
  storage,
  fileFilter: imageFileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

export const uploadProductMedia = multer({
  storage,
  fileFilter: productMediaFileFilter,

  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB — videos need more room than images
  },
});

// Customer review photos/video — same allowed types as product media, but a
// tighter per-file cap since these are user uploads, not curated product
// assets. A 10-15s clip fits comfortably under this.
export const uploadReviewMedia = multer({
  storage,
  fileFilter: productMediaFileFilter,

  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
});

export default upload;
