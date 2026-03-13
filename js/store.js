/**
 * 数据存储层
 * 专门负责 localStorage 的增删改查，不操作任何 DOM
 */

const STORAGE_KEY = 'beicai_transactions';

let flatTransactions = [];

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
 * @returns {{ flatTransactions: Array, groupedData: Array, monthIncome: number, monthExpense: number }}
 */
export function loadTransactions(currentSelectedMonth) {
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
        if (t.date.startsWith(currentSelectedMonth)) {
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
