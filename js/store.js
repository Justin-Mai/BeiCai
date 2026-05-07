/**
 * 数据存储层
 * 专门负责 localStorage 的增删改查，不操作任何 DOM
 */

const STORAGE_KEY = 'beicai_transactions';
const ACCOUNTS_KEY = 'beicai_accounts';
const LEDGERS_KEY = 'beicai_ledgers';
const ACTIVE_BOOK_KEY = 'beicai_active_book';
const MAX_STORAGE_BYTES = 4.5 * 1024 * 1024; // 4.5MB 预警阈值（Android WebView 通常 5MB）

let flatTransactions = [];
let accounts = [];

/**
 * 安全写入 localStorage，捕获 QuotaExceededError
 * @returns {boolean} 是否写入成功
 */
function safeSetItem(key, value) {
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
 * 检查存储是否接近上限，返回 { used, limit, percent, warning }
 */
export function checkStorageHealth() {
    const used = getStorageUsedBytes();
    const percent = Math.round((used / MAX_STORAGE_BYTES) * 100);
    return {
        used,
        limit: MAX_STORAGE_BYTES,
        percent,
        warning: percent >= 80 ? `存储空间已使用 ${percent}%，建议导出备份后清理旧数据` : null
    };
}

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

/**
 * 加载交易数据并按月份分组
 * @param {string} currentSelectedMonth - 当前选择的月份 YYYY-MM
 * @param {string} filterAccountId - 可选：按账户 ID 过滤
 * @param {string} filterBookId - 可选：按账本 ID 过滤
 * @returns {{ flatTransactions: Array, groupedData: Array, monthIncome: number, monthExpense: number }}
 */
function safeParse(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error(`[store] 数据解析失败 (${key}):`, e.message);
        return null;
    }
}

export function loadTransactions(currentSelectedMonth, filterAccountId = null, filterBookId = null) {
    const parsed = safeParse(STORAGE_KEY);
    flatTransactions = Array.isArray(parsed) ? parsed : [];
    sortTransactions();

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

        // 如果没有明确指定账户，说明是在总账明细页，此时过滤掉”余额调整”记录，使其不影响主页明细
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
            grouped[t.date].income += amt;
            monthIncome += amt;
        } else {
            grouped[t.date].expense += amt;
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

    return { flatTransactions, groupedData, monthIncome, monthExpense };
}

/**
 * 加载全部交易数据（不分月过滤，供图表使用）
 * @param {string} filterBookId - 可选：按账本 ID 过滤
 */
export function loadAllTransactions(filterBookId = null) {
    const parsed = safeParse(STORAGE_KEY);
    let all = Array.isArray(parsed) ? parsed : [];

    // 按账本过滤
    if (filterBookId) {
        all = all.filter(t => t.bookId === filterBookId);
    }

    all.sort((a, b) => {
        if (a.date !== b.date) return new Date(b.date) - new Date(a.date);
        return b.id - a.id;
    });
    return all;
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
    safeSetItem(STORAGE_KEY, JSON.stringify(flatTransactions));
}

/**
 * 删除一条交易
 */
export function deleteTransaction(id) {
    flatTransactions = flatTransactions.filter(t => t.id !== id);
    safeSetItem(STORAGE_KEY, JSON.stringify(flatTransactions));
}

/**
 * 根据 id 查找交易
 */
export function findTransaction(id) {
    return flatTransactions.find(t => t.id === parseInt(id, 10));
}

/**
 * 加载账户数据
 */
export function loadAccounts() {
    const parsed = safeParse(ACCOUNTS_KEY);
    accounts = Array.isArray(parsed) ? parsed : [];
    return accounts;
}

/**
 * 获取资产汇总
 */
