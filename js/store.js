/**
 * 数据存储层
 * 专门负责 localStorage 的增删改查，不操作任何 DOM
 */

const STORAGE_KEY = 'beicai_transactions';
const ACCOUNTS_KEY = 'beicai_accounts';

let flatTransactions = [];
let accounts = [];

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
export function loadTransactions(currentSelectedMonth, filterAccountId = null) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        flatTransactions = JSON.parse(saved);
        sortTransactions();
    } else {
        // 注入演示数据
        flatTransactions = [];
        const today = new Date();
        const icons = ['restaurant-outline', 'bus-outline', 'cart-outline', 'cash-outline'];
        const titles = ['餐饮', '交通', '购物', '兼职'];

        for (let i = 0; i < 20; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - (i % 5));
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const isIncome = i % 4 === 3;

            flatTransactions.push({
                id: Date.now() - i * 10000,
                type: isIncome ? 'income' : 'expense',
                title: titles[i % 4],
                icon: icons[i % 4],
                amount: (Math.random() * 50 + 10).toFixed(2),
                date: `${yyyy}-${mm}-${dd}`,
                note: `测试数据 #${i + 1}`
            });
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(flatTransactions));
        sortTransactions();
    }

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

        if (t.type === 'income') {
            grouped[t.date].income += parseFloat(t.amount);
            monthIncome += parseFloat(t.amount);
        } else {
            grouped[t.date].expense += parseFloat(t.amount);
            monthExpense += parseFloat(t.amount);
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
 * 保存（新增/更新）一条交易
 */
export function saveTransaction(tx) {
    const existingIndex = flatTransactions.findIndex(t => t.id === tx.id);
    if (existingIndex !== -1) {
        flatTransactions[existingIndex] = tx;
    } else {
        flatTransactions.push(tx);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flatTransactions));
}

/**
 * 删除一条交易
 */
export function deleteTransaction(id) {
    flatTransactions = flatTransactions.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flatTransactions));
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
    const saved = localStorage.getItem(ACCOUNTS_KEY);
    if (saved) {
        accounts = JSON.parse(saved);
    } else {
        // 注入演示账户
        accounts = [
            { id: 'acc_1', name: '现金', type: 'cash', balance: 500.00, icon: 'wallet-outline', color: '#000000' },
            { id: 'acc_2', name: '招商银行', type: 'bank', balance: 12500.50, icon: 'card-outline', color: '#333333' },
            { id: 'acc_3', name: '支付宝', type: 'virtual', balance: 3200.00, icon: 'logo-alipay', color: '#666666' },
            { id: 'acc_4', name: '微信支付', type: 'virtual', balance: 850.20, icon: 'logo-wechat', color: '#999999' },
            { id: 'acc_5', name: '蚂蚁花呗', type: 'credit', balance: -1200.00, icon: 'layers-outline', color: '#000000' }
        ];
        localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }
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
        const convertedBalance = acc.balance * rate;

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
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * 删除一个账户
 */
export function deleteAccount(id) {
    accounts = accounts.filter(a => a.id !== id);
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/**
 * 获取“我的”页面统计信息（使用天数，连续打卡天数）
 */
export function getUsageStats() {
    let installDate = localStorage.getItem('beicai_install_date');
    if (!installDate) {
        if (flatTransactions.length > 0) {
            let earliest = flatTransactions[0].date;
            for (const t of flatTransactions) {
                if (new Date(t.date) < new Date(earliest)) {
                    earliest = t.date;
                }
            }
            installDate = earliest;
        } else {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            installDate = `${yyyy}-${mm}-${dd}`;
        }
        localStorage.setItem('beicai_install_date', installDate);
    }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const install = new Date(installDate);
    install.setHours(0,0,0,0);
    const diffTime = Math.abs(today - install);
    const daysUsed = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const uniqueDates = [...new Set(flatTransactions.map(t => t.date))].sort().reverse();
    let consecutiveDays = 0;
    
    const yyyyToday = today.getFullYear();
    const mmToday = String(today.getMonth() + 1).padStart(2, '0');
    const ddToday = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyyToday}-${mmToday}-${ddToday}`;
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    
    let currentDateToCheck = todayStr;
    if (uniqueDates.includes(todayStr)) {
        // ok
    } else if (uniqueDates.includes(yStr)) {
        currentDateToCheck = yStr;
    } else {
        return { daysUsed, consecutiveDays };
    }

    let d = new Date(currentDateToCheck);
    while (true) {
        const checkStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (uniqueDates.includes(checkStr)) {
            consecutiveDays++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }

    return { daysUsed, consecutiveDays };
}

/**
 * 获取外汇参考汇率
 */
export function getExchangeRates() {
    const saved = localStorage.getItem('beicai_exchange_rates');
    if (saved) {
        return JSON.parse(saved);
    }
    return { 'CNY': 1, 'USD': 7.20, 'HKD': 0.92 };
}

/**
 * 保存外汇参考汇率
 */
export function saveExchangeRates(rates) {
    localStorage.setItem('beicai_exchange_rates', JSON.stringify(rates));
}
