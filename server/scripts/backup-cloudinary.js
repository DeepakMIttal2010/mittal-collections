// Downloads every image/video asset from Cloudinary into ./cloudinary-backup/
// so it can be zipped and stored as a GitHub Actions artifact — Cloudinary's
// Free plan has no automated backup feature of its own (same situation as
// the MongoDB Atlas M0 tier, see docs/BACKUP_RECOVERY.md). Requires
// CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET in the environment.
import fs from "fs";
import path from "path";

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const OUT_DIR = "cloudinary-backup";

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("Missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`${API_KEY}:${API_SECRET}`).toString("base64")}`;

const listAllResources = async (resourceType) => {
  const all = [];
  let cursor = undefined;

  do {
    const url = new URL(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/resources/${resourceType}`);
    url.searchParams.set("max_results", "500");
    if (cursor) url.searchParams.set("next_cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      throw new Error(`Cloudinary list failed (${resourceType}): ${res.status} ${await res.text()}`);
    }

    const body = await res.json();
    all.push(...body.resources);
    cursor = body.next_cursor;
  } while (cursor);

  return all;
};

const downloadResource = async (resource) => {
  const res = await fetch(resource.secure_url);
  if (!res.ok) {
    throw new Error(`Download failed for ${resource.public_id}: ${res.status}`);
  }

  const ext = resource.format ? `.${resource.format}` : "";
  const destPath = path.join(OUT_DIR, resource.resource_type, `${resource.public_id}${ext}`);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
};

const main = async () => {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });

  let totalBytes = 0;
  let totalCount = 0;

  for (const resourceType of ["image", "video"]) {
    const resources = await listAllResources(resourceType);
    console.log(`${resourceType}: ${resources.length} assets`);

    for (const resource of resources) {
      await downloadResource(resource);
      totalBytes += resource.bytes || 0;
      totalCount += 1;
    }
  }

  console.log(`Downloaded ${totalCount} assets, ${(totalBytes / 1024 / 1024).toFixed(1)} MB total`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
