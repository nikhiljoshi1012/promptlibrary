const DB_NAME = 'PromptLibraryDB';
const DB_VERSION = 2;
const STORE_PROMPTS = 'prompts';
const STORE_DRAFTS = 'drafts';

let dbInstance = null;

function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = async (event) => {
      dbInstance = event.target.result;
      
      // Perform migration if necessary
      await migrateFromChromeStorage();
      
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(STORE_PROMPTS)) {
        const store = db.createObjectStore(STORE_PROMPTS, { keyPath: 'id' });
        store.createIndex('updated_at', 'updated_at', { unique: false });
        store.createIndex('last_used', 'last_used', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
      }
    };
  });
}

async function migrateFromChromeStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['prompts'], async (result) => {
      if (result.prompts && Array.isArray(result.prompts) && result.prompts.length > 0) {
        console.log('Migrating prompts from chrome.storage.local to IndexedDB...');
        await savePrompts(result.prompts);
        // Clean up old storage after successful migration
        chrome.storage.local.remove(['prompts'], () => {
          console.log('Migration complete. Old storage cleared.');
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

async function dbLoadPrompts() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readonly');
    const store = transaction.objectStore(STORE_PROMPTS);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const storedPrompts = request.result || [];
      resolve(storedPrompts);
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbGetPrompt(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readonly');
    const store = transaction.objectStore(STORE_PROMPTS);
    const request = store.get(id);
    
    request.onsuccess = () => {
      resolve(request.result);
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbSavePrompt(prompt) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROMPTS);
    const request = store.put(prompt);
    
    request.onsuccess = () => {
      notifyPromptsUpdated();
      resolve();
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbDeletePrompt(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROMPTS);
    const request = store.delete(id);
    
    request.onsuccess = () => {
      notifyPromptsUpdated();
      resolve();
    };
    
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbDeletePromptsBulk(ids) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROMPTS);
    
    ids.forEach(id => {
      store.delete(id);
    });
    
    transaction.oncomplete = () => {
      notifyPromptsUpdated();
      resolve();
    };
    
    transaction.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbSavePrompts(promptsArray) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROMPTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROMPTS);
    
    promptsArray.forEach(prompt => {
      store.put(prompt);
    });
    
    transaction.oncomplete = () => {
      notifyPromptsUpdated();
      resolve();
    };
    
    transaction.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

async function dbLoadPromptDraft() {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_DRAFTS], 'readonly');
      const store = transaction.objectStore(STORE_DRAFTS);
      const request = store.get('currentDraft');
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function dbSavePromptDraft(draft) {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_DRAFTS], 'readwrite');
      const store = transaction.objectStore(STORE_DRAFTS);
      const request = store.put({ id: 'currentDraft', data: draft });
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function dbClearPromptDraft() {
  const db = await initDB();
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_DRAFTS], 'readwrite');
      const store = transaction.objectStore(STORE_DRAFTS);
      const request = store.delete('currentDraft');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function notifyPromptsUpdated() {
  chrome.runtime.sendMessage({ type: 'PROMPTS_UPDATED' }).catch(() => {
    // Ignore error if there are no listeners
  });
}
