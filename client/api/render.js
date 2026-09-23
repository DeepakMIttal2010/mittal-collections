// Serves crawlers (Googlebot, WhatsApp, Facebook, Twitter, etc.) a version
// of index.html with the real product/category/article/homepage title,
// description, OG tags and JSON-LD already in place — this is a
// client-side-rendered SPA, so the plain HTML response every bot sees by
// default is just the generic site shell, which is what was showing up in
// Search Console snippets and WhatsApp/Facebook link previews instead of
// the actual page.
//
// Routed here only for known bot user-agents (see vercel.json `has`
// rules); real visitors always get the normal SPA and never touch this
// function.

const SITE_NAME = "Mittal Collections";
const SITE_URL = "https://www.mittalcollections.com";
const API_BASE =
  process.env.VITE_API_URL || "https://mittal-collections-api.onrender.com";
// The homepage hero banner, cropped to the 1200x630 link-preview size —
// mirrors client/src/components/Seo.jsx's own DEFAULT_IMAGE (same asset,
// same reasoning: keep the two in sync since this file is the client-side
// component's server-rendered-for-bots counterpart).
const DEFAULT_IMAGE =
  "https://res.cloudinary.com/y2gghpvz/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_auto/v1788778399/mittal-collections/b7qfxz8qsnqigmpttuyb.jpg";

// Mirrors client/src/utils/deliveryAreas.js — duplicated rather than
// imported since this file avoids pulling in anything from src/ (see
// this file's other constants above, all duplicated the same way).
// Keep both copies in sync.
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

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Mirrors client/src/utils/stripHtml.js's intent (plain text for a meta
// description / JSON-LD description, not markup) but can't reuse that
// file as-is -- it goes through DOMPurify and a real `document`, neither
// of which exist in this serverless function's Node runtime. Loops the
// tag-strip to convergence rather than a single regex pass, for the same
// reason stripHtml.js avoids a single-pass regex (CodeQL: "incomplete
// multi-character sanitization" -- e.g. "<scr<script>ipt>" would
// otherwise reform "<script>" after only one pass).
const stripHtml = (html) => {
  let text = String(html || "")
    .replace(/<\/(p|li|div|h[1-6])>/gi, "</$1> ")
    .replace(/<br\s*\/?>/gi, " ");

  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== previous);

  // &amp; must decode LAST -- decoding it first would double-unescape a
  // literal "&amp;lt;" (an escaped ampersand followed by literal "lt;")
  // into an actual "<" instead of leaving it as the text "&lt;" (CodeQL:
  // "double escaping or unescaping").
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
};

// Mirrors client/src/utils/shipping.js — duplicated for the same reason
// DELIVERY_AREAS above is (this file avoids importing anything from
// src/). Keep both copies in sync.
const calculateDeliveryFee = (subtotal, settings) => {
  const threshold = settings?.freeShippingThreshold ?? 499;

  if (subtotal >= threshold) return 0;

  const tiers = [...(settings?.shippingTiers || [])].sort(
    (a, b) => a.maxOrderValue - b.maxOrderValue,
  );

  const matchedTier = tiers.find((tier) => subtotal < tier.maxOrderValue);

  return matchedTier ? matchedTier.fee : (settings?.deliveryFee ?? 49);
};

const imgUrl = (path) => {
  if (!path) return path;
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
};

