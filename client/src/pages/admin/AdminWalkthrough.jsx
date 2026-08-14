import { FaDownload } from "react-icons/fa";

import homepageImg from "../../assets/walkthrough/01-homepage.jpg";
import productPageImg from "../../assets/walkthrough/02-product-page.jpg";
import cartPageImg from "../../assets/walkthrough/04-cart-page.jpg";
import checkoutPageImg from "../../assets/walkthrough/05-checkout-page.jpg";
import mobileHomepageImg from "../../assets/walkthrough/06-mobile-homepage.jpg";
import dashboardImg from "../../assets/walkthrough/07-admin-dashboard.jpg";
import productsImg from "../../assets/walkthrough/08-admin-products.jpg";
import posImg from "../../assets/walkthrough/09-admin-pos.jpg";
import settingsImg from "../../assets/walkthrough/10-admin-settings.jpg";
import reportsImg from "../../assets/walkthrough/11-admin-reports.jpg";
import ordersImg from "../../assets/walkthrough/12-admin-orders.jpg";

function Shot({ src, alt, caption }) {
  return (
    <figure className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
      <img src={src} alt={alt} className="w-full block" />
      {caption && (
        <figcaption className="px-4 py-2.5 text-xs text-slate-500 border-t border-slate-100">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

function Section({ eyebrow, title, description, children }) {
  return (
    <section className="mb-14 print:break-inside-avoid">
      {eyebrow && (
        <p className="text-xs font-bold tracking-wide uppercase text-amber-600 mb-1.5">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-bold text-slate-900 mb-2">{title}</h2>
      {description && (
        <p className="text-slate-600 max-w-3xl mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {children}
    </section>
  );
}

function AdminWalkthrough() {
  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto print:p-0">
      <div className="flex items-start justify-between gap-4 mb-2 print:hidden">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Mittal Collections — Product Walkthrough
          </h1>
          <p className="text-slate-500 mt-1">
            A living reference of the storefront and admin panel — screenshots
            update here as the site changes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => window.print()}
          className="shrink-0 flex items-center gap-2 bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-5 py-2.5 transition-colors"
        >
          <FaDownload />
          Download / Print
        </button>
      </div>

      <p className="hidden print:block text-sm text-slate-500 mb-8">
        Mittal Collections — Product Walkthrough ·{" "}
        {new Date().toLocaleDateString("en-IN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>

      <hr className="border-slate-200 mb-10 print:hidden" />

      {/* ===================== CUSTOMER JOURNEY ===================== */}
      <p className="text-xs font-bold tracking-wide uppercase text-slate-400 mb-4">
        Part 1 — Customer Journey
      </p>

      <Section
        eyebrow="Homepage"
        title="First impression"
        description="Hero banner, delivery/offer bars, and category navigation — all admin-editable without a code change. The offer bars and delivery promise are pulled from real settings, not hardcoded."
      >
        <Shot
          src={homepageImg}
          alt="Mittal Collections homepage"
          caption="Homepage — hero banner, delivery + welcome-offer bars, category nav"
        />
      </Section>

      <Section
        eyebrow="Product Page"
        title="Product detail"
        description="Full product info, real customer-photo gallery, reviews, and Hindi/English toggle. Products from a complementary category are cross-sold here when a bundle discount rule applies."
      >
        <Shot
          src={productPageImg}
          alt="Product detail page"
          caption="Product page — gallery, pricing, specs, reviews"
        />
      </Section>

      <Section
        eyebrow="Cart"
        title="“Complete the Look” bundle discount"
        description="Buying from two linked categories (e.g. Bedsheets + Cushion Covers) unlocks an automatic discount at checkout — no coupon code needed. The cart nudges the customer toward it in real time."
      >
        <Shot
          src={cartPageImg}
          alt="Shopping cart with bundle discount nudge"
          caption="Cart — live bundle-discount nudge, order summary, loyalty points preview"
        />
      </Section>

      <Section
        eyebrow="Checkout"
        title="Checkout"
        description="Address selection, coupon codes, loyalty-point redemption and delivery-fee breakdown in one screen."
      >
        <Shot
          src={checkoutPageImg}
          alt="Checkout page"
          caption="Checkout — address, payment method, order summary"
        />
      </Section>

      <Section
        eyebrow="Mobile"
        title="Mobile experience"
        description="The full storefront — search, cart, offers — fits a phone screen without horizontal scrolling or clipped content."
      >
        <div className="max-w-xs">
          <Shot
            src={mobileHomepageImg}
            alt="Mobile homepage"
            caption="Mobile homepage"
          />
        </div>
      </Section>

      {/* ===================== ADMIN PANEL ===================== */}
      <p className="text-xs font-bold tracking-wide uppercase text-slate-400 mb-4 mt-4">
        Part 2 — Admin Panel
      </p>

      <Section
        eyebrow="Dashboard"
        title="At-a-glance overview"
        description="Products, orders, users and total sales on landing — the sidebar groups everything else by task (Catalog & Stock, Sales, Customers, Content & Marketing, Support, Configuration) and collapses to just the section you're using."
      >
        <Shot
          src={dashboardImg}
          alt="Admin dashboard"
          caption="Dashboard — key totals, recent orders, grouped sidebar navigation"
        />
      </Section>

      <Section
        eyebrow="Catalog & Stock"
        title="Product management"
        description="Add, edit, duplicate or QR-print any product. Stock, pricing, return policy and bundle-category all live here — Excel export included for offline review."
      >
        <Shot
          src={productsImg}
          alt="Admin product management"
          caption="Products — catalog grid with stock, pricing and quick actions"
        />
      </Section>

      <Section
        eyebrow="Sales"
        title="In-store billing (POS)"
        description="Scan a product's QR code to bill a walk-in customer — apply a manual discount, attach a UPI/card payment-proof photo, and print or WhatsApp the receipt on the spot."
      >
        <Shot
          src={posImg}
          alt="POS cart with discount applied"
          caption="POS Cart — real sale with a ₹50 discount applied, subtotal → total breakdown"
        />
      </Section>

      <Section
        eyebrow="Configuration"
        title="Bundle discount rules"
        description="Any two categories can be linked into a bundle rule with its own discount percentage — created and toggled here, live on the storefront immediately, no deploy required."
      >
        <Shot
          src={settingsImg}
          alt="Bundle discount settings"
          caption="Settings — Bundle Discounts (Complete the Look) configuration"
        />
      </Section>

      <Section
        eyebrow="Reports"
        title="Sales & traffic analytics"
        description="Revenue, orders, website visits and live cart-abandonment tracking — pulled from real GA4 and order data, not a mockup."
      >
        <Shot
          src={reportsImg}
          alt="Admin reports and analytics"
          caption="Reports — sales, traffic, and cart-abandonment overview"
        />
      </Section>

      <Section
        eyebrow="Sales"
        title="Order management"
        description="Every online order, its status, and its history in one list — searchable and filterable."
      >
        <Shot
          src={ordersImg}
          alt="Admin order list"
          caption="Orders — full order list and status management"
        />
      </Section>

      <p className="text-xs text-slate-400 mt-16 print:mt-8">
        Generated from the live site — screenshots are refreshed as features
        change.
      </p>
    </div>
  );
}

export default AdminWalkthrough;
