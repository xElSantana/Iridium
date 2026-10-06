const DATABASE_NAME = "iridium.task-images.v1";
const STORE_NAME = "images";
const LOCAL_FILE_SCHEME = "iridium-file:";
const LEGACY_LOCAL_IMAGE_SCHEME = "iridium-image:";
const LOCAL_FILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let databasePromise: Promise<IDBDatabase> | null = null;
const activeFileReferences = new Map<symbol, Set<string>>();
let cleanupQueue: Promise<void> = Promise.resolve();

function collectFileIds(value: unknown, fileIds: Set<string>, visited: WeakSet<object>): void {
  if (typeof value !== "object" || value === null || visited.has(value)) return;
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectFileIds(item, fileIds, visited);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "url" && typeof child === "string") {
      const scheme = child.startsWith(LOCAL_FILE_SCHEME)
        ? LOCAL_FILE_SCHEME
        : child.startsWith(LEGACY_LOCAL_IMAGE_SCHEME)
          ? LEGACY_LOCAL_IMAGE_SCHEME
          : null;
      if (scheme) {
        const fileId = child.slice(scheme.length);
        if (LOCAL_FILE_ID_PATTERN.test(fileId)) fileIds.add(fileId);
      }
    } else {
      collectFileIds(child, fileIds, visited);
    }
  }
}

function getFileIds(content: unknown): Set<string> {
  const fileIds = new Set<string>();
  collectFileIds(content, fileIds, new WeakSet());
  return fileIds;
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("Persistent local file storage is unavailable."));
  }

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => {
        database.close();
        if (databasePromise === opening) databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      if (databasePromise === opening) databasePromise = null;
      reject(request.error ?? new Error("Could not open local file storage."));
    };
    request.onblocked = () => {
      blocked = true;
      if (databasePromise === opening) databasePromise = null;
      reject(new Error("Local file storage is blocked by another connection."));
    };
  });

  databasePromise = opening;
  return opening;
}

function readFile(database: IDBDatabase, fileId: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(fileId);
    request.onsuccess = () => {
      if (request.result instanceof Blob) {
        resolve(request.result);
      } else {
        reject(new Error("The locally stored file could not be found."));
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read the stored file."));
  });
}

function storeFile(database: IDBDatabase, fileId: string, file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).add(file, fileId);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Could not save the selected file."));
  });
}

export function createTaskMediaStorage() {
  const owner = Symbol("task-media-storage");
  const objectUrls = new Map<string, string>();
  const pendingObjectUrls = new Map<string, Promise<string>>();
  const retainedFileIds = new Set<string>();
  let disposed = false;

  const updateRetainedFiles = (content: unknown) => {
    const nextFileIds = getFileIds(content);
    retainedFileIds.clear();
    for (const fileId of nextFileIds) retainedFileIds.add(fileId);
    activeFileReferences.set(owner, new Set(retainedFileIds));

    for (const [fileId, objectUrl] of objectUrls) {
      if (retainedFileIds.has(fileId)) continue;
      URL.revokeObjectURL(objectUrl);
      objectUrls.delete(fileId);
    }
  };

  const retainFiles = (content: unknown) => {
    if (disposed) return;
    updateRetainedFiles(content);
  };

  return {
    retainFiles,
    activate: (content: unknown) => {
      disposed = false;
      updateRetainedFiles(content);
    },
    uploadFile: async (file: File) => {
      if (disposed) throw new Error("The task media editor is no longer active.");

      const fileId = crypto.randomUUID();
      retainedFileIds.add(fileId);
      activeFileReferences.set(owner, new Set(retainedFileIds));
      try {
        await storeFile(await openDatabase(), fileId, file);
      } catch (error) {
        retainedFileIds.delete(fileId);
        if (!disposed) activeFileReferences.set(owner, new Set(retainedFileIds));
        throw error;
      }
      if (!disposed) {
        const objectUrl = URL.createObjectURL(file);
        objectUrls.set(fileId, objectUrl);
      }
      return `${LOCAL_FILE_SCHEME}${fileId}`;
    },
    resolveFileUrl: async (url: string) => {
      if (disposed) throw new Error("The task media editor is no longer active.");

      const scheme = url.startsWith(LOCAL_FILE_SCHEME)
        ? LOCAL_FILE_SCHEME
        : url.startsWith(LEGACY_LOCAL_IMAGE_SCHEME)
          ? LEGACY_LOCAL_IMAGE_SCHEME
          : null;
      if (!scheme) return url;

      const fileId = url.slice(scheme.length);
      if (!LOCAL_FILE_ID_PATTERN.test(fileId)) {
        throw new Error("The local file reference is invalid.");
      }

      const existingUrl = objectUrls.get(fileId);
      if (existingUrl) return existingUrl;

      let pendingUrl = pendingObjectUrls.get(fileId);
      if (!pendingUrl) {
        pendingUrl = openDatabase()
          .then((database) => readFile(database, fileId))
          .then((file) => {
            if (disposed) throw new Error("The task media editor is no longer active.");
            return URL.createObjectURL(file);
          });
        pendingObjectUrls.set(fileId, pendingUrl);
      }

      try {
        const objectUrl = await pendingUrl;
        if (disposed) {
          URL.revokeObjectURL(objectUrl);
          throw new Error("The task media editor is no longer active.");
        }
        objectUrls.set(fileId, objectUrl);
        return objectUrl;
      } finally {
        if (pendingObjectUrls.get(fileId) === pendingUrl) {
          pendingObjectUrls.delete(fileId);
        }
      }
    },
    dispose: () => {
      disposed = true;
      activeFileReferences.delete(owner);
      for (const objectUrl of objectUrls.values()) URL.revokeObjectURL(objectUrl);
      objectUrls.clear();
      pendingObjectUrls.clear();
    },
  };
}

export function removeUnreferencedTaskFiles(workspaceContent: unknown): Promise<void> {
  const runCleanup = async () => {
    const referencedFileIds = getFileIds(workspaceContent);
    const database = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => {
        const activeIds = new Set<string>();
        for (const activeFileIds of activeFileReferences.values()) {
          for (const fileId of activeFileIds) activeIds.add(fileId);
        }

        for (const key of request.result) {
          if (typeof key === "string" && !referencedFileIds.has(key) && !activeIds.has(key)) {
            store.delete(key);
          }
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Could not remove unreferenced local files."));
    });
  };

  cleanupQueue = cleanupQueue.then(runCleanup, runCleanup);
  return cleanupQueue;
}
