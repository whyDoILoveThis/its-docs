const DB_NAME = "its-the-docs-settings";
const STORE_NAME = "settings";
const DB_VERSION = 1;

function openSettingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getForceOffline(): Promise<boolean> {
  const db = await openSettingsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get("forceOffline");
    request.onsuccess = () => resolve(request.result === true);
    request.onerror = () => reject(request.error);
  });
}

export async function setForceOfflineSetting(value: boolean): Promise<void> {
  const db = await openSettingsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, "forceOffline");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
