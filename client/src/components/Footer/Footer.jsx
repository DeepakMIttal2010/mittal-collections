import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FaFacebookF,
  FaInstagram,
  FaTwitter,
  FaLinkedinIn,
  FaMapMarkerAlt,
  FaPhoneAlt,
} from "react-icons/fa";

import { getCategories } from "../../services/categoryService";
import { getSubcategories } from "../../services/subcategoryService";
import { getSiteSettings } from "../../services/settingsService";
import { getFooterLinks } from "../../services/footerLinkService";
import { useIsGhaziabadVisitor } from "../../hooks/useIsGhaziabadVisitor";

const SOCIAL_ICONS = [
  { key: "facebook", icon: FaFacebookF, label: "Facebook" },
  { key: "instagram", icon: FaInstagram, label: "Instagram" },
  { key: "twitter", icon: FaTwitter, label: "Twitter" },
  { key: "linkedin", icon: FaLinkedinIn, label: "LinkedIn" },
];

// Full delivery-area list — kept out of the top banner (which only has
// room for a short "Vasundhara & 10 km आसपास" summary) and given its own
// scannable spot here instead, where a customer can actually check for
// their specific locality without waiting on a scrolling ticker.
const DELIVERY_AREAS = [
  "Vasundhara",
  "Vaishali",
  "Indirapuram",
  "Kaushambi",
  "Sahibabad",
  "Mohan Nagar",
  "Rajendra Nagar",
  "Lajpat Nagar",
  "Suryanagar",
  "Brij Vihar",
];

function Footer() {
  const isGhaziabad = useIsGhaziabadVisitor();
  const [categories, setCategories] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [settings, setSettings] = useState({});
  const [footerLinks, setFooterLinks] = useState([]);

  useEffect(() => {
    const loadFooterData = async () => {
      const [catRes, subcatRes, settingsRes, linksRes] = await Promise.all([
        getCategories(),
        getSubcategories(),
        getSiteSettings(),
        getFooterLinks(),
      ]);

      if (catRes.success) setCategories(catRes.categories);
      if (subcatRes.success) setSubcategories(subcatRes.subcategories);
      if (settingsRes.success) setSettings(settingsRes.settings);
      if (linksRes.success) setFooterLinks(linksRes.links);
    };

    loadFooterData();
  }, []);

  const activeSocialLinks = SOCIAL_ICONS.filter((s) => settings[s.key]);

  const categoryColumns = categories.map((category) => ({
    category,
    items: subcategories
      .filter((sub) => sub.category?._id === category._id)
      .sort((a, b) => a.displayOrder - b.displayOrder),
  }));

  return (
    <>
      {categoryColumns.length > 0 && (
        <div className="bg-white pt-14 pb-10 px-4 border-t border-slate-100">
          <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-8">
            {categoryColumns.map(({ category, items }) => (
              <div key={category._id}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b border-amber-500/40">
                  {category.name}
                </h3>
                <ul className="space-y-2 text-xs">
                  {items.length > 0 ? (
                    items.map((item) => (
                      <li key={item._id}>
                        <Link
                          to={`/category/${category.slug}/${item.slug}`}
                          className="text-slate-600 hover:text-amber-600 transition-colors"
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li>
                      <Link
                        to={`/category/${category.slug}`}
                        className="text-slate-600 hover:text-amber-600 transition-colors"
                      >
                        Shop All
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <footer className="bg-slate-900 text-slate-300 pt-16 pb-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            <div>
              <h3 className="text-amber-500 font-semibold mb-4">
                Mittal Collections
              </h3>
              <p className="text-sm leading-relaxed mb-4">
                Premium bedsheets, curtains, towels and home furnishing —
                serving Vasundhara, Indirapuram, Vaishali and Ghaziabad.
              </p>

              {settings.address && (
                <p className="text-sm leading-relaxed flex items-start gap-2 mb-2">
                  <FaMapMarkerAlt className="mt-0.5 shrink-0 text-amber-500" />
                  <span>{settings.address}</span>
                </p>
              )}

              {settings.phone && (
                <a
                  href={`tel:${settings.phone}`}
                  className="text-sm flex items-center gap-2 hover:text-white transition-colors"
                >
                  <FaPhoneAlt className="shrink-0 text-amber-500" />
                  {settings.phone}
                </a>
              )}
            </div>

            <div>
              <h3 className="text-amber-500 font-semibold mb-4">Company</h3>
              <ul className="space-y-2 text-sm">
                {footerLinks.map((item) =>
                  item.url.startsWith("http") ? (
                    <li key={item._id}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        {item.label}
                      </a>
                    </li>
                  ) : (
                    <li key={item._id}>
                      <Link
                        to={item.url}
                        className="hover:text-white transition-colors"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-amber-500 font-semibold mb-4">
                Follow Us
              </h3>
              {activeSocialLinks.length > 0 ? (
                <div className="flex gap-3">
                  {activeSocialLinks.map(({ key, icon: Icon, label }) => (
                    <a
                      key={key}
                      href={settings[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="w-9 h-9 rounded-full bg-slate-700 hover:bg-amber-500 flex items-center justify-center transition-colors"
                    >
                      <Icon className="text-sm" />
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Follow links coming soon.
                </p>
              )}
            </div>
          </div>

          <hr className="border-slate-700 my-10" />

          <div id="delivery-areas" className="mb-10 scroll-mt-6">
            {isGhaziabad ? (
              <>
                <h3 className="text-amber-500 font-semibold mb-1">
                  We Deliver To (Ghaziabad)
                </h3>
                <p className="text-sm text-slate-400 mb-1">
                  🚚 FAST DELIVERY within 24 Hours*
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  *Subject to order cutoff time, product availability and
                  exact delivery address within these areas.
                </p>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_AREAS.map((area) => (
                    <span
                      key={area}
                      className="text-xs bg-slate-800 text-slate-300 rounded-full px-3 py-1.5"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-amber-500 font-semibold mb-1">
                  We Deliver Pan-India
                </h3>
                <p className="text-sm text-slate-400">
                  🚚 Usually delivered in 3-7 business days — same-day
                  delivery within 24 Hours in Ghaziabad (Vasundhara, Vaishali,
                  Indirapuram & nearby).
                </p>
              </>
            )}
          </div>

          <hr className="border-slate-700 my-10" />

          <p className="text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Mittal Collections. All Rights
            Reserved.
          </p>
        </div>
      </footer>
    </>
  );
}

export default Footer;
