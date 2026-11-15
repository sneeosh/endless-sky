"use strict";

(function (exports) {
  // A simple key value store using IndexedDB because it allows storage of
  // large amounts of data.
  class KeyValueStore {
    constructor(dbName, storeName) {
      this.storeName = storeName;
      this.dbPromise = new Promise((resolve, reject) => {
        const dbRequest = indexedDB.open(dbName, 1);
        dbRequest.onerror = () => reject(dbRequest.error);
        dbRequest.onsuccess = () => resolve(dbRequest.result);
        dbRequest.onupgradeneeded = () => {
          dbRequest.result.createObjectStore(storeName);
        };
      });
    }
    get(key) {
      return this.dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readonly");
            const req = transaction.objectStore(this.storeName).get(key);
            transaction.oncomplete = () => resolve(req.result);
            transaction.onabort = transaction.onerror = () => {
              reject(transaction.error);
            };
          })
      );
    }
    set(key, value) {
      return this.dbPromise.then(
        (db) =>
          new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, "readwrite");
            const req = transaction.objectStore(this.storeName).put(value, key);
            transaction.oncomplete = () => resolve(req.result);
            transaction.onabort = transaction.onerror = () => {
              reject(transaction.error);
            };
          })
      );
    }
  }

  const kvstore = new KeyValueStore("data", "store");

  // Caches a single version of a resource
  class CachedResource {
    constructor(resourceUrl, key, keySuffix) {
      if (keySuffix === undefined) keySuffix = "";
      this.resourceUrl = resourceUrl;
      this.cacheKey = key + keySuffix;
    }
    async get(length, version, progressCallback = () => {}) {
      const cached = await kvstore.get(this.cacheKey);
      if (cached && cached.version === version && cached.data instanceof ArrayBuffer &&
          (!length || cached.data.byteLength === length)) {
        progressCallback(cached.data.byteLength, cached.data.byteLength, true);
        return cached.data;
      }

      let data;
      const response = await fetch(this.resourceUrl);
      if (!response.ok) {
        throw new Error(`Could not download ${this.resourceUrl} (HTTP ${response.status}).`);
      }
      const headerContentLength = parseInt(
        response.headers.get("Content-Length")
      );
      // ContentLength header is not reliable: it might be the length of the compressed resource.
      // response.body is missing in Pale Moon, a Firefox fork that someone on the Endless Sky Discord server uses
      if (length && response.body) {
        // use a progress bar
        let offset = 0;
        data = new ArrayBuffer(length);
        const view = new Uint8Array(data);
        progressCallback(offset, length);
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (offset + value.length > length) {
            throw new Error(`Downloaded more than the expected ${length} bytes for ${this.resourceUrl}.`);
          }
          view.set(value, offset);
          offset += value.length;
          progressCallback(offset, length);
        }
        if (offset !== length) {
          throw new Error(`Incomplete download of ${this.resourceUrl}: received ${offset} of ${length} bytes.`);
        }
      } else {
        // no progress bar
        progressCallback(0, headerContentLength);
        data = await response.arrayBuffer();
        if (length && data.byteLength !== length) {
          throw new Error(`Expected ${length} bytes for ${this.resourceUrl}, received ${data.byteLength}.`);
        }
      }

      console.log("downloaded", this.resourceUrl, data);
      try {
        // Commit bytes and version together, including when two tabs load different builds.
        await kvstore.set(this.cacheKey, {version, data});
      } catch (e) {
        console.log(
          "Failure writing to IndexedDB, maybe private browsing / incognito mode or low on disk space"
        );
      }
      return data;
    }
  }

  window.CachedResource = CachedResource;
})();
