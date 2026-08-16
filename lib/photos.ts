import { env } from "cloudflare:workers";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function getBucket() {
  if (!env.PHOTOS) {
    throw new Error(
      "Cloudflare R2 binding `PHOTOS` is unavailable. Set the `r2` field in .openai/hosting.json to `PHOTOS` or let your control plane inject the real binding values before uploading photos."
    );
  }
  return env.PHOTOS;
}

export function isAllowedPhotoType(contentType: string): boolean {
  return ALLOWED_TYPES.has(contentType);
}

export { MAX_PHOTO_BYTES };

export async function putPhoto(
  key: string,
  body: ArrayBuffer,
  contentType: string
): Promise<void> {
  await getBucket().put(key, body, { httpMetadata: { contentType } });
}

export async function getPhoto(key: string) {
  return getBucket().get(key);
}

export function newPhotoKey(userId: number, contentType: string): string {
  const ext = contentType.split("/")[1] ?? "bin";
  return `checkins/${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}