// Static pages whose title/description never depend on data — a plain
// copy of each page's own <Seo title=... description=... /> call (see
// About.jsx, Contact.jsx, Rewards.jsx, etc.), kept in sync by hand since
// this serverless function doesn't share a bundle with client/src. None
// of these were reachable through vercel.json's bot `has` rewrites before
// (only /product, /category and /articles were), so a crawler hitting
// any of them got the plain SPA shell — which, worse, carries the
// homepage's own static title/description baked into index.html, so
// Search Console and WhatsApp/Facebook previews showed the HOMEPAGE's
// title for e.g. a shared /gifting or /rewards link instead of the
// page's own.
const STATIC_PAGES = {
  "/about": {
    title:
      "About Mittal Collections — Home Furnishing Store",
    description:
      "Mittal Collections is a home furnishing store offering premium bedsheets, towels, curtains, cushions and doormats with pan-India delivery — quality materials, fast 24-hour delivery in Ghaziabad, and easy returns.",
    breadcrumb: "About",
  },
  "/contact": {
    title: "Contact Us",
    description:
      "Get in touch with Mittal Collections for order support, returns, bulk orders or general questions about our home furnishing products.",
    breadcrumb: "Contact Us",
  },
  "/rewards": {
    title: "Rewards Program — Earn While You Shop",
    description:
      "How Mittal Collections' rewards program works: welcome offer, loyalty points, referrals and review bonuses.",
    breadcrumb: "Rewards",
  },
  "/trending": {
    title: "Top Trending Home Furnishing Products",
    description:
      "Handpicked by our team - the home furnishing pieces everyone's loving right now at Mittal Collections, organised by category.",
    breadcrumb: "Top Trending",
  },
  "/clearance-sale": {
    title: "Clearance Sale — Home Furnishing Deals",
    description:
      "More than 35% off select home furnishing items at Mittal Collections — limited stock, won't be restocked at this price.",
    breadcrumb: "Clearance Sale",
  },
  "/new-arrivals": {
    title: "New Arrivals — Home Furnishing",
    description:
      "The newest home furnishing pieces at Mittal Collections, organised by category - bedsheets, cushion covers, doormats and more.",
    breadcrumb: "New Arrivals",
  },
  "/gifting": {
    title: "Gifting — Home Furnishing Gift Ideas",
    description:
      "Ready-to-gift home furnishing picks at Mittal Collections — housewarmings, weddings and festive occasions, no separate wrapping needed.",
    breadcrumb: "Gifting",
  },
  "/curtain-size-calculator": {
    title: "Curtain Size & Rod Length Calculator (in Inches)",
    description:
      "Free curtain size calculator — enter your window measurements and instantly get the rod length, fabric width and curtain length to buy, plus a size chart.",
    breadcrumb: "Curtain Size Calculator",
  },
  "/articles": {
    title: "Guides & Ideas",
    description:
      "Home furnishing guides, buying tips and styling ideas from Mittal Collections — bedsheets, curtains, towels and more.",
    breadcrumb: "Guides & Ideas",
    lang: "en",
  },
  "/hi/articles": {
    title: "गाइड और आइडिया",
    description:
      "मित्तल कलेक्शंस से घर की साज-सज्जा की गाइड, खरीदारी के सुझाव और सजावट के आइडिया — चादर, पर्दे, तौलिए और भी बहुत कुछ।",
    breadcrumb: "गाइड और आइडिया",
    lang: "hi",
  },
};

// Mirrors client/src/utils/breadcrumbJsonLd.js — kept as its own plain copy
// here since this serverless function doesn't share a bundle with client/src.
const buildBreadcrumbJsonLd = (items) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: item.name,
    ...(item.path && { item: `${SITE_URL}${item.path}` }),
  })),
});

