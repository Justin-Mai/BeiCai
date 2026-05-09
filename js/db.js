/**
 * IndexedDB 数据库操作层
 * 提供统一的异步存储接口，供 store.js 使用
 */

const DB_NAME = 'beicai_db';
const DB_VERSION = 1;

/** Object Store 名称常量 */
export const STORES = {
    TRANSACTIONS: 'transactions',
    ACCOUNTS: 'accounts',
    LEDGERS: 'ledgers',
    KV: 'kv_store'
};

let dbInstance = null;

/**
 * 打开（或创建）IndexedDB 数据库
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        if (!window.indexedDB) {
            reject(new Error('INDEXEDDB_NOT_SUPPORTED'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // 交易记录表
            if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
                const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
                txStore.createIndex('bookId', 'bookId', { unique: false });
                txStore.createIndex('date', 'date', { unique: false });
                txStore.createIndex('accountId', 'accountId', { unique: false });
            }

            // 账户表
            if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
                db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
            }

            // 账本表
            if (!db.objectStoreNames.contains(STORES.LEDGERS)) {
                db.createObjectStore(STORES.LEDGERS, { keyPath: 'id' });
            }

            // 通用键值存储（settings、profile、categories 等）
            if (!db.objectStoreNames.contains(STORES.KV)) {
                db.createObjectStore(STORES.KV, { keyPath: 'key' });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            // 监听数据库意外关闭
            dbInstance.onclose = () => { dbInstance = null; };
            resolve(dbInstance);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * 通用事务执行器
 * @param {string} storeName - Object Store 名称
 * @param {string} mode - 'readonly' | 'readwrite'
 * @param {(store: IDBObjectStore) => IDBRequest} action - 对 store 执行的操作
 * @returns {Promise<any>}
 */
function executeTransaction(storeName, mode, action) {
    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, mode);
            const store = tx.objectStore(storeName);
            const request = action(store);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    });
}

/**
 * 从 KV 存储读取单条数据
 * @param {string} key
 * @returns {Promise<any>} 存储的值，不存在则返回 undefined
 */
export function dbGet(key) {
    return executeTransaction(STORES.KV, 'readonly', store => store.get(key))
        .then(result => result ? result.value : undefined);
}

/**
 * 写入单条数据到 KV 存储
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export function dbPutKV(key, value) {
    return executeTransaction(STORES.KV, 'readwrite', store => store.put({ key, value }));
}

/**
 * 从 KV 存储删除单条数据
 * @param {string} key
 * @returns {Promise<void>}
 */
export function dbDeleteKV(key) {
    return executeTransaction(STORES.KV, 'readwrite', store => store.delete(key));
}

/**
 * 读取指定 Object Store 中的所有数据
 * @param {string} storeName - STORES 常量之一
 * @returns {Promise<Array>}
 */
export function dbGetAll(storeName) {
    return executeTransaction(storeName, 'readonly', store => store.getAll())
        .then(result => result || []);
}

/**
 * 向指定 Object Store 写入/更新单条数据
 * @param {string} storeName
 * @param {Object} value - 必须包含 keyPath 字段（id）
 * @returns {Promise<void>}
 */
export function dbPut(storeName, value) {
    return executeTransaction(storeName, 'readwrite', store => store.put(value));
}

/**
 * 从指定 Object Store 删除单条数据
 * @param {string} storeName
 * @param {any} key
 * @returns {Promise<void>}
 */
export function dbDelete(storeName, key) {
    return executeTransaction(storeName, 'readwrite', store => store.delete(key));
}

/**
 * 批量写入数据到指定 Object Store（单个事务）
 * @param {string} storeName
 * @param {Array<Object>} values
 * @returns {Promise<void>}
 */
export function dbBatchPut(storeName, values) {
    if (!values || values.length === 0) return Promise.resolve();

    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            values.forEach(v => store.put(v));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    });
}

/**
 * 清空指定 Object Store
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export function dbClear(storeName) {
    return executeTransaction(storeName, 'readwrite', store => store.clear());
}

/**
 * 原子性清空并批量写入（单个事务，消除 clear 和 put 之间的竞态窗口）
 * @param {string} storeName
 * @param {Array<Object>} values
 * @returns {Promise<void>}
 */
export function dbClearAndBatchPut(storeName, values) {
    if (!values || values.length === 0) {
        return dbClear(storeName);
    }

    return openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.clear();
            values.forEach(v => store.put(v));
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    });
}

/**
 * 检测 IndexedDB 是否可用
 * @returns {boolean}
 */
export function isIndexedDBAvailable() {
    return !!window.indexedDB;
}
