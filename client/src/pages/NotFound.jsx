import { Link } from "react-router-dom";

import Seo from "../components/Seo";

function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <Seo
        title="Page Not Found"
        description="The page you're looking for doesn't exist."
        noindex
      />

      <p className="text-sm font-semibold text-amber-600 mb-3">404</p>

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        Page Not Found
      </h1>

      <p className="text-slate-600 mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have been
        moved.
      </p>

      <Link
        to="/"
        className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors"
      >
        Back to Home
      </Link>
    </div>
  );
}

export default NotFound;
