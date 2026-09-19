import multer from "multer";

const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: "That file is too large.",
  LIMIT_FILE_COUNT: "Too many files.",
  // Multer reports both "wrong field name" and "exceeded this field's
  // maxCount" under this same code — the max counts below are the
  // ones actually configured (see uploadMiddleware.js's .fields()).
  LIMIT_UNEXPECTED_FILE:
    "Too many files were uploaded at once — images: max 6, videos: max 2.",
};

// Runs before Sentry's error handler so it can tag `err.status` on error
// classes that are expected, client-side outcomes rather than server
// bugs: hitting the upload file-count limit, or the browser tab closing
// / navigating away mid-upload. Sentry's default shouldHandleError only
// reports status >= 500, so tagging these here is what keeps them out
// of Sentry as noise (confirmed both were showing up there as
// "Unhandled" before this existed) without needing a custom
// shouldHandleError callback of our own.
export function classifyKnownErrors(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    err.status = 400;
  } else if (err.message === "Request aborted") {
    // multer's own wording (make-middleware.js) for a client that
    // disconnected mid-request — there's no one left to respond to.
    err.status = 499;
  }

  next(err);
}

// The app had no catch-all error-handling middleware at all before
// this — an error thrown by upload parsing (or anything else) fell
// through to Express's default handler, which sends an HTML page, not
// the `{success, message}` JSON shape every client service function
// expects. That's why a MulterError here showed up to the admin as an
// opaque failed save instead of a usable message.
export function jsonErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err.status === 499) return; // client already gone — nothing to send

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: MULTER_MESSAGES[err.code] || err.message,
    });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message:
      status >= 500 ? "Something went wrong. Please try again." : err.message,
  });
}
