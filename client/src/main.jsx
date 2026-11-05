import "./instrument.js";
import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";

import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { installAuthFetchGuard } from "./utils/authFetchGuard";
import { reportWebVitals } from "./utils/webVitals";

installAuthFetchGuard();
reportWebVitals();

import { CartProvider } from "./context/CartContext";
import { WishlistProvider } from "./context/WishlistContext";
import { CompareProvider } from "./context/CompareContext";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  ProductDetails,
  CategoryPage,
  TrendingPage,
  ClearanceSalePage,
  NewArrivalsPage,
  GiftingPage,
} from "./routes/AppRoutes";

// First load of a product/category/landing URL: fetch that one route chunk
// before the first render (see preloadableRoute in AppRoutes.jsx). Capped
// so a slow or failed chunk never holds the page back for long.
const ROUTE_PRELOAD_TIMEOUT_MS = 3000;
const PRELOAD_ROUTES = [
  [/^\/(hi\/)?product\//, ProductDetails],
  [/^\/(hi\/)?category\//, CategoryPage],
  [/^\/trending\/?$/, TrendingPage],
  [/^\/clearance-sale\/?$/, ClearanceSalePage],
  [/^\/(hi\/)?new-arrivals\/?$/, NewArrivalsPage],
  [/^\/gifting\/?$/, GiftingPage],
];
const initialRoute =
  PRELOAD_ROUTES.find(([pattern]) => pattern.test(window.location.pathname))?.[1] ?? null;

(initialRoute
  ? initialRoute.preload(ROUTE_PRELOAD_TIMEOUT_MS)
  : Promise.resolve()
).then(renderApp);

function renderApp() {
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <BrowserRouter>
          <LanguageProvider>
            <AuthProvider>
              <CartProvider>
                <WishlistProvider>
                  <CompareProvider>
                    <App />

                    <ToastContainer
                      position="top-right"
                      autoClose={2000}
                      hideProgressBar={false}
                      newestOnTop
                      closeOnClick
                      pauseOnHover
                      draggable
                      theme="colored"
                    />
                  </CompareProvider>
                </WishlistProvider>
              </CartProvider>
            </AuthProvider>
          </LanguageProvider>
        </BrowserRouter>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
}