const buildMeta = async (path) => {
  const parts = path.split("/").filter(Boolean);

  if (parts.length === 0) {
    // Homepage — mirrors Home.jsx's <Seo> call and HomeGoodsStore schema.
    // A bare "/" is unreachable through vercel.json's `rewrites` no matter
    // the bot user-agent `has` condition — Vercel serves the static
    // index.html straight from its filesystem/edge cache for an exact "/"
    // match, ahead of `rewrites` (/category and /articles don't have this
    // problem since no static file exists at those paths to collide with).
    // /client/middleware.js is what actually routes a bot's "/" request
    // here now, since Edge Middleware runs ahead of that static-file
    // lookup — this branch is what it lands on.
    const settingsData = await fetch(`${API_BASE}/api/settings`).then((r) =>
      r.json(),
    );
    const settings = settingsData.settings || {};

    // Base fields unconditional, same reasoning as Home.jsx's
    // baseOrganizationJsonLd — never depends on settings.address, so a
    // bot never sees zero structured data on the homepage just because
    // that admin field is unset. sameAs added once settings resolve,
    // matching Home.jsx's organizationJsonLd exactly.
    const socialSameAs = [
      settings.facebook,
      settings.instagram,
      settings.twitter,
    ].filter(Boolean);
    const organizationJsonLd = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      ...(socialSameAs.length > 0 && { sameAs: socialSameAs }),
    };
    const websiteJsonLd = {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      // Mirrors Home.jsx's websiteJsonLd — this was previously only
      // added client-side, so Googlebot (routed here for every request,
      // never reaching the real React app) never saw the Sitelinks
      // Searchbox markup at all.
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/search?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    };

    const localBusinessJsonLd = settings.address
      ? {
          "@context": "https://schema.org",
          "@type": "HomeGoodsStore",
          "@id": `${SITE_URL}/#business`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          telephone: settings.phone || undefined,
          priceRange: "₹₹",
          address: {
            "@type": "PostalAddress",
            streetAddress: settings.address,
            addressLocality: "Ghaziabad",
            addressRegion: "Uttar Pradesh",
            addressCountry: "IN",
          },
          areaServed: [
            ...DELIVERY_AREAS.map((area) => ({
              "@type": "Place",
              name: `${area}, Ghaziabad`,
            })),
            { "@type": "City", name: "Ghaziabad" },
          ],
          sameAs: [settings.facebook, settings.instagram, settings.twitter].filter(
            Boolean,
          ),
        }
      : null;

    return {
      title: `Buy Bedsheets, Curtains & Towels — Pan-India Delivery | ${SITE_NAME}`,
      description:
        "Shop premium cotton bedsheets, curtains, towels, cushions & doormats online with pan-India delivery — fast 24-hour delivery in Ghaziabad. Easy returns.",
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}/`,
      ogType: "website",
      jsonLd: [organizationJsonLd, websiteJsonLd, localBusinessJsonLd].filter(Boolean),
    };
  }

  if (parts[0] === "product" && parts[1]) {
    // Fetched together — none depend on each other, and ProductDetails.jsx
    // loads all four independently too (reviews/questions/settings never
    // block the product itself from rendering).
    const [data, settingsData, reviewsData, questionsData] = await Promise.all([
      fetch(`${API_BASE}/api/products/${parts[1]}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/settings`).then((r) => r.json()),
      fetch(`${API_BASE}/api/reviews/product/${parts[1]}`).then((r) => r.json()),
      fetch(`${API_BASE}/api/questions/product/${parts[1]}`).then((r) => r.json()),
    ]);

    if (!data.success) return null;

    const p = data.product;
    const settings = settingsData.settings || {};
    const plainDescription = stripHtml(p.description);
    // Same "pan-India delivery" lead-in ProductDetails.jsx's <Seo> uses —
    // this bot-facing copy had drifted from that client-side convention.
    const description = p.description
      ? `Buy online, pan-India delivery (24hr in Ghaziabad) - ${plainDescription}`.slice(0, 160)
      : `Buy ${p.name} online with pan-India delivery - fast 24-hour delivery in Ghaziabad`.slice(0, 160);
    // Google's Product rich-result guidance wants multiple angles when
    // they exist, not just the main photo — mirrors ProductDetails.jsx's
    // productImages fallback (full gallery, or the single main image when
    // no gallery array is set).
    const galleryImages = (p.images?.length ? p.images : [p.image])
      .filter(Boolean)
      .map(imgUrl);
    const image = galleryImages[0] || DEFAULT_IMAGE;
    // Self-heal to the product's *current* slug rather than echoing back
    // whatever slug the request happened to use — otherwise a renamed
    // product's stale URL (still reachable, since only the id is looked
    // up) canonicalizes to itself instead of the real current URL, which
    // is exactly what produced Search Console's "Duplicate without
    // user-selected canonical" for these pages. Matches the client-side
    // productUrl() helper's own self-healing behaviour.
    const currentSlug = p.slug || parts[2] || "";
    const canonicalPath = currentSlug
      ? `/product/${p._id}/${currentSlug}`
      : `/product/${p._id}`;
    const url = `${SITE_URL}${canonicalPath}`;

    // Mirrors ProductDetails.jsx's breadcrumbItemsForSeo — a subcategory
    // segment used to be dropped here, giving bots a shorter breadcrumb
    // than the one the site itself defines for the same product.
    const breadcrumbItems = [
      { name: "Home", path: "/" },
      ...(p.category
        ? [{ name: p.category.name, path: `/category/${p.category.slug}` }]
        : []),
      ...(p.subcategories?.[0] && p.category
        ? [
            {
              name: p.subcategories[0].name,
              path: `/category/${p.category.slug}/${p.subcategories[0].slug}`,
            },
          ]
        : []),
      { name: p.name },
    ];

    // Mirrors ProductDetails.jsx's seoTitle — search queries for this
    // category routinely include the exact dimension.
    const seoTitle = p.size ? `${p.name} — ${p.size}` : p.name;

    // Mirrors ProductDetails.jsx's effectiveReturnDaysForSeo/shippingFeeForSeo
    // — these unlock the enhanced free-listing treatment in Google
    // Shopping/Search (shipping cost + delivery time, return window shown
    // directly on the listing), built from the same settings/return-policy
    // data the checkout page already uses.
    const effectiveReturnDays = p.returnPeriodDays || settings.defaultReturnPeriodDays;
    const shippingFee = calculateDeliveryFee(p.price, settings);

    const reviews = reviewsData.success ? reviewsData.reviews || [] : [];
    const totalReviews = reviewsData.success ? reviewsData.totalReviews || 0 : 0;
    const averageRating = reviewsData.success ? reviewsData.averageRating || 0 : 0;
    const questions = questionsData.success ? questionsData.questions || [] : [];

    const productJsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: plainDescription,
      image: galleryImages,
      brand: { "@type": "Brand", name: SITE_NAME },
      offers: {
        "@type": "Offer",
        priceCurrency: "INR",
        price: p.price,
        availability:
          p.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        url,
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: {
            "@type": "MonetaryAmount",
            value: shippingFee,
            currency: "INR",
          },
          shippingDestination: {
            "@type": "DefinedRegion",
            addressCountry: "IN",
          },
          // Matches the "Usually delivered in 3-7 business days" promise
          // shown elsewhere on the site (Footer, delivery-info banners) —
          // same-day Ghaziabad express delivery is a separate Google
          // Merchant Center delivery policy, not this one.
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: {
              "@type": "QuantitativeValue",
              minValue: 0,
              maxValue: 0,
              unitCode: "DAY",
            },
            transitTime: {
              "@type": "QuantitativeValue",
              minValue: 3,
              maxValue: 7,
              unitCode: "DAY",
            },
          },
        },
        hasMerchantReturnPolicy: p.isReturnable
          ? {
              "@type": "MerchantReturnPolicy",
              applicableCountry: "IN",
              returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
              merchantReturnDays: effectiveReturnDays,
              returnFees: "https://schema.org/FreeReturn",
            }
          : {
              "@type": "MerchantReturnPolicy",
              applicableCountry: "IN",
              returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
            },
      },
      ...(totalReviews > 0 && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: averageRating.toFixed(1),
          reviewCount: totalReviews,
        },
      }),
      ...(reviews.length > 0 && {
        review: reviews.slice(0, 10).map((r) => ({
          "@type": "Review",
          author: { "@type": "Person", name: r.user?.name || "Customer" },
          reviewRating: {
            "@type": "Rating",
            ratingValue: r.rating,
            bestRating: 5,
            worstRating: 1,
          },
          reviewBody: r.content,
          datePublished: r.createdAt,
          ...(r.images?.length > 0 && { image: r.images }),
        })),
      }),
    };

    // Standalone VideoObject, not nested in productJsonLd — `video` isn't
    // a valid schema.org property on Product (see ProductDetails.jsx's
    // own comment on this, a self-caught bug from an earlier round).
    const videoJsonLd = (p.videos || []).map((videoUrl) => ({
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: p.name,
      description: plainDescription,
      thumbnailUrl: imgUrl(p.image),
      contentUrl: videoUrl,
      uploadDate: p.createdAt,
    }));

    const faqJsonLd = questions.length > 0 && {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((q) => ({
        "@type": "Question",
        name: q.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: q.answer,
        },
      })),
    };

    return {
      title: `${seoTitle} | ${SITE_NAME}`,
      description,
      image,
      url,
      ogType: "product",
      jsonLd: [
        productJsonLd,
        buildBreadcrumbJsonLd(breadcrumbItems),
        faqJsonLd,
        ...videoJsonLd,
      ].filter(Boolean),
    };
  }

  if (parts[0] === "category" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/categories`).then((r) =>
      r.json(),
    );

    if (!data.success) return null;

    const category = data.categories?.find((c) => c.slug === parts[1]);
    if (!category) return null;

    // `path` is already trailing-slash-normalized by the caller, so this
    // stays clean instead of picking up the stray "/" that vercel.json's
    // "/category/:slug/:subslug*" rewrite destination leaves behind when
    // there's no subcategory segment.
    const url = `${SITE_URL}${path}`;

    // A subcategory segment (e.g. /category/bedsheets/fitted-bedsheet)
    // used to be silently dropped here — every subcategory page under a
    // given category rendered the exact same title/description as the
    // parent category page itself, which is a textbook duplicate-content
    // signal to Google (confirmed via a live fetch: /category/bedsheets
    // and /category/bedsheets/fitted-bedsheet returned byte-identical
    // title and description). Look the subcategory up the same way
    // CategoryPage.jsx does client-side and fold its name into both.
    let subcategory = null;
    if (parts[2]) {
      const subRes = await fetch(`${API_BASE}/api/subcategories`).then((r) =>
        r.json(),
      );
      subcategory = subRes.subcategories?.find(
        (s) => s.category?._id === category._id && s.slug === parts[2],
      );
      // A subcategory slug that doesn't resolve is the same "genuinely
      // doesn't exist" case product/article already 404 on below.
      if (!subcategory) return null;
    }

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      ...(subcategory
        ? [{ name: category.name, path: `/category/${category.slug}` }]
        : []),
      { name: subcategory ? subcategory.name : category.name },
    ];

    // Same "pan-India delivery" lead-in CategoryPage.jsx's <Seo> uses,
    // extended with the subcategory's own name so it isn't just the
    // parent category's copy repeated verbatim.
    const title = subcategory
      ? `${subcategory.name} | ${category.name} | ${SITE_NAME}`
      : `${category.name} | ${SITE_NAME}`;
    const description = subcategory
      ? `Buy ${subcategory.name} (${category.name}) online with pan-India delivery at ${SITE_NAME} - fast 24-hour delivery in Ghaziabad.`
      : `Buy ${category.name} online with pan-India delivery at ${SITE_NAME} - fast 24-hour delivery in Ghaziabad. ${category.description || ""}`
          .trim()
          .slice(0, 160);

    return {
      title,
      description,
      image: imgUrl(category.image) || DEFAULT_IMAGE,
      url,
      ogType: "website",
      jsonLd: buildBreadcrumbJsonLd(breadcrumbItems),
    };
  }

  if (parts[0] === "policies" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/pages/${parts[1]}`).then((r) =>
      r.json(),
    );

    if (!data.success || !data.page) return null;

    const page = data.page;
    const url = `${SITE_URL}/policies/${parts[1]}`;

    return {
      title: page.title,
      description: (page.content || page.title).slice(0, 160),
      image: DEFAULT_IMAGE,
      url,
      ogType: "website",
      jsonLd: buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: page.title },
      ]),
    };
  }

  if (path === "/contact") {
    // Contact.jsx's client-side render carries a HomeGoodsStore/@id
    // sameAs-homepage JSON-LD block (added after an earlier audit found
    // this page's own address/phone data was fetched and displayed but
    // never structured) -- this STATIC_PAGES entry never got that same
    // treatment, so a bot hitting /contact (routed here, never to the
    // real React app) saw only a breadcrumb, no business schema at all.
    // Mirrors Contact.jsx's exact shape, not Home.jsx's (no priceRange/
    // areaServed there -- those are homepage-specific, not per Contact.jsx).
    const staticPage = STATIC_PAGES["/contact"];
    const settingsData = await fetch(`${API_BASE}/api/settings`).then((r) =>
      r.json(),
    );
    const settings = settingsData.settings || {};

    const localBusinessJsonLd = settings.address
      ? {
          "@context": "https://schema.org",
          "@type": "HomeGoodsStore",
          "@id": `${SITE_URL}/#business`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          telephone: settings.phone || undefined,
          email: settings.email || undefined,
          address: {
            "@type": "PostalAddress",
            streetAddress: settings.address,
            addressLocality: "Ghaziabad",
            addressRegion: "Uttar Pradesh",
            addressCountry: "IN",
          },
          sameAs: [settings.facebook, settings.instagram, settings.twitter].filter(
            Boolean,
          ),
        }
      : null;

    return {
      title: staticPage.title,
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      jsonLd: [
        buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: staticPage.breadcrumb }]),
        localBusinessJsonLd,
      ].filter(Boolean),
    };
  }

  if (STATIC_PAGES[path]) {
    const staticPage = STATIC_PAGES[path];

    return {
      title: staticPage.title,
      description: staticPage.description,
      image: DEFAULT_IMAGE,
      url: `${SITE_URL}${path}`,
      ogType: "website",
      lang: staticPage.lang,
      jsonLd: buildBreadcrumbJsonLd([
        { name: "Home", path: "/" },
        { name: staticPage.breadcrumb },
      ]),
    };
  }

  if (parts[0] === "articles" && parts[1]) {
    const data = await fetch(`${API_BASE}/api/articles/slug/${parts[1]}`).then(
      (r) => r.json(),
    );

    if (!data.success) return null;

    const article = data.article;
    const image = article.coverImage ? imgUrl(article.coverImage) : DEFAULT_IMAGE;
    const url = `${SITE_URL}/articles/${article.slug}`;
    const hasHindi = Boolean(article.titleHi);
    const hiUrl = `${SITE_URL}/hi/articles/${article.slug}`;

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      { name: "Guides & Ideas", path: "/articles" },
      { name: article.title },
    ];

    return {
      title: `${article.title} | ${SITE_NAME}`,
      description: (article.excerpt || article.title).slice(0, 160),
      image,
      url,
      ogType: "article",
      lang: "en",
      // Only advertised once a Hindi version actually exists — otherwise
      // this would hreflang-link to a URL that just redirects right back.
      alternateLangs: hasHindi
        ? [
            { lang: "en", url },
            { lang: "hi", url: hiUrl },
            { lang: "x-default", url },
          ]
        : undefined,
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          image: article.coverImage ? imgUrl(article.coverImage) : undefined,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "en",
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
    };
  }

  if (parts[0] === "hi" && parts[1] === "articles" && parts[2]) {
    const data = await fetch(`${API_BASE}/api/articles/slug/${parts[2]}`).then(
      (r) => r.json(),
    );

    if (!data.success) return null;

    const article = data.article;
    const enUrl = `${SITE_URL}/articles/${article.slug}`;

    // No Hindi content authored for this article — same rule the client
    // route enforces (see ArticleDetail.jsx): a /hi/ URL only exists once
    // there's real Hindi content to serve there, otherwise redirect a
    // crawler straight to the real (English) page instead of a 404 or a
    // soft-404-looking English-under-a-Hindi-URL page.
    if (!article.titleHi) {
      return { redirect: enUrl };
    }

    const image = article.coverImage ? imgUrl(article.coverImage) : DEFAULT_IMAGE;
    const hiUrl = `${SITE_URL}/hi/articles/${article.slug}`;

    const breadcrumbItems = [
      { name: "Home", path: "/" },
      { name: "गाइड और आइडिया", path: "/hi/articles" },
      { name: article.titleHi },
    ];

    return {
      title: `${article.titleHi} | ${SITE_NAME}`,
      description: (article.excerptHi || article.excerpt || article.titleHi).slice(0, 160),
      image,
      url: hiUrl,
      ogType: "article",
      lang: "hi",
      alternateLangs: [
        { lang: "en", url: enUrl },
        { lang: "hi", url: hiUrl },
        { lang: "x-default", url: enUrl },
      ],
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.titleHi,
          description: article.excerptHi || article.excerpt,
          image: article.coverImage ? imgUrl(article.coverImage) : undefined,
          datePublished: article.createdAt,
          dateModified: article.updatedAt,
          inLanguage: "hi",
          author: { "@type": "Organization", name: SITE_NAME },
          publisher: { "@type": "Organization", name: SITE_NAME },
        },
        buildBreadcrumbJsonLd(breadcrumbItems),
      ],
    };
  }

  return null;
};

