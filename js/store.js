/**
 * 数据存储层
 * 底层使用 IndexedDB，通过内存缓存提供同步读取接口
 * 写入时同步更新内存缓存 + 异步持久化到 IndexedDB
 */

import { openDB, dbGet, dbPutKV, dbDeleteKV, dbGetAll, dbPut, dbDelete, dbBatchPut, dbClear, dbClearAndBatchPut, STORES, isIndexedDBAvailable } from './db.js';

// ==================== 常量 ====================

const STORAGE_KEY = 'beicai_transactions';
const ACCOUNTS_KEY = 'beicai_accounts';
const LEDGERS_KEY = 'beicai_ledgers';
const ACTIVE_BOOK_KEY = 'beicai_active_book';
const USER_PROFILE_KEY = 'beicai_user_profile';
const AI_ENABLED_KEY = 'beicai_ai_enabled';
const FG_SERVICE_KEY = 'beicai_fg_service_disabled';
const INSTALL_DATE_KEY = 'beicai_install_date';
const CUSTOM_CATEGORIES_KEY = 'beicai_custom_categories';
const EXCHANGE_RATES_KEY = 'beicai_exchange_rates';
const MIGRATION_KEY = 'beicai_migration_to_idb_done';

const DEFAULT_PROFILE = { avatar: '😊', name: '极简达人', slogan: '简单记账，掌控生活' };
const DEFAULT_EXCHANGE_RATES = { 'CNY': 1, 'USD': 7.20, 'HKD': 0.92 };

// ==================== 内存缓存 ====================

let flatTransactions = [];
let accounts = [];
let ledgers = [];
let settingsCache = {}; // KV 存储的内存缓存
let initialized = false;
let useIndexedDB = false;

// ==================== 异步持久化辅助 ====================

/**
 * 异步持久化到 IndexedDB（fire-and-forget）
 * 不阻塞调用方，失败仅打印日志
 */
function persistToDB(storeName, value) {
    if (!useIndexedDB) return;
    dbPut(storeName, value).catch(e => {
        console.error(`[store] IndexedDB 写入失败 (${storeName}):`, e);
    });
}

/**
 * 异步持久化 KV 数据
 */
function persistKV(key, value) {
    if (!useIndexedDB) return;
    dbPutKV(key, value).catch(e => {
        console.error(`[store] IndexedDB KV 写入失败 (${key}):`, e);
    });
}

/**
 * 异步删除 KV 数据
 */
function persistDeleteKV(key) {
    if (!useIndexedDB) return;
    dbDeleteKV(key).catch(e => {
        console.error(`[store] IndexedDB KV 删除失败 (${key}):`, e);
    });
}

/**
 * 批量持久化整个 Object Store
 */
function persistAll(storeName, data) {
    if (!useIndexedDB) return;
    dbClearAndBatchPut(storeName, data).catch(e => {
        console.error(`[store] IndexedDB 批量写入失败 (${storeName}):`, e);
    });
}

// ==================== 初始化 ====================

/**
 * 初始化存储层：打开 IndexedDB，执行数据迁移，加载内存缓存
 * 必须在其他 store 函数调用之前完成
 * @returns {Promise<void>}
 */
export async function initStore() {
    // 检测 IndexedDB 可用性
    if (!isIndexedDBAvailable()) {
        console.warn('[store] IndexedDB 不可用，回退到 localStorage 模式');
        useIndexedDB = false;
        loadFromLocalStorage();
        initialized = true;
        return;
    }

    try {
        await openDB();
        useIndexedDB = true;
    } catch (e) {
        console.warn('[store] IndexedDB 打开失败，回退到 localStorage:', e);
        useIndexedDB = false;
        loadFromLocalStorage();
        initialized = true;
        return;
    }

    // 检查是否已完成迁移
    const migrated = await dbGet(MIGRATION_KEY);
    if (!migrated) {
        await migrateFromLocalStorage();
    }

    // 从 IndexedDB 加载数据到内存
    await loadFromIndexedDB();
    initialized = true;
}

/**
 * 从 localStorage 加载所有数据到内存缓存
 */
