/**
 * 数据存储层
 * 专门负责 localStorage 的增删改查，不操作任何 DOM
 */

const STORAGE_KEY = 'beicai_transactions';
const ACCOUNTS_KEY = 'beicai_accounts';
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

export function loadTransactions(currentSelectedMonth, filterAccountId = null) {
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
        // 过滤账户
        if (filterAccountId && t.accountId !== filterAccountId) return;

        // 如果没有明确指定账户，说明是在总账明细页，此时过滤掉“余额调整”记录，使其不影响主页明细
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
 */
export function loadAllTransactions() {
    const parsed = safeParse(STORAGE_KEY);
    const all = Array.isArray(parsed) ? parsed : [];
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
