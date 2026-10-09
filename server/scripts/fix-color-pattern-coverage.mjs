// One-off fix (2026-10-09), found by the Merchant Center feed re-check: color/pattern
// coverage in the Google Shopping feed (server/controllers/feedController.js) is 100%
// missing for Cushion Covers (0/18), Cushions (0/3), Table Runners (0/8), Towels (0/8),
// and partially missing for Doormats (13/22), Table Covers (21/26), Mattress Covers (5/7).
// This is scope the 2026-09-16 color/pattern fix never reached -- that pass only covered
// "Sheets"-flagged products. The feed itself just reflects whatever's in product.color /
// product.pattern -- this is a data-population gap, not a feed-code bug.
//
// Values below were read directly from each product's own name/description (the same kind
// of inference the 2026-09-16 Sheets fix did), confirmed live against
// GET /api/products?limit=500 on 2026-10-09. Where a product's name/description didn't
// state a single clear color (genuinely multi-colour, "assorted", or two colors given as
// an undifferentiated pair with no title signal), color is left blank on purpose -- see
// the `note` field -- rather than guessing. Pattern is set independently whenever the
// text was clear about it, even for the 6 color-ambiguous products.
//
// Counts re-confirmed exactly matching the round-21 Merchant Center numbers:
//   Cushion Covers 18/18 missing, Cushions 3/3, Table Runners 8/8, Towels 8/8,
//   Doormats 13/22, Table Covers 21/26, Mattress Covers 5/7 -- 76 products total.
import {
  getProductAdmin,
  buildProductUpdateFormData,
  updateProduct,
} from "./lib/adminProductApi.mjs";

const BASE = "https://mittal-collections-api.onrender.com/api";
const TOKEN = process.env.ADMIN_TOKEN;
if (!TOKEN) {
  console.error("Set ADMIN_TOKEN env var first.");
  process.exit(1);
}