const injectMeta = (html, meta) => {
  const tags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <meta property="og:type" content="${meta.ogType}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${escapeHtml(meta.image)}" />
    <meta property="og:url" content="${escapeHtml(meta.url)}" />
    <link rel="canonical" href="${escapeHtml(meta.url)}" />
    ${
      meta.alternateLangs
        ? meta.alternateLangs
            .map(
              ({ lang, url }) =>
                `<link rel="alternate" hreflang="${escapeHtml(lang)}" href="${escapeHtml(url)}" />`,
            )
            .join("\n    ")
        : ""
    }
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${escapeHtml(meta.image)}" />
    ${meta.jsonLd ? `<script type="application/ld+json">${JSON.stringify(meta.jsonLd)}</script>` : ""}
  `;

  let result = html
    .replace(/<title>.*?<\/title>/i, "")
    .replace(/<meta name="description"[^>]*>/i, "")
    .replace("</head>", `${tags}\n  </head>`);

  if (meta.lang) {
    result = result.replace(/<html([^>]*)>/i, (fullMatch, attrs) => {
      const withoutLang = attrs.replace(/\s*lang="[^"]*"/i, "");
      return `<html${withoutLang} lang="${escapeHtml(meta.lang)}">`;
    });
  }

  return result;
};

export default async function handler(req, res) {
  const rawPath = (req.query.path || "/").toString();
  // vercel.json's category rewrite destination ("/category/:slug/:subslug*")
  // leaves a literal trailing "/" when there's no subcategory segment —
  // strip it here (once, for every branch) rather than patching each
  // consumer, so a stray slash never leaks into a canonical URL again.
  const path =
    rawPath.length > 1 ? rawPath.replace(/\/+$/, "") : rawPath;

  const origin = `https://${req.headers.host}`;
  const shellHtml = await fetch(`${origin}/index.html`).then((r) => r.text());

  try {
    const meta = await buildMeta(path);

    res.setHeader("Content-Type", "text/html; charset=utf-8");

    // A /hi/articles/:slug for an article with no Hindi content yet —
    // send the crawler straight to the real (English) page with a real
    // 301, the same outcome the client route reaches via <Navigate>.
    if (meta?.redirect) {
      res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
      res.redirect(301, meta.redirect);
      return;
    }

    if (!meta) {
      // A confidently-resolved "doesn't exist" (product/category/article
      // genuinely not found via the API, not a network hiccup — see catch
      // below) must say so with a real 404, not 200. Google was treating
      // the 200-with-generic-shell response as a "Soft 404": it looked
      // like a valid page with no distinguishing content, instead of a
      // clear signal to drop it from the index. Short cache so a
      // since-restored page isn't stuck behind a stale 404 for long.
      res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300");
      res.status(404).send(shellHtml);
      return;
    }

    res.setHeader(
      "Cache-Control",
      "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    );
    res.status(200).send(injectMeta(shellHtml, meta));
  } catch (error) {
    console.error("Bot prerender error:", error);

    // Fail open — a plain SPA shell is still a valid page, just without
    // the enriched meta tags this function exists to add.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(shellHtml);
  }
}
