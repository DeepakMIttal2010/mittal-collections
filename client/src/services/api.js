export const SERVER_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const imgUrl = (path) => {
  if (!path) return path;

  return path.startsWith("http") ? path : `${SERVER_URL}${path}`;
};

const API_BASE_URL = `${SERVER_URL}/api`;

export default API_BASE_URL;
