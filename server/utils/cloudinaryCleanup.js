import cloudinary from "../config/cloudinary.js";

// Cloudinary URLs look like:
//   https://res.cloudinary.com/<cloud>/image/upload/v169.../folder/id.jpg
//   https://res.cloudinary.com/<cloud>/video/upload/v169.../folder/id.mp4
// public_id is everything between the optional version segment and the
// file extension — including any folder path.
const extractPublicId = (url) => {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  return match ? match[1] : null;
};

const resourceTypeFromUrl = (url) => (url.includes("/video/upload/") ? "video" : "image");

// Deletes Cloudinary assets by their stored URLs. Best-effort — a
// Cloudinary failure is logged, never thrown, so it can't block the
// DB delete the caller is actually trying to do. Only call this from
// genuinely permanent deletes, never a soft delete (isActive: false),
// since a soft-deleted record can still be restored.
export const deleteCloudinaryAssetsByUrl = async (urls = []) => {
  const uniqueUrls = [...new Set(urls.filter(Boolean))];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      const publicId = extractPublicId(url);
      if (!publicId) return;

      try {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: resourceTypeFromUrl(url),
        });
      } catch (error) {
        console.error(`Failed to delete Cloudinary asset ${publicId}:`, error.message);
      }
    }),
  );
};
