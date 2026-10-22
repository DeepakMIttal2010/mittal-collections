import "./instrument.js";
import "dotenv/config";

import connectDB from "./config/db.js";
import app from "./app.js";

connectDB();

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Render's load balancer keeps idle connections open longer than Node's
// 5s default keep-alive; when Node closes one first, the next request on
// it comes back as a 502. Keep ours longer than the proxy's.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
