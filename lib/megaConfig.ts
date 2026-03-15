// lib/megaConfig.ts
import { Storage } from "megajs";

let cachedStorage: Storage | null = null;

export async function getMegaStorage(): Promise<Storage> {
  if (cachedStorage) return cachedStorage;

  const email = process.env.NEXT_PUBLIC_MEGA_EMAIL;
  const password = process.env.NEXT_PUBLIC_MEGA_PASSWORD;
  if (!email || !password) throw new Error("Missing MEGA_EMAIL or MEGA_PASSWORD env vars");

  // Storage().ready returns a Promise that resolves when logged in
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - megajs types are loose, this works at runtime
  cachedStorage = await new Storage({ email, password }).ready;
  return cachedStorage;
}