function loadFromLocalStorage() {
    flatTransactions = safeParseLocal(STORAGE_KEY) || [];
    accounts = safeParseLocal(ACCOUNTS_KEY) || [];
    ledgers = safeParseLocal(LEDGERS_KEY) || [];

    settingsCache = {
        [ACTIVE_BOOK_KEY]: localStorage.getItem(ACTIVE_BOOK_KEY) || 'book_default',
        [EXCHANGE_RATES_KEY]: safeParseLocal(EXCHANGE_RATES_KEY) || { ...DEFAULT_EXCHANGE_RATES },
        [USER_PROFILE_KEY]: safeParseLocal(USER_PROFILE_KEY) || { ...DEFAULT_PROFILE },
        [AI_ENABLED_KEY]: localStorage.getItem(AI_ENABLED_KEY) === 'true',
        [FG_SERVICE_KEY]: localStorage.getItem(FG_SERVICE_KEY) === 'true',
        [INSTALL_DATE_KEY]: localStorage.getItem(INSTALL_DATE_KEY) || '',
        [CUSTOM_CATEGORIES_KEY]: safeParseLocal(CUSTOM_CATEGORIES_KEY) || { expense: [], income: [] },
    };

    sortTransactions();
}

/**
 * 从 IndexedDB 加载所有数据到内存缓存
 */
async function loadFromIndexedDB() {
    flatTransactions = await dbGetAll(STORES.TRANSACTIONS);
    accounts = await dbGetAll(STORES.ACCOUNTS);
    ledgers = await dbGetAll(STORES.LEDGERS);

    // 加载 KV 数据
    const kvKeys = [ACTIVE_BOOK_KEY, EXCHANGE_RATES_KEY, USER_PROFILE_KEY,
                    AI_ENABLED_KEY, FG_SERVICE_KEY, INSTALL_DATE_KEY, CUSTOM_CATEGORIES_KEY];
    const kvValues = await Promise.all(kvKeys.map(k => dbGet(k)));

    settingsCache = {};
    kvKeys.forEach((key, i) => {
        settingsCache[key] = kvValues[i];
    });

    // 设置默认值
    if (!settingsCache[ACTIVE_BOOK_KEY]) settingsCache[ACTIVE_BOOK_KEY] = 'book_default';
    if (!settingsCache[EXCHANGE_RATES_KEY]) settingsCache[EXCHANGE_RATES_KEY] = { ...DEFAULT_EXCHANGE_RATES };
    if (!settingsCache[USER_PROFILE_KEY]) settingsCache[USER_PROFILE_KEY] = { ...DEFAULT_PROFILE };
    if (!settingsCache[CUSTOM_CATEGORIES_KEY]) settingsCache[CUSTOM_CATEGORIES_KEY] = { expense: [], income: [] };

    sortTransactions();
}

/**
 * 从 localStorage 迁移数据到 IndexedDB
 */
async function migrateFromLocalStorage() {
    console.log('[store] 开始从 localStorage 迁移数据到 IndexedDB...');

    // 读取 localStorage 中的所有数据
    const txs = safeParseLocal(STORAGE_KEY) || [];
    const accs = safeParseLocal(ACCOUNTS_KEY) || [];
    const leds = safeParseLocal(LEDGERS_KEY) || [];
    const rates = safeParseLocal(EXCHANGE_RATES_KEY) || { ...DEFAULT_EXCHANGE_RATES };
    const profile = safeParseLocal(USER_PROFILE_KEY) || { ...DEFAULT_PROFILE };
    const customCats = safeParseLocal(CUSTOM_CATEGORIES_KEY) || { expense: [], income: [] };
    const activeBook = localStorage.getItem(ACTIVE_BOOK_KEY) || 'book_default';
    const aiEnabled = localStorage.getItem(AI_ENABLED_KEY) === 'true';
    const fgDisabled = localStorage.getItem(FG_SERVICE_KEY) === 'true';
    const installDate = localStorage.getItem(INSTALL_DATE_KEY) || '';

    try {
        // 批量写入 Object Stores
        if (txs.length > 0) await dbBatchPut(STORES.TRANSACTIONS, txs);
        if (accs.length > 0) await dbBatchPut(STORES.ACCOUNTS, accs);
        if (leds.length > 0) await dbBatchPut(STORES.LEDGERS, leds);

        // 写入 KV 数据
        await Promise.all([
            dbPutKV(EXCHANGE_RATES_KEY, rates),
            dbPutKV(USER_PROFILE_KEY, profile),
            dbPutKV(CUSTOM_CATEGORIES_KEY, customCats),
            dbPutKV(ACTIVE_BOOK_KEY, activeBook),
            dbPutKV(AI_ENABLED_KEY, aiEnabled),
            dbPutKV(FG_SERVICE_KEY, fgDisabled),
            dbPutKV(INSTALL_DATE_KEY, installDate),
        ]);

        // 设置迁移完成标记
        await dbPutKV(MIGRATION_KEY, true);
        console.log('[store] 数据迁移完成');
    } catch (e) {
        console.error('[store] 数据迁移失败:', e);
        // 迁移失败不设标记，下次启动重试
    }
}

