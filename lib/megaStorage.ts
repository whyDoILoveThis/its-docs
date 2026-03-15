// megaStorage.ts
import { v4 as uuidv4 } from "uuid";
import { getMegaStorage } from "./megaConfig";

type UploadableFile =
  | Buffer
  | { arrayBuffer: () => Promise<ArrayBuffer>; name?: string; filename?: string };

export const MegaImgUp = async (image: UploadableFile): Promise<string> => {
  try {
    const storage = await getMegaStorage();

    // Normalize input to Buffer
    let buffer: Buffer;
    let originalName: string;

    if (Buffer.isBuffer(image)) {
      buffer = image;
      originalName = "file";
    } else if (typeof image.arrayBuffer === "function") {
      const ab = await image.arrayBuffer();
      buffer = Buffer.from(ab);
      originalName = image.name ?? image.filename ?? "file";
    } else {
      throw new Error(
        "Unsupported file type. Pass a Buffer, Blob, or File-like object with arrayBuffer()."
      );
    }

    const fileName = `${uuidv4()}-${originalName}`;

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - megajs types are loose
    const uploadedFile = await storage.upload(fileName, buffer).complete;

    // // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // // @ts-ignore
    // const publicLink: string = await uploadedFile.link();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const nodeId: string = uploadedFile.nodeId;

    return nodeId;
  } catch (error) {
    console.error("Error uploading image to MEGA:", error);
    throw error;
  }
};


// lib/getImageSrc.ts
export const getImageSrc = (urlOrId: string) => {
  // Check if this looks like a Mega node ID (very short, alphanumeric)
  const megaIdPattern = /^[a-zA-Z0-9_-]{8,}$/; // adjust length if needed

  if (megaIdPattern.test(urlOrId)) {
    // return your API proxy route for Mega
    return `/api/image/${urlOrId}`;
  }

  // Otherwise, assume it's a normal URL
  return urlOrId;
};



export const MegaImgDelete = async (imageUrlOrId: string): Promise<void> => {
  try {
    if (!imageUrlOrId) throw new Error("No image identifier provided");

    // Accept raw nodeId OR url containing it
    const match =
      imageUrlOrId.match(/#mega_node=([^&]+)/) ??
      imageUrlOrId.match(/([A-Za-z0-9_-]{8,})$/);

    if (!match) {
      throw new Error("Could not extract MEGA nodeId");
    }

    const nodeId = decodeURIComponent(match[1]);

    const storage = await getMegaStorage();

    if (storage.ready) {
      await storage.ready;
    }

    const file = storage.files[nodeId];

    if (!file) {
      throw new Error(`MEGA file not found: ${nodeId}`);
    }

    await file.delete(true);

    console.log("✅ MEGA file deleted:", nodeId);
  } catch (err) {
    console.error("❌ MEGA delete failed:", err);
    throw err;
  }
};