export function getAssetsSummary() {
    if (accounts.length === 0) loadAccounts();
    
    let totalAssets = 0;
    let totalLiabilities = 0;

    // 使用本地存储的外汇汇率，用于统计总资产时的折算
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
    safeSetItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * 删除一个账户
 */
export function deleteAccount(id) {
    accounts = accounts.filter(a => a.id !== id);
    safeSetItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * 获取”我的”页面统计信息（记账天数）
 */
export function getUsageStats() {
    // 记账天数 = 有交易记录的不同日期数量
    const uniqueDates = new Set(flatTransactions.map(t => t.date));
    const accountingDays = uniqueDates.size;
    return { accountingDays };
}

/**
 * 获取外汇参考汇率
 */
export function getExchangeRates() {
    const defaults = { 'CNY': 1, 'USD': 7.20, 'HKD': 0.92 };
    const saved = localStorage.getItem('beicai_exchange_rates');
    if (saved) {
        try {
            return { ...defaults, ...JSON.parse(saved) };
        } catch (e) {
            return defaults;
        }
    }
    return defaults;
}

/**
 * 保存外汇参考汇率
 */
export function saveExchangeRates(rates) {
    safeSetItem('beicai_exchange_rates', JSON.stringify(rates));
}

// ==================== 账本管理 ====================

let ledgers = [];

/**
 * 加载账本列表
 */
export function loadLedgers() {
    const parsed = safeParse(LEDGERS_KEY);
    ledgers = Array.isArray(parsed) ? parsed : [];
    return ledgers;
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
    return safeSetItem(LEDGERS_KEY, JSON.stringify(ledgers));
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
        // 找到另一个账本设为默认
        const anotherLedger = ledgers.find(l => l.id !== bookId);
        if (anotherLedger) {
            anotherLedger.isDefault = true;
        }
    }

    ledgers = ledgers.filter(l => l.id !== bookId);
    safeSetItem(LEDGERS_KEY, JSON.stringify(ledgers));

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
    });
    safeSetItem(LEDGERS_KEY, JSON.stringify(ledgers));
}

/**
 * 获取当前活跃账本 ID
 * @returns {string} 账本 ID
 */
export function getActiveBookId() {
    return localStorage.getItem(ACTIVE_BOOK_KEY) || 'book_default';
}

/**
 * 设置当前活跃账本
 * @param {string} bookId - 账本 ID
 */
export function setActiveBookId(bookId) {
    localStorage.setItem(ACTIVE_BOOK_KEY, bookId);
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
    const parsed = safeParse(STORAGE_KEY);
    const transactions = Array.isArray(parsed) ? parsed : [];
    const txCount = transactions.filter(t => t.bookId === bookId).length;
    return { txCount };
}

/**
 * 迁移交易记录从一个账本到另一个账本
 * @param {string} fromBookId - 源账本 ID
 * @param {string} toBookId - 目标账本 ID
 * @returns {number} 迁移的记录数
 */
export function migrateTransactions(fromBookId, toBookId) {
    const parsed = safeParse(STORAGE_KEY);
    const transactions = Array.isArray(parsed) ? parsed : [];

    let migratedCount = 0;
    transactions.forEach(t => {
        if (t.bookId === fromBookId) {
            t.bookId = toBookId;
            migratedCount++;
        }
    });

    if (migratedCount > 0) {
        safeSetItem(STORAGE_KEY, JSON.stringify(transactions));
        // 更新内存缓存
        flatTransactions = transactions;
    }

    return migratedCount;
}

/**
 * 迁移旧数据：为没有 bookId 的交易添加默认账本
 * 并创建默认账本（如果不存在）
 */
export function migrateLedgerData() {
    // 1. 加载账本列表
    loadLedgers();

    // 2. 如果没有账本数据，创建默认账本
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

    // 3. 确保有默认账本
    const hasDefault = ledgers.some(l => l.isDefault);
    if (!hasDefault && ledgers.length > 0) {
        ledgers[0].isDefault = true;
        safeSetItem(LEDGERS_KEY, JSON.stringify(ledgers));
    }

    // 4. 为现有交易添加 bookId（如果没有）
    const parsed = safeParse(STORAGE_KEY);
    const transactions = Array.isArray(parsed) ? parsed : [];
    let needSave = false;

    transactions.forEach(t => {
        if (!t.bookId) {
            t.bookId = 'book_default';
            needSave = true;
        }
    });

    if (needSave) {
        safeSetItem(STORAGE_KEY, JSON.stringify(transactions));
    }

    // 5. 确保有活跃账本
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