// color/pattern: "" means intentionally left blank (ambiguous/multi-colour/assorted in
// the product's own text) -- see `note`. The update loop below skips sending a field
// when its value here is "", so an intentionally-blank value is a true no-op, not a wipe.
const FIXES = [
  // ---- Cushion Covers (18/18 missing) ----
  { id: "6a853ad8b30bfcbfe6392bf2", name: "Slate Blue Wavy Ikat Cushion Covers 16x16 Inches - Set of 5", color: "Slate Blue", pattern: "Ikat" },
  { id: "6a853a41b30bfcbfe6392be9", name: "Multicolour Velvet Cushion Covers with Contrast Piping 16x16 Inches - Set of 5", color: "Multicolour", pattern: "Solid" },
  { id: "6a853963b30bfcbfe6392be0", name: "Taupe Silver Starburst Jacquard Cushion Covers 16x16 Inches - Set of 5", color: "Taupe Silver", pattern: "Starburst" },
  { id: "6a853114b30bfcbfe63929a2", name: "Ivory Rajasthani Folk Art Cushion Covers 16x16 Inches - Set of 5", color: "Ivory", pattern: "Folk Art" },
  { id: "6a8430c07aea5465c62b572b", name: "Teal Blue Geometric Dot Cushion Covers 16x16 Inches - Set of 5", color: "Teal Blue", pattern: "Geometric Dot" },
  { id: "6a842e7ed4f476309123f0de", name: "Ivory Blush Vintage Scroll Border Cushion Covers 16x16 Inches - Set of 5", color: "Ivory Blush", pattern: "Scroll Border" },
  { id: "6a8425a4d4f476309123eea8", name: "Grey Watercolor Daisy Print Cushion Covers 16x16 Inches - Set of 5", color: "Grey", pattern: "Watercolor Daisy" },
  { id: "6a842399d4f476309123ede3", name: "Cream Botanical Bird Print Cushion Covers 16x16 Inches - Set of 5", color: "Cream", pattern: "Botanical Bird" },
  { id: "6a7fba7b04df526d796e13ec", name: "Rose Pink Butterfly Print Cushion Covers 16x16 Inches - Set of 5", color: "Rose Pink", pattern: "Butterfly" },
  { id: "6a7fba4604df526d796e13eb", name: "Dusty Mauve Floral Border Cushion Covers 16x16 Inches - Set of 5", color: "Dusty Mauve", pattern: "Floral Border" },
  { id: "6a7f43d78d3b25976f063153", name: "Dusty Mauve Floral Cushion Covers 16x16 Inches - Set of 5", color: "Dusty Mauve", pattern: "Floral" },
  { id: "6a7db6dd350e3eabfa9f5482", name: "Maroon Embossed Velvet Cushion Covers 16x16 Inches - Set of 5", color: "Maroon", pattern: "Damask" },
  { id: "6a7db5c7350e3eabfa9f5481", name: "Golden Yellow Damask Jacquard Cushion Covers 16x16 Inches - Set of 5", color: "Golden Yellow", pattern: "Damask" },
  { id: "6a7db251350e3eabfa9f5478", name: "Silver Grey Feather Foil Velvet Cushion Covers 16x16 Inches - Set of 5", color: "Silver Grey", pattern: "Feather" },
  { id: "6a7db0e6350e3eabfa9f5476", name: "Olive Bronze Blossom Print Cushion Covers 16x16 Inches - Set of 5", color: "Olive Bronze", pattern: "Blossom" },
  { id: "6a7db02f350e3eabfa9f5441", name: "Champagne Damask Jacquard Cushion Covers 16x16 Inches - Set of 5", color: "Champagne", pattern: "Damask" },
  { id: "6a7daf25350e3eabfa9f5418", name: "Ivory Gold Diamond Jacquard Cushion Covers 16x16 Inches - Set of 5", color: "Ivory Gold", pattern: "Diamond" },
  { id: "6a7da7f9350e3eabfa9f5387", name: "Ice Blue Diamond Jacquard Cushion Covers 16x16 Inches - Set of 5", color: "Ice Blue", pattern: "Diamond" },

  // ---- Cushions (3/3 missing) ----
  { id: "6a86fb5ec73ee3c5b6d60800", name: "White Pinstripe Cotton Filled Cushion 24x24 Inches", color: "White", pattern: "Pinstripe" },
  { id: "6a86fb52c73ee3c5b6d607ff", name: "White Pinstripe Cotton Filled Cushion 12x12 Inches - Set of 5", color: "White", pattern: "Pinstripe" },
  { id: "6a86fb47c73ee3c5b6d607fe", name: "White Pinstripe Cotton Filled Cushion 16x16 Inches - Set of 5", color: "White", pattern: "Pinstripe" },

  // ---- Table Runners (8/8 missing) ----
  { id: "6a9be8721ca8d07d4d3ee9fb", name: "Central Table Runner 13x36 Inches - Floral Cotton Patchwork", color: "Cream", pattern: "Floral Patchwork" },
  { id: "6a9be86a1ca8d07d4d3ee9fa", name: "Central Table Runner 13x36 Inches - Maroon Velvet Sequin with Tassel", color: "Maroon", pattern: "Sequin" },
  { id: "6a9be8641ca8d07d4d3ee9f9", name: "Central Table Runner 13x36 Inches - Bronze Velvet Cutwork", color: "Bronze", pattern: "Cutwork" },
  { id: "6a9be85e1ca8d07d4d3ee9f8", name: "Central Table Runner 13x36 Inches - Cream Crochet Lace", color: "Cream", pattern: "Crochet Lace" },
  { id: "6a9bc78d1f4b429e453e33ad", name: "Jacquard Dining Table Runner 13x72 Inches - Blue Paisley Damask", color: "Blue", pattern: "Paisley Damask" },
  { id: "6a9bc7861f4b429e453e33ac", name: "Jacquard Dining Table Runner 13x72 Inches - Golden Brown Hexagon Print", color: "Golden Brown", pattern: "Hexagon Print" },
  { id: "6a9bc77f1f4b429e453e33ab", name: "Jacquard Dining Table Runner 13x72 Inches - Maroon Hexagon Print", color: "Maroon", pattern: "Hexagon Print" },
  { id: "6a9bc7751f4b429e453e33aa", name: "Jacquard Dining Table Runner 13x72 Inches - Beige Textured Weave", color: "Beige", pattern: "Solid" },

  // ---- Towels (8/8 missing) ----
  // "Assorted Colours" is stated literally in the name/description -- genuinely not a
  // single color, so left blank rather than guessed.
  { id: "6a9fe1c479896b2a3e14dbf0", name: "SANVI Microfiber Cleaning Glove - Assorted Colours", color: "", pattern: "", note: "name+desc literally say 'Assorted Colours' / 'Colour sent may vary based on stock' -- genuinely not a single color" },
  { id: "6a9fe1c179896b2a3e14dbef", name: "myTrident Home Essential Cotton Bath Towel - Royal Purple, 75 x 150 cm", color: "Royal Purple", pattern: "Solid" },
  { id: "6a9fe1b879896b2a3e14dbee", name: "myTrident Home Essential Cotton Bath Towel - Red Wine, 75 x 150 cm", color: "Red Wine", pattern: "Solid" },
  { id: "6a85914667407e1e8c6345d4", name: "Big Shaktiman Checkered Madrasi Cotton Towel 30x60 Inches", color: "Red White", pattern: "Checkered" },
  // No color word anywhere in name or full description (only a black edge BINDING is
  // mentioned, not the towel's own color) -- left blank rather than guessed.
  { id: "6a858f0667407e1e8c6344e8", name: "Microfiber Cleaning Towel 12x16 Inches", color: "", pattern: "", note: "no color stated anywhere in name/description; only the edge binding color (black) is mentioned, not the towel itself" },
  // No color word anywhere in name or full description either (unlike the other Madrasi
  // towels in this family, which all state a color) -- left blank rather than guessed.
  { id: "6a858bef67407e1e8c6343d8", name: "Amar Fabrix Checkered Madrasi Cotton Towel 30x60 Inches", color: "", pattern: "Checkered", note: "no color stated anywhere in name/description, unlike its sibling Madrasi towels" },
  { id: "6a858b4d67407e1e8c6343cf", name: "Five Star Checkered Madrasi Cotton Towel 30x60 Inches", color: "Magenta White", pattern: "Checkered" },
  { id: "6a8583a5c31d4f8d51d40e2b", name: "Pink Checkered Madrasi Cotton Towel 30x60 Inches", color: "Pink", pattern: "Checkered" },

  // ---- Doormats (13/22 missing) ----
  { id: "6a7af3e2edd1e432f423e4aa", name: "Rust Orange Cotton Large Doormat 21x31 Inches", color: "Rust Orange", pattern: "Solid" },
  { id: "6a7af2ddedd1e432f423e4a8", name: "Navy Cotton Large Doormat 21x31 Inches", color: "Navy", pattern: "Solid" },
  { id: "6a7af05aedd1e432f423e444", name: "Maroon Cotton Large Doormat 21x31 Inches", color: "Maroon", pattern: "Solid" },
  { id: "6a719480989377fbd58a0585", name: "Antique Striped Cotton Doormat 15x24 Inches - Maroon", color: "Maroon", pattern: "Striped" },
  { id: "6a7191d231d6613e599ba40a", name: "Multicolour Striped Cotton Doormat 15x24 Inches - Blue Grey", color: "Blue Grey", pattern: "Striped" },
  { id: "6a7191d031d6613e599ba409", name: "Multicolour Striped Cotton Doormat 15x24 Inches - Coral Purple", color: "Coral Purple", pattern: "Striped" },
  { id: "6a7191ce31d6613e599ba408", name: "Multicolour Striped Cotton Doormat 16x24 Inches - Brown", color: "Brown", pattern: "Striped" },
  { id: "6a7191cc31d6613e599ba407", name: "Double Colour Cotton Doormat 16x24 Inches - Rust", color: "Rust", pattern: "Colour Block" },
  { id: "6a7191ca31d6613e599ba406", name: "Double Colour Cotton Doormat 16x24 Inches - Grey", color: "Grey", pattern: "Colour Block" },
  { id: "6a70819ded0f223907891804", name: "Bricks Design Cotton Doormat 15x22 Inches - Mustard", color: "Mustard", pattern: "Bricks" },
  { id: "6a707ffcf1f4cd45452f4d16", name: "Bricks Design Cotton Doormat 15x22 Inches - Brown", color: "Brown", pattern: "Bricks" },
  { id: "6a7072a6a272acd2cea1c1dd", name: "Ombre Stripe Cotton Doormat 16x22 Inches", color: "Blue Teal", pattern: "Ombre Stripe" },
  { id: "6a704bb7c5fdce89c2d01f9a", name: "Bricks Design Cotton Doormat 15x22 Inches - Maroon/Red", color: "Maroon Red", pattern: "Bricks" },

  // ---- Table Covers (21/26 missing) ----
  { id: "6a9bea931ca8d07d4d3eee47", name: "Central Table Cover 40x60 Inches - Grey Sunflower Net", color: "Grey", pattern: "Sunflower" },
  { id: "6a99590b06acfb4d42def65b", name: "Clear Table Over Cover 40x60 Inches - Gold Lace Border", color: "Clear", pattern: "Lace Border" },
  { id: "6a99590206acfb4d42def65a", name: "Clear Table Over Cover 40x60 Inches - White Lace Border", color: "Clear", pattern: "Lace Border" },
  { id: "6a9958f906acfb4d42def659", name: "Clear Table Over Cover 45x70 Inches - Cream Floral Border", color: "Clear", pattern: "Floral Border" },
  { id: "6a9958f106acfb4d42def658", name: "Clear Table Over Cover 48x48 Inches - Gold Ribbon Border", color: "Clear", pattern: "Ribbon Border" },
  // Description: "soft pink, mauve and gold on a warm beige base" -- 4 colors named with
  // no single one stated as dominant in the title or description -- left blank.
  { id: "6a9958ec06acfb4d42def657", name: "Central Table Cover 40x60 Inches - Rose Bouquet", color: "", pattern: "Floral", note: "description names 4 colors (pink, mauve, gold, beige base) with none stated as dominant -- genuinely multi-colour" },
  { id: "6a99562506acfb4d42def4c5", name: "Central Table Cover 40x60 Inches - Blush Geometric", color: "Blush", pattern: "Geometric" },
  { id: "6a99561a06acfb4d42def4b1", name: "Central Table Cover 40x60 Inches - Golden Rose Baroque", color: "Gold", pattern: "Baroque" },
  // Title has no color word; description states "dusty pink and taupe" as an
  // undifferentiated pair both times -- left blank rather than picking one.
  { id: "6a99560f06acfb4d42def4b0", name: "Central Table Cover 40x60 Inches - Vintage Lace Medallion", color: "", pattern: "Medallion", note: "title has no color word; description states 'dusty pink and taupe' as an undifferentiated pair, not a single dominant color" },
  // No color word anywhere in name or description at all (wood-grain/knit texture,
  // snowflake/plaid accents -- no actual color named) -- left blank.
  { id: "6a9954bc06acfb4d42def3dc", name: "Central Table Cover 40x60 Inches - Winter Cabin Print", color: "", pattern: "Plaid", note: "no color word anywhere in name/description (only texture/motif words: wood-grain, knit, snowflake, plaid)" },
  { id: "6a9954b106acfb4d42def3db", name: "Central Table Cover 40x60 Inches - Mauve Polka Dot", color: "Mauve", pattern: "Polka Dot" },
  { id: "6a9954a706acfb4d42def3da", name: "Central Table Cover 40x60 Inches - Green Daisy Retro", color: "Green", pattern: "Daisy" },
  { id: "6a99533f06acfb4d42def2fe", name: "Central Table Cover 45x70 Inches - Rustic Wood Hearts", color: "Blush", pattern: "Hearts" },
  { id: "6a9951d706acfb4d42def0e4", name: "Central Table Cover 45x70 Inches - Peach Mandala Patchwork", color: "Peach", pattern: "Mandala Patchwork" },
  { id: "6a99514c2f501c1f9a5d41ac", name: "Central Table Cover 40x60 Inches - Pink Patchwork", color: "Pink", pattern: "Patchwork" },
  { id: "6a994bf32f501c1f9a5d3ead", name: "Central Table Cover 40x60 Inches - Brown Floral", color: "Brown", pattern: "Floral" },
  { id: "6a98263e2f501c1f9a5cfa6b", name: "Central Table Cover 40x60 Inches - Tan Sunflower", color: "Tan", pattern: "Sunflower" },
  { id: "6a9826222f501c1f9a5cfa56", name: "Central Table Cover 40x60 Inches - Red Wave Dots", color: "Red", pattern: "Wave Dots" },
  { id: "6a9824992f501c1f9a5cf81d", name: "Central Table Cover 40x60 Inches - Tan Plaid", color: "Tan", pattern: "Plaid" },
  { id: "6a982446e58efff17cc9e200", name: "Central Table Cover 40x60 Inches - Maroon Gold Floral", color: "Maroon Gold", pattern: "Floral" },
  { id: "6a98212ae58efff17cc9df22", name: "Central Table Cover 40x60 Inches - Coffee Brown Check", color: "Coffee Brown", pattern: "Check" },

  // ---- Mattress Covers (5/7 missing) ----
  { id: "6a9bc33e1f4b429e453e333d", name: "Waterproof PVC Mattress Cover Standard Single Bed Size - Navy Steel Blue", color: "Navy Steel Blue", pattern: "Solid" },
  { id: "6a9bc33b1f4b429e453e333c", name: "Waterproof PVC Mattress Cover Standard Single Bed Size - Khaki Taupe", color: "Khaki Taupe", pattern: "Solid" },
  { id: "6a9bc3381f4b429e453e333b", name: "Waterproof PVC Mattress Cover 72x78 Inches - Khaki Olive", color: "Khaki Olive", pattern: "Solid" },
  { id: "6a9bc3351f4b429e453e333a", name: "Waterproof PVC Mattress Cover 72x78 Inches - Charcoal Grey", color: "Charcoal Grey", pattern: "Solid" },
  { id: "6a97e42ed6c1d187c220efff", name: "Checkered Cotton Single Bed Mattress Cover 36x72 Inches - Navy Black", color: "Navy Black", pattern: "Checkered" },
];

for (const fix of FIXES) {
  const product = await getProductAdmin(BASE, fix.id, TOKEN);
  console.log(
    `${product.name}: current color="${product.color}" pattern="${product.pattern}"`,
  );

  if (product.name !== fix.name) {
    console.log(
      `  -> WARNING: name mismatch (live: "${product.name}" vs expected "${fix.name}") -- skipping, re-check before retrying`,
    );
    continue;
  }

  if (product.color || product.pattern) {
    console.log("  -> skipping, color/pattern already populated (re-check before overwriting)");
    continue;
  }

  const overrides = {};
  if (fix.color) overrides.color = fix.color;
  if (fix.pattern) overrides.pattern = fix.pattern;

  if (!Object.keys(overrides).length) {
    console.log(`  -> no values to set (left blank intentionally: ${fix.note || "ambiguous"})`);
    continue;
  }

  const fd = buildProductUpdateFormData(product, overrides);
  const { status, data } = await updateProduct(BASE, fix.id, fd, TOKEN);
  console.log(`  -> set color="${fix.color}" pattern="${fix.pattern}", PUT status ${status}, success=${data.success}`);
  if (!data.success) console.log("  ", JSON.stringify(data));
}
