/**
 * IndexedDB 아주 얇은 창구.
 *
 * 등록한 폰트·이미지 파일을 브라우저에 남겨서, 새로고침해도 같은 파일을
 * 다시 고르지 않게 하려고 만들었다(fonts/registry, images/registry가 쓴다).
 * DB 하나에 store 두 개(폰트·이미지) — 파일 이름을 키로 바이트를 넣고 뺀다.
 *
 * **실패해도 앱이 멈추면 안 된다.** 사생활 보호 모드·용량 초과 등으로
 * IndexedDB를 못 쓸 수 있다. 캐싱은 있으면 좋고 없어도 그만인 기능이라,
 * 모든 함수가 실패를 조용히 삼킨다 — 등록 자체(이번 세션에서 쓰는 것)는
 * 캐싱과 무관하게 이미 끝난 뒤이므로 캐싱 실패가 사용자에게 보일 이유가 없다.
 */

const DB_NAME = 'diary-designer';
const DB_VERSION = 1;

export type Store = 'fonts' | 'images';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('fonts')) db.createObjectStore('fonts');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 값 하나를 넣는다. 실패하면 조용히 넘어간다. */
export async function idbPut(store: Store, key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 캐싱 실패는 무시한다.
  }
}

/** 값 하나를 지운다. 실패하면 조용히 넘어간다. */
export async function idbDelete(store: Store, key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 삭제 실패는 무시한다 — 캐싱과 같은 이유다.
  }
}

/** store 안의 모든 [키, 값]을 가져온다. 실패하면 빈 목록이다. */
export async function idbEntries<T>(store: Store): Promise<[string, T][]> {
  try {
    const db = await openDB();
    return await new Promise<[string, T][]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const objStore = tx.objectStore(store);
      const keysReq = objStore.getAllKeys();
      const valuesReq = objStore.getAll();
      tx.oncomplete = () => {
        const keys = keysReq.result as string[];
        const values = valuesReq.result as T[];
        resolve(keys.map((k, i) => [k, values[i]]));
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return [];
  }
}
