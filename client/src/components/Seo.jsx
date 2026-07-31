import { Helmet } from "react-helmet-async";

const SITE_NAME = "Mittal Collections";
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=1200";

function Seo({ title, description, image, url, jsonLd }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:image" content={image || DEFAULT_IMAGE} />
      {url && <meta property="og:url" content={url} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image || DEFAULT_IMAGE} />

      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

export default Seo;
