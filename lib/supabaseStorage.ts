/**
 * Upload an image via the server-side API route.
 * Returns the public URL of the uploaded file.
 */
export const fbUploadImage = async (image: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", image);

  const res = await fetch("/api/uploadImage", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Upload failed");
  }

  const { url } = await res.json();
  return url;
};

/**
 * Delete an image via the server-side API route.
 * Accepts a full public URL or a storage path.
 */
export const fbDeleteImage = async (imageUrlOrPath: string): Promise<void> => {
  if (!imageUrlOrPath) return;

  const res = await fetch("/api/deleteImage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl: imageUrlOrPath }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Delete failed:", err.error);
    throw new Error(err.error || "Delete failed");
  }
};

/**
 * Given a logoUrl or image reference, return a usable src for <Image>.
 * - Full URLs (http/https) are returned as‑is.
 * - Short Mega-style node IDs are routed through the legacy proxy.
 */
export const getImageSrc = (urlOrId: string): string => {
  if (!urlOrId) return "";

  // Already a full URL (Supabase or any other host)
  if (urlOrId.startsWith("http://") || urlOrId.startsWith("https://")) {
    return urlOrId;
  }

  // Legacy Mega node ID — route through the proxy that still works
  return `/api/image/${urlOrId}`;
};
