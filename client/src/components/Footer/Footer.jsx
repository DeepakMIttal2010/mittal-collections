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
import { useLanguage } from "../../context/LanguageContext";
import { DELIVERY_AREAS } from "../../utils/deliveryAreas";
import { useHindiLinks } from "../../utils/hindiPath";
import { friendlyGroupLabel, friendlyGroupLabelHi } from "../../utils/groupLabels";

// Footer column order of subcategory groups; anything else goes last.
const GROUP_ORDER = ["By Type", "Bed Size", "By Brand", "By Material", "By Pattern", "By Design", "Size"];
const groupRank = (label) => (GROUP_ORDER.includes(label) ? GROUP_ORDER.indexOf(label) : GROUP_ORDER.length);

const SOCIAL_ICONS = [
  { key: "facebook", icon: FaFacebookF, label: "Facebook" },
  { key: "instagram", icon: FaInstagram, label: "Instagram" },
  { key: "twitter", icon: FaTwitter, label: "Twitter" },
  { key: "linkedin", icon: FaLinkedinIn, label: "LinkedIn" },
];

function Footer() {
  const isGhaziabad = useIsGhaziabadVisitor();
  const { t } = useLanguage();
  const isHindi = useHindiLinks();
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

  // Grouped like the mega menu (Type, Bed Size, Brand, ...), each group
  // in its own displayOrder. Sorting one flat list by displayOrder mixed
  // every group's 0, 1, 2... together -- "Glace Cotton, Diwan Bed Size,
  // 70 x 90 Inches, 3D Print..." read as a random list.
  const categoryColumns = categories.map((category) => {
    const byGroup = new Map();
    subcategories
      .filter((sub) => sub.category?._id === category._id)
      .forEach((sub) => byGroup.set(sub.groupLabel, [...(byGroup.get(sub.groupLabel) || []), sub]));
    const groups = [...byGroup.entries()]
      .sort(([a], [b]) => groupRank(a) - groupRank(b))
      .map(([label, items]) => ({
        label,
        items: items.sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
      }));
    return { category, groups };
  });

  return (
    <>
      {categoryColumns.length > 0 && (
        <div className="bg-white pt-14 pb-10 px-4 border-t border-slate-100">
          <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-8">
            {categoryColumns.map(({ category, groups }) => (
              <div key={category._id}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 pb-2 border-b border-amber-500/40">
                  {t(category.name, category.nameHi)}
                </h3>
                <ul className="space-y-2 text-xs">
                  {groups.length > 0 ? (
                    groups.map((group) => (
                      <li key={group.label}>
                        {/* group name only when the column has more than one group */}
                        {groups.length > 1 && (
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 mt-3 mb-1.5">
                            {t(friendlyGroupLabel(group.label), friendlyGroupLabelHi(group.label))}
                          </p>
                        )}
                        <ul className="space-y-1.5">
                          {group.items.map((item) => (
                            <li key={item._id}>
                              <Link
                                to={`${isHindi ? "/hi" : ""}/category/${category.slug}/${item.slug}`}
                                className="text-slate-600 hover:text-amber-600 transition-colors"
                              >
                                {t(item.name, item.nameHi)}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))
                  ) : (
                    <li>
                      <Link
                        to={`${isHindi ? "/hi" : ""}/category/${category.slug}`}
                        className="text-slate-600 hover:text-amber-600 transition-colors"
                      >
                        {t("Shop All", "सभी खरीदें")}
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
                {t(
                  "Premium bedsheets, curtains, towels and home furnishing — serving Vasundhara, Indirapuram, Vaishali and Ghaziabad.",
                  "प्रीमियम बेडशीट, कर्टन, टॉवल और होम फर्निशिंग — वसुंधरा, इंदिरापुरम, वैशाली और गाज़ियाबाद में सेवा।",
                )}
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
              <h3 className="text-amber-500 font-semibold mb-4">{t("Company", "कंपनी")}</h3>
              <ul className="space-y-2 text-sm">
                {/* About/Contact/Returns turned out to already be real,
                    working CMS-driven links here (footerLinks below,
                    configured since 2026-07-30) — a hardcoded addition
                    here briefly duplicated them. The earlier "orphaned
                    page" finding was a static-analysis blind spot: a
                    code-only grep can't see database-driven <Link>
                    destinations, only literal strings in source. */}
                {footerLinks.map((item) =>
                  item.url.startsWith("http") ? (
                    <li key={item._id}>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-white transition-colors"
                      >
                        {t(item.label, item.labelHi)}
                      </a>
                    </li>
                  ) : (
                    <li key={item._id}>
                      <Link
                        to={item.url}
                        className="hover:text-white transition-colors"
                      >
                        {t(item.label, item.labelHi)}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div>
              <h3 className="text-amber-500 font-semibold mb-4">
                {t("Follow Us", "हमें फॉलो करें")}
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
                <p className="text-sm text-slate-400">
                  {t("Follow links coming soon.", "फॉलो लिंक जल्द आएंगे।")}
                </p>
              )}
            </div>
          </div>

          <hr className="border-slate-700 my-10" />

          <div id="delivery-areas" className="mb-10 scroll-mt-6">
            {isGhaziabad ? (
              <>
                <h3 className="text-amber-500 font-semibold mb-1">
                  {t("We Deliver To (Ghaziabad)", "हम यहां डिलीवर करते हैं (गाज़ियाबाद)")}
                </h3>
                <p className="text-sm text-slate-400 mb-1">
                  {t("🚚 FAST DELIVERY within 24 Hours*", "🚚 24 घंटे में तेज़ डिलीवरी*")}
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  {t(
                    "*Subject to order cutoff time, product availability and exact delivery address within these areas.",
                    "*ऑर्डर कटऑफ समय, प्रोडक्ट उपलब्धता और इन क्षेत्रों में सटीक डिलीवरी पते के अधीन।",
                  )}
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
                  {t("We Deliver Pan-India", "हम पूरे भारत में डिलीवर करते हैं")}
                </h3>
                <p className="text-sm text-slate-400">
                  {t(
                    "🚚 Usually delivered in 3-7 business days — same-day delivery within 24 Hours in Ghaziabad (Vasundhara, Vaishali, Indirapuram & nearby).",
                    "🚚 आमतौर पर 3-7 कार्य दिवस में डिलीवर — गाज़ियाबाद (वसुंधरा, वैशाली, इंदिरापुरम और आसपास) में 24 घंटे में सेम-डे डिलीवरी।",
                  )}
                </p>
              </>
            )}
            <Link
              to="/ghaziabad-home-furnishing-store"
              className="inline-block text-sm text-amber-500 hover:underline mt-3"
            >
              {t(
                "View our Ghaziabad store details →",
                "हमारे ग़ाज़ियाबाद स्टोर की जानकारी देखें →",
              )}
            </Link>
          </div>

          <hr className="border-slate-700 my-10" />

          <p className="text-center text-sm text-slate-400">
            {t(
              `© ${new Date().getFullYear()} Mittal Collections. All Rights Reserved.`,
              `© ${new Date().getFullYear()} मित्तल कलेक्शंस। सर्वाधिकार सुरक्षित।`,
            )}
          </p>
        </div>
      </footer>
    </>
  );
}

export default Footer;
