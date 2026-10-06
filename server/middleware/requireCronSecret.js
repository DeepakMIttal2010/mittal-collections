// Every cron-triggered endpoint (an external scheduler hitting these
// with no JWT — see each controller's own comment) checked
// `req.query.secret !== process.env.CRON_SECRET` inline. If
// CRON_SECRET is ever unset/empty on the server (exactly what
// happened in a real past incident — a corrupted env var), that
// comparison becomes `undefined !== undefined`, which is false, so a
// request with NO ?secret= at all passes and the endpoint runs
// unauthenticated for anyone. Requiring CRON_SECRET to actually be a
// non-empty string closes that off — a missing/blank secret now fails
// closed instead of failing open.
const requireCronSecret = (req, res, next) => {
  if (!process.env.CRON_SECRET || req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
};

export default requireCronSecret;