// ==================== localStorage 兼容层 ====================

/**
 * 安全读取 localStorage 并解析 JSON
 */
function safeParseLocal(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error(`[store] localStorage 解析失败 (${key}):`, e.message);
        return null;
    }
}

/**
 * 安全写入 localStorage，捕获 QuotaExceededError
 * @returns {boolean} 是否写入成功
 */
export function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
            console.error('[store] 存储空间已满，无法保存数据');
            return false;
        }
        throw e;
    }
}

// ==================== 存储健康检查 ====================

/**
 * 获取当前 localStorage 已用字节数（仅 beicai_ 前缀）
 */
export function getStorageUsedBytes() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('beicai_')) {
            total += (key.length + localStorage.getItem(key).length) * 2; // UTF-16
        }
    }
    return total;
}

/**
 * 检查存储健康状态
 */
export function checkStorageHealth() {
    const txCount = flatTransactions.length;
    const accCount = accounts.length;
    const ledCount = ledgers.length;

    // 估算数据量
    const estimatedBytes = JSON.stringify(flatTransactions).length * 2
                         + JSON.stringify(accounts).length * 2
                         + JSON.stringify(ledgers).length * 2;

    return {
        txCount,
        accCount,
        ledCount,
        estimatedBytes,
        // IndexedDB 无硬性上限，warning 基于记录数
        warning: txCount > 50000 ? '交易记录较多（超过5万条），可能影响查询性能' : null
    };
}

// ==================== 工具函数 ====================

/**
 * 获取星期几
 */
export function getDayOfWeek(dateString) {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "未知";
    return days[d.getDay()];
}

/**
 * 对 flatTransactions 按日期降序、id 降序排序
 */
function sortTransactions() {
    flatTransactions.sort((a, b) => {
        if (a.date !== b.date) {
            return new Date(b.date) - new Date(a.date);
        }
        return b.id - a.id;
    });
}

// ==================== 交易管理 ====================

/**
 * 加载交易数据并按月份分组
 * @param {string} currentSelectedMonth - 当前选择的月份 YYYY-MM
 * @param {string} filterAccountId - 可选：按账户 ID 过滤
 * @param {string} filterBookId - 可选：按账本 ID 过滤
 * @returns {{ flatTransactions: Array, groupedData: Array, monthIncome: number, monthExpense: number }}
 */
export function loadTransactions(currentSelectedMonth, filterAccountId = null, filterBookId = null) {
    // 按日期分组，并计算月度汇总
    const grouped = {};
    let monthIncome = 0;
    let monthExpense = 0;

    // 兜底当前月份
    if (!currentSelectedMonth) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        currentSelectedMonth = `${yyyy}-${mm}`;
    }

    flatTransactions.forEach(t => {
        // 过滤账本
        if (filterBookId && t.bookId !== filterBookId) return;

        // 过滤账户
        if (filterAccountId && t.accountId !== filterAccountId) return;

        // 如果没有明确指定账户，说明是在总账明细页，此时过滤掉"余额调整"记录，使其不影响主页明细
        if (!filterAccountId && t.isAdjustment) return;

        // 过滤月份 (如果提供了月份)
        if (currentSelectedMonth && !t.date.startsWith(currentSelectedMonth)) return;

        if (!grouped[t.date]) {
            grouped[t.date] = {
                date: t.date,
                day: getDayOfWeek(t.date),
                income: 0,
                expense: 0,
                transactions: []
            };
        }

        grouped[t.date].transactions.push(t);

        const amt = parseFloat(t.amount) || 0;
        if (t.type === 'income') {
            monthIncome += amt;
        } else {
            monthExpense += amt;
        }
    });

    // 格式化并转为数组
    const groupedData = [];
    for (const date in grouped) {
        grouped[date].income = grouped[date].income.toFixed(2);
        grouped[date].expense = grouped[date].expense.toFixed(2);
        groupedData.push(grouped[date]);
    }

    return { flatTransactions: [...flatTransactions], groupedData, monthIncome, monthExpense };
}

