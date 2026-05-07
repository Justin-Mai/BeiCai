import { loadTransactions, loadAllTransactions, saveTransaction, deleteTransaction, findTransaction, migrateLedgerData, getActiveBookId } from './store.js';
import {
    renderCategoryGrids,
    renderTransactions,
    updateHeaderSummary,
    setupNavigation,
    setupDateSelector,
    setupScrollMonthSwitch,
    initModal,
    openModalForEdit,
    openModalForNew
} from './ui.js';
import { initCharts, triggerChartResize, initTimeframeSelector, renderSubTimeframe, updateChartsDataByRange } from './charts.js';
import { renderAssets } from './assets.js';
import { renderMineTab } from './mine.js';

let currentSelectedMonth = "";
let currentTimeframe = "week"; // default


document.addEventListener('DOMContentLoaded', async () => {
    // 0. 迁移账本数据（创建默认账本，为现有交易添加 bookId）
    migrateLedgerData();

    // 1. Render dynamic category grids
    renderCategoryGrids();

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
        } else if (targetTabId === 'tab-assets') {
            renderAssets();
        } else if (targetTabId === 'tab-mine') {
            renderMineTab();
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

    // 监听收支维度切换
    window.addEventListener('chart-type-changed', () => {
        refreshCharts(false);
    });

    // 监听数据导入完成
    window.addEventListener('data-imported', () => {
        refreshDataAndUI();
        refreshCharts();
    });

    // 监听账本切换
    window.addEventListener('book-changed', () => {
        refreshDataAndUI();
        refreshCharts();
    });

    // 监听从通知按钮打开记账弹窗
    window.addEventListener('open-add-modal', () => {
        openModalForNew();
    });

    // 6. Initial Load
    refreshDataAndUI();

    // 7. 启动前台服务保活 (仅安卓平台)
    startForegroundService();

    // 7. Setup scroll to switch month
    setupScrollMonthSwitch((newMonth) => {
        currentSelectedMonth = newMonth;
        refreshDataAndUI();
    });

    // 8. 预请求通知权限 (仅安卓平台)
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Foreground) {
        try {
            await window.Capacitor.Plugins.Foreground.requestPermission();
        } catch (e) {
            // 忽略权限请求失败
        }
    }
});

function refreshDataAndUI() {
    const activeBookId = getActiveBookId();
    const { groupedData, monthIncome, monthExpense } = loadTransactions(currentSelectedMonth, null, activeBookId);
    renderTransactions(groupedData);
    updateHeaderSummary(monthIncome, monthExpense);
    renderAssets();
}

function refreshCharts(shouldScroll = true) {
    const activeBookId = getActiveBookId();
    const flatTransactions = loadAllTransactions(activeBookId);
    // 渲染滑动条并拉取激活的具体日期边界
    const activeRangeObj = renderSubTimeframe(currentTimeframe, flatTransactions, (newRangeObj) => {
        // 当滑动条子项被点击时重新绘制
        updateChartsDataByRange(flatTransactions, newRangeObj);
    }, shouldScroll);
    // 首次绘制
    if (activeRangeObj) {
        updateChartsDataByRange(flatTransactions, activeRangeObj);
    }
}

/**
 * 启动前台服务 (仅安卓平台)
 * 在状态栏显示常驻通知，保持应用后台存活
 */
async function startForegroundService() {
    try {
        // 检查是否在安卓平台，且用户未手动关闭
        const fgDisabled = localStorage.getItem('beicai_fg_service_disabled');
        if (fgDisabled === 'true') return;

        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Foreground) {
            const aiEnabled = localStorage.getItem('beicai_ai_enabled') === 'true';
            await window.Capacitor.Plugins.Foreground.start({
                title: '贝才',
                content: '记账服务运行中'
            });
            // 恢复 AI 记状态
            if (aiEnabled) {
                await window.Capacitor.Plugins.Foreground.updateNotification({ showAi: true });
            }
        }
    } catch (e) {
        console.warn('启动前台服务失败:', e);
    }
}
