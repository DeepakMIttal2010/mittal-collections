import mongoose from "mongoose";

// Registered via router.param() in each route file (e.g.
// `router.param("id", validateObjectId)`) — Express calls this
// automatically for every route containing a matching `:id`/`:productId`
// etc., before the route's own middleware chain or controller runs.
//
// Without this, a malformed id (not a valid 24-char hex Mongo ObjectId —
// e.g. a bot/scanner probing random URLs, or a stale bookmark) reaches a
// bare `Model.findById(req.params.id)` in the controller and Mongoose
// throws a CastError. Every controller's generic `catch` block turns
// that into a 500 "Server Error" — wrong REST semantics (this is bad
// client input, not a server fault) and it silently pollutes error
// logs/Sentry with noise indistinguishable from a real server bug.
// Confirmed live (2026-10-02 DB/API audit): GET /api/products/not-a-id
// returned HTTP 500. The same bare-findById pattern exists 57 times
// across 20 controllers, so this is a shared route-level guard rather
// than a one-off fix in a single controller.
const validateObjectId = (req, res, next, value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
    });
  }

  next();
};

export default validateObjectId;