/**
 * 加载全部交易数据（不分月过滤，供图表使用）
 * @param {string} filterBookId - 可选：按账本 ID 过滤
 */
export function loadAllTransactions(filterBookId = null) {
    // flatTransactions 已排序，filter 保持相对顺序
    if (filterBookId) {
        return flatTransactions.filter(t => t.bookId === filterBookId);
    }
    return [...flatTransactions];
}

/**
 * 保存（新增/更新）一条交易
 */
export function saveTransaction(tx) {
    // 自动为新交易添加 bookId（如果没有）
    if (!tx.bookId) {
        tx.bookId = getActiveBookId() || 'book_default';
    }

    const existingIndex = flatTransactions.findIndex(t => t.id === tx.id);
    if (existingIndex !== -1) {
        flatTransactions[existingIndex] = tx;
    } else {
        flatTransactions.push(tx);
    }
    sortTransactions();
    persistToDB(STORES.TRANSACTIONS, tx);
}

/**
 * 删除一条交易
 */
export function deleteTransaction(id) {
    flatTransactions = flatTransactions.filter(t => t.id !== id);
    persistDeleteDB(STORES.TRANSACTIONS, id);
}

/**
 * 根据 id 查找交易
 */
export function findTransaction(id) {
    return flatTransactions.find(t => t.id === parseInt(id, 10));
}

/**
 * 按账本 ID 删除所有关联交易
 * @param {string} bookId
 * @returns {number} 删除后剩余的交易数
 */
export function deleteTransactionsByBookId(bookId) {
    const toDelete = flatTransactions.filter(t => t.bookId === bookId);
    flatTransactions = flatTransactions.filter(t => t.bookId !== bookId);

    // 异步删除 IndexedDB 中的记录
    if (useIndexedDB) {
        Promise.all(toDelete.map(t => dbDelete(STORES.TRANSACTIONS, t.id))).catch(e => {
            console.error('[store] 批量删除交易失败:', e);
        });
    }

    return flatTransactions.length;
}

/**
 * 异步删除 IndexedDB 中的单条记录
 */
function persistDeleteDB(storeName, key) {
    if (!useIndexedDB) return;
    dbDelete(storeName, key).catch(e => {
        console.error(`[store] IndexedDB 删除失败 (${storeName}):`, e);
    });
}

// ==================== 账户管理 ====================

/**
 * 加载账户数据
 */
export function loadAccounts() {
    return [...accounts];
}

/**
 * 获取资产汇总
 */
export function getAssetsSummary() {
    let totalAssets = 0;
    let totalLiabilities = 0;

    const rates = getExchangeRates();

    accounts.forEach(acc => {
        const rate = acc.currency ? (rates[acc.currency] || 1) : 1;
        const convertedBalance = (acc.balance || 0) * rate;

        if (convertedBalance >= 0) {
            totalAssets += convertedBalance;
        } else {
            totalLiabilities += Math.abs(convertedBalance);
        }
    });

    return {
        totalAssets: totalAssets.toFixed(2),
        totalLiabilities: totalLiabilities.toFixed(2),
        netAssets: (totalAssets - totalLiabilities).toFixed(2)
    };
}

/**
 * 保存（新增/更新）一个账户
 */
export function saveAccount(acc) {
    const existingIndex = accounts.findIndex(a => a.id === acc.id);
    if (existingIndex !== -1) {
        accounts[existingIndex] = acc;
    } else {
        accounts.push(acc);
    }
    persistToDB(STORES.ACCOUNTS, acc);
}

/**
 * 删除一个账户
 */
export function deleteAccount(id) {
    accounts = accounts.filter(a => a.id !== id);
    persistDeleteDB(STORES.ACCOUNTS, id);
}

// ==================== 统计 ====================

/**
 * 获取"我的"页面统计信息（记账天数）
 */
export function getUsageStats() {
    const uniqueDates = new Set(flatTransactions.map(t => t.date));
    const accountingDays = uniqueDates.size;
    return { accountingDays };
}

