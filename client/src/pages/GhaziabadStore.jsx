import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaMapMarkerAlt, FaPhoneAlt, FaClock } from "react-icons/fa";

import Seo from "../components/Seo";
import { getSiteSettings } from "../services/settingsService";
import { getCategories } from "../services/categoryService";
import { buildBreadcrumbJsonLd } from "../utils/breadcrumbJsonLd";
import { DELIVERY_AREAS } from "../utils/deliveryAreas";
import { SITE_URL } from "../utils/siteUrl";
import { useLanguage } from "../context/LanguageContext";
import { GHAZIABAD_COPY, WALK_IN_OPEN, listableCategories, walkInNote } from "../utils/ghaziabadStoreCopy";
import { buildLocalBusinessJsonLd } from "../utils/localBusinessJsonLd";

// Static page copy (EN + HI) and the walk-in switch live in
// utils/ghaziabadStoreCopy.js; api/render.js mirrors them for bots (GZ-01/05).
const COPY = GHAZIABAD_COPY;

// A dedicated local-SEO landing page, separate from the product-focused
// category pages and the transactional Contact page -- targets searches
// like "home furnishing store in Ghaziabad" / "bedsheets near me" that
// neither of those pages is built to rank for (Deep SEO Round 5 flagged
// this as a real content gap; Round 6's local-Ghaziabad scope is what
// this page is meant to serve).
function GhaziabadStore() {
  const [settings, setSettings] = useState({});
  const [categories, setCategories] = useState([]);
  const { t } = useLanguage();
  const tr = (pair) => t(pair.en, pair.hi);
  const note = walkInNote(WALK_IN_OPEN);

  useEffect(() => {
    getSiteSettings().then((res) => {
      if (res.success) setSettings(res.settings);
    });
    getCategories().then((res) => {
      if (res.success) setCategories(listableCategories(res.categories));
    });
  }, []);

  // Same @id as Home.jsx/Contact.jsx's HomeGoodsStore block -- same
  // business entity, not a second one. Landmark folded into
  // streetAddress since that's the one concrete, specific detail this
  // page exists to surface (the admin-configured settings.address is a
  // plainer "Sector 3, Vasundhara..." with no landmark).
  const localBusinessJsonLd = buildLocalBusinessJsonLd(settings, {
    streetAddress: "Near Vanasthali Public School, Sector 3, Vasundhara",
    postalCode: "201012",
    includeAreaServed: true,
  });

  const breadcrumbItems = [
    { name: "Home", path: "/" },
    { name: "Home Furnishing Store in Ghaziabad" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 pt-16 pb-20">
      <Seo
        title="Home Furnishing Store in Ghaziabad — Mittal Collections"
        description="Mittal Collections is a home furnishing store in Sector 3, Vasundhara, Ghaziabad, near Vanasthali Public School — bedsheets, curtains, towels & more, with delivery within 24 hours in selected Ghaziabad PIN codes (Vasundhara, Vaishali, Indirapuram and nearby)."
        url={`${SITE_URL}/ghaziabad-home-furnishing-store`}
        jsonLd={[localBusinessJsonLd, buildBreadcrumbJsonLd(breadcrumbItems)]}
      />

      <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
        {tr(COPY.heading)}
      </h1>

      <p className="text-amber-700 font-semibold mb-1">
        {tr(COPY.tagline)}
      </p>

      <p className="text-slate-600 mb-4">
        {tr(COPY.subTagline)}
      </p>

      <p className="text-slate-600 leading-relaxed mb-8">
        {tr(COPY.intro)}
      </p>

      <ul className="space-y-3 mb-10 text-slate-700">
        {COPY.bullets.map((parts) => (
          <li key={parts[0].en} className="flex gap-2">
            <span className="text-amber-600">✓</span>
            <span>
              {parts.map((part) =>
                part.path ? (
                  <Link key={part.en} to={part.path} className="text-blue-700 hover:underline">
                    {tr(part)}
                  </Link>
                ) : (
                  <span key={part.en}>{tr(part)}</span>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10 space-y-4">
        <div className="flex items-start gap-3">
          <FaMapMarkerAlt className="text-amber-600 mt-1 shrink-0" />
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
              {tr(COPY.visit.heading)}
            </h2>
            <p className="text-slate-700">
              {tr(COPY.visit.address)}
            </p>
            {/* The shop isn't taking walk-ins until it reopens (planned
                Dec 2026; matches the Google Business Profile's "in-store
                shopping" attribute). Flip WALK_IN_OPEN in
                utils/ghaziabadStoreCopy.js (and its mirror in
                api/render.js) when it reopens. */}
            {note && <p className="text-sm text-amber-700 mt-1">{tr(note)}</p>}
          </div>
        </div>

        {settings.phone && (
          <div className="flex items-start gap-3">
            <FaPhoneAlt className="text-amber-600 mt-1 shrink-0" />
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
                {tr(COPY.call.heading)}
              </h2>
              <a href={`tel:${settings.phone}`} className="text-blue-700 hover:underline">
                {settings.phone}
              </a>
            </div>
          </div>
        )}

        <div className="flex items-start gap-3">
          <FaClock className="text-amber-600 mt-1 shrink-0" />
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase mb-1">
              {tr(COPY.delivery.heading)}
            </h2>
            <p className="text-slate-700">
              {tr(COPY.delivery.text)}
            </p>
            <p className="text-slate-600 text-sm mt-1">
              {DELIVERY_AREAS.join(", ")}
            </p>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            {tr(COPY.categoriesHeading)}
          </h2>
          <div className="flex flex-wrap gap-3">
            {categories.map((category) => (
              <Link
                key={category._id}
                to={`/category/${category.slug}`}
                className="border border-slate-300 rounded-full px-5 py-2 text-sm font-medium text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors"
              >
                {t(category.name, category.nameHi)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          {tr(COPY.questions.heading)}
        </h2>
        <p className="text-slate-600 mb-4">
          {tr(COPY.questions.text)}
        </p>
        <Link
          to={COPY.questions.cta.path}
          className="inline-block bg-blue-900 hover:bg-blue-950 text-white font-semibold rounded-full px-6 py-3 transition-colors"
        >
          {tr(COPY.questions.cta)}
        </Link>
      </div>
    </div>
  );
}

export default GhaziabadStore;
