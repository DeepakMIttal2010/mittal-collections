import { Helmet } from "react-helmet-async";

const SITE_NAME = "Mittal Collections";
// The homepage hero banner (styled bedroom scene) — same asset Hero.jsx
// already shows, just cropped to the 1200x630 (1.91:1) size social
// platforms expect for a link-preview image, via a Cloudinary URL
// transform rather than a separately uploaded file. Replaces an earlier
// placeholder doormat photo picked 2026-08-31 as a stand-in for the
// generic stock photo this used to be.
const DEFAULT_IMAGE =
  "https://res.cloudinary.com/y2gghpvz/image/upload/w_1200,h_630,c_fill,g_auto,q_auto,f_auto/v1788778399/mittal-collections/b7qfxz8qsnqigmpttuyb.jpg";

// alternateLangs: [{ lang: "en"|"hi"|"x-default", url }] — a page that
// exists in more than one language links to every version (itself
// included) so Google can treat them as translations of each other
// rather than as duplicate/competing content. Omit entirely for a page
// with only one language.
function Seo({
  title,
  description,
  image,
  url,
  jsonLd,
  noindex = false,
  lang,
  alternateLangs,
}) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

  return (
    <Helmet>
      {lang && <html lang={lang} />}
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={image || DEFAULT_IMAGE} />
      {url && <meta property="og:url" content={url} />}
      {url && <link rel="canonical" href={url} />}
      {alternateLangs?.map(({ lang: altLang, url: altUrl }) => (
        <link key={altLang} rel="alternate" hreflang={altLang} href={altUrl} />
      ))}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image || DEFAULT_IMAGE} />

      {jsonLd &&
        (Array.isArray(jsonLd) ? jsonLd : [jsonLd])
          .filter(Boolean)
          .map((block, i) => (
            <script key={i} type="application/ld+json">
              {JSON.stringify(block)}
            </script>
          ))}
    </Helmet>
  );
}

export default Seo;