// ==================== 外汇汇率 ====================

/**
 * 获取外汇参考汇率
 */
export function getExchangeRates() {
    const saved = settingsCache[EXCHANGE_RATES_KEY];
    return { ...DEFAULT_EXCHANGE_RATES, ...(saved || {}) };
}

/**
 * 保存外汇参考汇率
 */
export function saveExchangeRates(rates) {
    settingsCache[EXCHANGE_RATES_KEY] = rates;
    persistKV(EXCHANGE_RATES_KEY, rates);
}

// ==================== 账本管理 ====================

/**
 * 加载账本列表
 */
export function loadLedgers() {
    return [...ledgers];
}

/**
 * 保存（新增/更新）一个账本
 * @param {Object} ledger - 账本对象
 * @returns {boolean} 是否保存成功
 */
export function saveLedger(ledger) {
    // 验证名称
    if (!ledger.name || ledger.name.trim() === '') {
        return false;
    }

    // 检查名称重复（忽略大小写）
    const duplicate = ledgers.find(l =>
        l.id !== ledger.id && l.name.toLowerCase() === ledger.name.trim().toLowerCase()
    );
    if (duplicate) {
        return false;
    }

    ledger.name = ledger.name.trim();

    const existingIndex = ledgers.findIndex(l => l.id === ledger.id);
    if (existingIndex !== -1) {
        ledgers[existingIndex] = { ...ledgers[existingIndex], ...ledger };
    } else {
        ledgers.push(ledger);
    }
    persistToDB(STORES.LEDGERS, ledgers.find(l => l.id === ledger.id));
    return true;
}

/**
 * 删除一个账本
 * @param {string} bookId - 账本 ID
 * @returns {boolean} 是否删除成功
 */
export function deleteLedger(bookId) {
    // 至少保留一个账本
    if (ledgers.length <= 1) {
        return false;
    }

    // 找到要删除的账本
    const ledger = ledgers.find(l => l.id === bookId);
    if (!ledger) {
        return false;
    }

    // 如果是默认账本，需要先转移默认状态
    if (ledger.isDefault) {
        const anotherLedger = ledgers.find(l => l.id !== bookId);
        if (anotherLedger) {
            anotherLedger.isDefault = true;
            persistToDB(STORES.LEDGERS, anotherLedger);
        }
    }

    ledgers = ledgers.filter(l => l.id !== bookId);
    persistDeleteDB(STORES.LEDGERS, bookId);

    // 如果删除的是当前活跃账本，切换到默认账本
    if (getActiveBookId() === bookId) {
        const defaultLedger = ledgers.find(l => l.isDefault);
        if (defaultLedger) {
            setActiveBookId(defaultLedger.id);
        } else if (ledgers.length > 0) {
            setActiveBookId(ledgers[0].id);
        }
    }

    return true;
}

/**
 * 设置默认账本
 * @param {string} bookId - 账本 ID
 */
export function setDefaultBook(bookId) {
    ledgers.forEach(l => {
        l.isDefault = (l.id === bookId);
        persistToDB(STORES.LEDGERS, l);
    });
}

/**
 * 获取当前活跃账本 ID
 * @returns {string} 账本 ID
 */
export function getActiveBookId() {
    return settingsCache[ACTIVE_BOOK_KEY] || 'book_default';
}

/**
 * 设置当前活跃账本
 * @param {string} bookId - 账本 ID
 */
export function setActiveBookId(bookId) {
    settingsCache[ACTIVE_BOOK_KEY] = bookId;
    persistKV(ACTIVE_BOOK_KEY, bookId);
}

/**
 * 根据 ID 获取账本
 * @param {string} bookId - 账本 ID
 * @returns {Object|null} 账本对象
 */
export function getLedgerById(bookId) {
    return ledgers.find(l => l.id === bookId) || null;
}

/**
 * 获取账本统计信息
 * @param {string} bookId - 账本 ID
 * @returns {{ txCount: number }} 统计信息
 */
export function getLedgerStats(bookId) {
    const txCount = flatTransactions.filter(t => t.bookId === bookId).length;
    return { txCount };
}

/**
 * 迁移交易记录从一个账本到另一个账本
 * @param {string} fromBookId - 源账本 ID
 * @param {string} toBookId - 目标账本 ID
 * @returns {number} 迁移的记录数
 */
