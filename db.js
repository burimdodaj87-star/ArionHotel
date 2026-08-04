(() => {
  'use strict';

  const DB_NAME = 'p6-tagesliste-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'datasets';
  const CURRENT_KEY = 'current';

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Die Browser-Datenbank konnte nicht geöffnet werden.'));
    });
  }

  async function saveDataset(dataset) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({ key: CURRENT_KEY, ...dataset });
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Die CSV-Daten konnten nicht gespeichert werden.'));
      };
    });
  }

  async function getDataset() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(CURRENT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Die CSV-Daten konnten nicht geladen werden.'));
      transaction.oncomplete = () => db.close();
    });
  }

  window.P6DB = { getDataset, saveDataset };
})();
