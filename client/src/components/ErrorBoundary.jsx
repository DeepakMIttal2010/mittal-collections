import { Component } from "react";

// Error boundaries must be class components — React has no hook
// equivalent for getDerivedStateFromError/componentDidCatch.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught an error:", error, info);
  }

  componentDidUpdate(prevProps) {
    // Lets a crashed section recover automatically when the caller's
    // resetKey changes (e.g. the route pathname) instead of staying
    // broken until a full page reload.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? <DefaultFallback />;
    }

    return this.props.children;
  }
}

function DefaultFallback() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <p className="text-sm font-semibold text-amber-600 mb-3">
        Something went wrong
      </p>

      <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
        This page hit a snag
      </h1>

      <p className="text-slate-600 mb-8">
        Sorry about that — please reload the page. If the problem keeps
        happening, let us know.
      </p>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-8 py-3.5 transition-colors"
      >
        Reload Page
      </button>
    </div>
  );
}

export default ErrorBoundary;
