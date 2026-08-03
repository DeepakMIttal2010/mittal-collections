import multer from "multer";

const storage = multer.memoryStorage();

const IMAGE_TYPES = /jpg|jpeg|png|webp/;
const VIDEO_TYPES = /mp4|webm|mov|quicktime/;

// File Filter — images only (banners, categories, subcategories)
const imageFileFilter = (req, file, cb) => {
  if (IMAGE_TYPES.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, JPEG, PNG and WEBP images are allowed."));
  }
};

// File Filter — images + videos (products)
const productMediaFileFilter = (req, file, cb) => {
  if (IMAGE_TYPES.test(file.mimetype) || VIDEO_TYPES.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
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

export default upload;