export function migrateTransactions(fromBookId, toBookId) {
    let migratedCount = 0;
    flatTransactions.forEach(t => {
        if (t.bookId === fromBookId) {
            t.bookId = toBookId;
            migratedCount++;
        }
    });

    if (migratedCount > 0) {
        // 批量持久化所有交易
        persistAll(STORES.TRANSACTIONS, flatTransactions);
    }

    return migratedCount;
}

/**
 * 迁移旧数据：为没有 bookId 的交易添加默认账本
 * 并创建默认账本（如果不存在）
 */
export function migrateLedgerData() {
    // 1. 如果没有账本数据，创建默认账本
    if (ledgers.length === 0) {
        const defaultLedger = {
            id: 'book_default',
            name: '默认账本',
            icon: 'book-outline',
            isDefault: true,
            createdAt: new Date().toISOString()
        };
        saveLedger(defaultLedger);
        setActiveBookId('book_default');
    }

    // 2. 确保有默认账本
    const hasDefault = ledgers.some(l => l.isDefault);
    if (!hasDefault && ledgers.length > 0) {
        ledgers[0].isDefault = true;
        persistToDB(STORES.LEDGERS, ledgers[0]);
    }

    // 3. 为现有交易添加 bookId（如果没有）
    let needSave = false;
    flatTransactions.forEach(t => {
        if (!t.bookId) {
            t.bookId = 'book_default';
            needSave = true;
        }
    });

    if (needSave) {
        persistAll(STORES.TRANSACTIONS, flatTransactions);
    }

    // 4. 确保有活跃账本
    if (!getActiveBookId() || !ledgers.find(l => l.id === getActiveBookId())) {
        const defaultLedger = ledgers.find(l => l.isDefault);
        if (defaultLedger) {
            setActiveBookId(defaultLedger.id);
        } else if (ledgers.length > 0) {
            setActiveBookId(ledgers[0].id);
        }
    }
}

/**
 * 获取当前活跃账本对象
 * @returns {Object|null} 活跃账本对象
 */
export function getActiveBook() {
    const activeId = getActiveBookId();
    return getLedgerById(activeId);
}

// ==================== 用户资料 ====================

/**
 * 获取用户资料
 */
export function getUserProfile() {
    const raw = settingsCache[USER_PROFILE_KEY];
    return raw ? { ...DEFAULT_PROFILE, ...raw } : { ...DEFAULT_PROFILE };
}

/**
 * 保存用户资料
 * @returns {boolean} 是否保存成功
 */
export function saveUserProfile(profile) {
    settingsCache[USER_PROFILE_KEY] = profile;
    persistKV(USER_PROFILE_KEY, profile);
    return true;
}

// ==================== AI 记开关 ====================

/**
 * AI 记功能是否开启
 */
export function isAiEnabled() {
    return settingsCache[AI_ENABLED_KEY] === true;
}

/**
 * 设置 AI 记功能开关
 * @param {boolean} enabled
 */
export function setAiEnabled(enabled) {
    settingsCache[AI_ENABLED_KEY] = enabled;
    if (enabled) {
        persistKV(AI_ENABLED_KEY, true);
    } else {
        persistDeleteKV(AI_ENABLED_KEY);
    }
}

// ==================== 前台服务开关 ====================

/**
 * 前台服务是否被禁用
 */
export function isFgServiceDisabled() {
    return settingsCache[FG_SERVICE_KEY] === true;
}

/**
 * 设置前台服务禁用状态
 * @param {boolean} disabled
 */
export function setFgServiceDisabled(disabled) {
    settingsCache[FG_SERVICE_KEY] = disabled;
    if (disabled) {
        persistKV(FG_SERVICE_KEY, true);
    } else {
        persistDeleteKV(FG_SERVICE_KEY);
    }
}

// ==================== 安装日期 ====================

/**
 * 获取安装日期
 */
export function getInstallDate() {
    return settingsCache[INSTALL_DATE_KEY] || '';
}

/**
 * 设置安装日期
 * @param {string} dateStr
 */
export function setInstallDate(dateStr) {
    settingsCache[INSTALL_DATE_KEY] = dateStr;
    persistKV(INSTALL_DATE_KEY, dateStr);
}

