export const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// transform is an optional Cloudinary transformation string (e.g.
// "w_400,q_auto,f_auto") — applied only to Cloudinary-hosted images so a
// thumbnail doesn't ship the same ~1600px master asset as the product
// hero. Legacy /uploads/* images ignore it, since they're served as-is.
export const imgUrl = (path, transform) => {
  if (!path) return path;

  if (!path.startsWith("http")) return `${SERVER_URL}${path}`;

  if (transform && path.includes("res.cloudinary.com/") && path.includes("/upload/")) {
    return path.replace("/upload/", `/upload/${transform}/`);
  }

  return path;
};

const API_BASE_URL = `${SERVER_URL}/api`;

export default API_BASE_URL;
