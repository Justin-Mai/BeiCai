import { loadTransactions, saveTransaction, deleteTransaction, findTransaction } from './store.js';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './categories.js';
import { 
    renderCategoryGrids, 
    renderTransactions, 
    updateHeaderSummary, 
    setupNavigation, 
    setupDateSelector, 
    initModal,
    openModalForEdit
} from './ui.js';
import { initCharts, triggerChartResize, initTimeframeSelector, renderSubTimeframe, updateChartsDataByRange } from './charts.js';

let currentSelectedMonth = "";
let currentTimeframe = "week"; // default


document.addEventListener('DOMContentLoaded', () => {
    // 1. Render dynamic category grids
    renderCategoryGrids(EXPENSE_CATEGORIES, INCOME_CATEGORIES);

    // 2. Initialize date selector
    const today = new Date();
    currentSelectedMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    setupDateSelector((newMonth) => {
        currentSelectedMonth = newMonth;
        refreshDataAndUI();
    }, currentSelectedMonth);

    // 3. Setup Navigation & List Interactions
    setupNavigation((txId) => {
        const tx = findTransaction(txId);
        if (tx) {
            openModalForEdit(tx);
        }
    }, (targetTabId) => {
        // 当切换到图表页时，初始化 eCharts，然后由于 display 切换，需手动 Resize
        if (targetTabId === 'tab-charts') {
            initCharts();
            // 在下一帧调用 resize 确保 DOM 宽高已渲染完毕
            requestAnimationFrame(() => {
                triggerChartResize();
                refreshCharts();
            });
        }
    });

    // 4. Setup Modal
    initModal(
        (newTx) => {
            saveTransaction(newTx);
            refreshDataAndUI();
            refreshCharts();
        },
        (id) => {
            deleteTransaction(id);
            refreshDataAndUI();
            refreshCharts();
        }
    );

    // 5. Setup Charts Timeframe selector
    initTimeframeSelector((newTimeframe) => {
        currentTimeframe = newTimeframe;
        refreshCharts();
    });

    // 6. Initial Load
    refreshDataAndUI();
});

function refreshDataAndUI() {
    const { groupedData, monthIncome, monthExpense } = loadTransactions(currentSelectedMonth);
    renderTransactions(groupedData);
    updateHeaderSummary(monthIncome, monthExpense);
}

function refreshCharts() {
    const { flatTransactions } = loadTransactions(currentSelectedMonth); 
    // 渲染滑动条并拉取激活的具体日期边界
    const activeRangeObj = renderSubTimeframe(currentTimeframe, flatTransactions, (newRangeObj) => {
        // 当滑动条子项被点击时重新绘制
        updateChartsDataByRange(flatTransactions, newRangeObj);
    });
    // 首次绘制
    if (activeRangeObj) {
        updateChartsDataByRange(flatTransactions, activeRangeObj);
    }
}