// ==================== 自定义分类 ====================

/**
 * 获取用户自定义分类
 */
export function getCustomCategories() {
    return settingsCache[CUSTOM_CATEGORIES_KEY] || { expense: [], income: [] };
}

/**
 * 保存自定义分类
 * @returns {boolean} 是否保存成功
 */
export function saveCustomCategories(cats) {
    settingsCache[CUSTOM_CATEGORIES_KEY] = cats;
    persistKV(CUSTOM_CATEGORIES_KEY, cats);
    return true;
}

// ==================== 批量导入 ====================

/**
 * 批量导入数据（覆盖或合并模式）
 * @param {Object} data - { transactions, accounts, ledgers, exchangeRates, installDate }
 * @param {'overwrite'|'merge'} mode
 */
export function importAllData(data, mode) {
    if (mode === 'overwrite') {
        if (data.transactions) {
            // 智能覆盖：只删除匹配账本的交易，保留未匹配账本的交易
            const importedBookIds = new Set(data.transactions.map(t => t.bookId).filter(Boolean));
            flatTransactions = flatTransactions.filter(t => !importedBookIds.has(t.bookId));
            flatTransactions.push(...data.transactions);
            sortTransactions();
            persistAll(STORES.TRANSACTIONS, flatTransactions);
        }
        if (data.accounts) {
            accounts = data.accounts;
            persistAll(STORES.ACCOUNTS, accounts);
        }
        if (data.ledgers) {
            // 智能覆盖：更新匹配账本，新增未匹配账本，保留已有但未导入的账本
            data.ledgers.forEach(newLedger => {
                const idx = ledgers.findIndex(l => l.id === newLedger.id);
                if (idx !== -1) {
                    ledgers[idx] = newLedger;
                } else {
                    ledgers.push(newLedger);
                }
            });
            persistAll(STORES.LEDGERS, ledgers);
        }
        if (data.exchangeRates) {
            settingsCache[EXCHANGE_RATES_KEY] = data.exchangeRates;
            persistKV(EXCHANGE_RATES_KEY, data.exchangeRates);
        }
        if (data.installDate) {
            settingsCache[INSTALL_DATE_KEY] = data.installDate;
            persistKV(INSTALL_DATE_KEY, data.installDate);
        }
    } else {
        // 合并模式：全部追加，不去重
        if (data.transactions && data.transactions.length > 0) {
            flatTransactions.push(...data.transactions);
            sortTransactions();
            dbBatchPut(STORES.TRANSACTIONS, data.transactions).catch(e => {
                console.error('[store] 合并交易写入失败:', e);
            });
        }
        if (data.accounts && data.accounts.length > 0) {
            accounts.push(...data.accounts);
            dbBatchPut(STORES.ACCOUNTS, data.accounts).catch(e => {
                console.error('[store] 合并账户写入失败:', e);
            });
        }
        if (data.ledgers && data.ledgers.length > 0) {
            // 账本按 id 去重（避免重复创建同名账本）
            const existingIds = new Set(ledgers.map(l => l.id));
            const newLeds = data.ledgers.filter(l => !existingIds.has(l.id));
            ledgers.push(...newLeds);
            if (newLeds.length > 0) {
                dbBatchPut(STORES.LEDGERS, newLeds).catch(e => {
                    console.error('[store] 合并账本写入失败:', e);
                });
            }
        }
        if (data.exchangeRates) {
            settingsCache[EXCHANGE_RATES_KEY] = { ...getExchangeRates(), ...data.exchangeRates };
            persistKV(EXCHANGE_RATES_KEY, settingsCache[EXCHANGE_RATES_KEY]);
        }
        if (data.installDate) {
            settingsCache[INSTALL_DATE_KEY] = data.installDate;
            persistKV(INSTALL_DATE_KEY, data.installDate);
        }
    }

    // 同步写入 localStorage 作为备份
    safeSetItem(STORAGE_KEY, JSON.stringify(flatTransactions));
    safeSetItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    safeSetItem(LEDGERS_KEY, JSON.stringify(ledgers));
    safeSetItem(EXCHANGE_RATES_KEY, JSON.stringify(settingsCache[EXCHANGE_RATES_KEY]));
    safeSetItem(INSTALL_DATE_KEY, settingsCache[INSTALL_DATE_KEY] || '');
}
