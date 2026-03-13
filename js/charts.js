import { EXPENSE_CATEGORIES } from './categories.js';

let expensePieChart = null;
let trendChart = null;

export function initCharts() {
    const pieDom = document.getElementById('expensePieChart');
    const trendDom = document.getElementById('trendChart');

    if (pieDom && !expensePieChart) {
        expensePieChart = echarts.init(pieDom);
    }
    if (trendDom && !trendChart) {
        trendChart = echarts.init(trendDom);
    }
    
    window.addEventListener('resize', () => {
        if (expensePieChart) expensePieChart.resize();
        if (trendChart) trendChart.resize();
    });
}

export function triggerChartResize() {
    if (expensePieChart) expensePieChart.resize();
    if (trendChart) trendChart.resize();
}

/**
 * 获取年份的第几周 (ISO 8601)
 */
function getWeekNumber(d) {
    const date = new Date(d.getTime());
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getNaturalWeekRange(offset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    today.setDate(today.getDate() - offset * 7); // 偏移
    const dayOfWeek = today.getDay(); 
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    
    const dates = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${day}`);
    }
    return { dates, label: `${dates[0]} 至 ${dates[6]}` };
}

function getMonthRange(offset = 0) {
    const today = new Date();
    let y = today.getFullYear();
    let m = today.getMonth() - offset;
    while (m < 0) {
        m += 12;
        y -= 1;
    }
    
    const lastDay = new Date(y, m + 1, 0).getDate();
    const dates = [];
    for (let i = 1; i <= lastDay; i++) {
        const mm = String(m + 1).padStart(2, '0');
        const dd = String(i).padStart(2, '0');
        dates.push(`${y}-${mm}-${dd}`);
    }
    return { dates, label: `${y}年${String(m + 1).padStart(2, '0')}月` };
}

function getQuarterRange(offset = 0) {
    const today = new Date();
    let y = today.getFullYear();
    let q = Math.floor(today.getMonth() / 3) - offset;
    while (q < 0) {
        q += 4;
        y -= 1;
    }
    
    let qStart = q * 3 + 1; // 1, 4, 7, 10
    let labelText = q === 0 ? "第一季度" : q === 1 ? "第二季度" : q === 2 ? "第三季度" : "第四季度";
    
    const months = [];
    for (let i = 0; i < 3; i++) {
        months.push(`${y}-${String(qStart + i).padStart(2, '0')}`);
    }
    return { months, label: `${y}年 ${labelText}` };
}

function getYearRange(offset = 0) {
    const today = new Date();
    let y = today.getFullYear() - offset;
    const months = [];
    for (let i = 1; i <= 12; i++) {
        months.push(`${y}-${String(i).padStart(2, '0')}`);
    }
    return { months, label: `${y}年 全年` };
}

// ============== 渲染滑动的时期列表 ==============

let currentSubTimeframeOffset = 0; // 当前选中的偏移量 0代表本周/本月

function getEarliestDateStr(flatTransactions) {
    if (!flatTransactions || flatTransactions.length === 0) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }
    // flatTransactions 已经按 date 降序排列，数组最后一项是最早的日期
    return flatTransactions[flatTransactions.length - 1].date;
}

function generatePeriods(timeframe, flatTransactions) {
    const periods = [];
    const earliestDateStr = getEarliestDateStr(flatTransactions);
    const maxPeriods = 100; // 最多往前推 100 个周期，防止极端死循环
    
    let i = 0;
    while (i < maxPeriods) {
        let label = '';
        let rangeObj = null;
        
        let rangeStartStr = '';
        
        if (timeframe === 'week') {
            rangeObj = getNaturalWeekRange(i);
            rangeObj.type = 'daily';
            const rangeYear = parseInt(rangeObj.dates[0].substring(0, 4));
            const todayYear = new Date().getFullYear();
            if (i === 0) label = "本周";
            else if (i === 1) label = "上周";
            else {
                const w = getWeekNumber(new Date(rangeObj.dates[0]));
                if (rangeYear === todayYear) {
                    label = `${String(w).padStart(2, '0')}周`;
                } else {
                    label = `${rangeYear}年${String(w).padStart(2, '0')}周`;
                }
            }
            rangeStartStr = rangeObj.dates[0];
        } else if (timeframe === 'month') {
            rangeObj = getMonthRange(i);
            rangeObj.type = 'daily';
            const rangeYear = parseInt(rangeObj.dates[0].substring(0, 4));
            const rangeMonth = rangeObj.dates[0].substring(5, 7);
            const todayYear = new Date().getFullYear();
            if (i === 0) label = "本月";
            else if (i === 1) label = "上月";
            else {
                if (rangeYear === todayYear) label = `${rangeMonth}月`;
                else label = `${rangeYear}年${rangeMonth}月`;
            }
            rangeStartStr = rangeObj.dates[0];
        } else if (timeframe === 'quarter') {
            rangeObj = getQuarterRange(i);
            rangeObj.type = 'monthly';
            const rangeYear = parseInt(rangeObj.months[0].substring(0, 4));
            const qNum = Math.floor((parseInt(rangeObj.months[0].substring(5, 7)) - 1) / 3) + 1;
            const todayYear = new Date().getFullYear();
            if (i === 0) label = "本季";
            else if (i === 1) label = "上季";
            else {
                if (rangeYear === todayYear) label = `第${qNum}季`;
                else label = `${rangeYear}年第${qNum}季`;
            }
            rangeStartStr = rangeObj.months[0] + '-01';
        } else if (timeframe === 'year') {
            rangeObj = getYearRange(i);
            rangeObj.type = 'monthly';
            const rangeYear = rangeObj.months[0].substring(0, 4);
            if (i === 0) label = "今年";
            else if (i === 1) label = "去年";
            else label = `${rangeYear}年`;
            rangeStartStr = rangeObj.months[0] + '-01';
        }
        
        // 倒序插入，确保近期在最右边
        periods.unshift({
            id: `${timeframe}-${i}`,
            label,
            rangeObj: rangeObj,
            offset: i
        });

        // 判断当前周期是否已经早于等于最早的一笔账单的月份/周
        let rangeEndStr = '';
        if (rangeObj.type === 'daily') {
            rangeEndStr = rangeObj.dates[rangeObj.dates.length - 1];
        } else {
            const lastMonth = rangeObj.months[rangeObj.months.length - 1];
            const [y, m] = lastMonth.split('-');
            const lastDay = new Date(y, m, 0).getDate();
            rangeEndStr = `${lastMonth}-${String(lastDay).padStart(2, '0')}`;
        }

        // 只要 rangeStart 已经早于或等于最早一笔交易日期，就不再往前推了  
        // 也可以放宽到 rangeEndStr，只要包含就算最后一条
        if (rangeStartStr <= earliestDateStr) {
            break;
        }

        i++;
    }
    return periods;
}

export function renderSubTimeframe(timeframe, flatTransactions, onSelect) {
    const container = document.getElementById('subTimeScroll');
    if (!container) return;
    
    container.style.display = 'flex'; // Ensure visible

    const periods = generatePeriods(timeframe, flatTransactions);
    
    // Safety check for offset
    if (!periods.find(p => p.offset === currentSubTimeframeOffset)) {
        currentSubTimeframeOffset = 0;
    }
    
    container.innerHTML = periods.map(p => `
        <div class="sub-time-item ${p.offset === currentSubTimeframeOffset ? 'active' : ''}" data-offset="${p.offset}">
            ${p.label}
        </div>
    `).join('');
    
    // Auto scroll to active item
    setTimeout(() => {
        const activeItem = container.querySelector('.sub-time-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
        }
    }, 10);
    
    // Binding
    container.querySelectorAll('.sub-time-item').forEach(el => {
        el.addEventListener('click', () => {
            container.querySelectorAll('.sub-time-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            currentSubTimeframeOffset = parseInt(el.getAttribute('data-offset'), 10);
            
            const selectedPeriod = periods.find(p => p.offset === currentSubTimeframeOffset);
            if (onSelect) onSelect(selectedPeriod.rangeObj);
            
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
    });
    
    const activePeriod = periods.find(p => p.offset === currentSubTimeframeOffset);
    return activePeriod ? activePeriod.rangeObj : periods[periods.length - 1].rangeObj;
}

// ============== 图表绘制 ==============

function buildPieData(filteredTx) {
    const catMap = {};
    filteredTx.forEach(t => {
        if (t.type === 'expense') {
            catMap[t.title] = (catMap[t.title] || 0) + parseFloat(t.amount);
        }
    });

    const data = Object.keys(catMap).map(k => ({
        name: k,
        value: catMap[k].toFixed(2)
    }));
    
    data.sort((a, b) => b.value - a.value);
    return data;
}

export function updateChartsDataByRange(allFlatTransactions, rangeObj) {
    if (!expensePieChart || !trendChart || !rangeObj) return;
    
    const dateSummaryObj = document.getElementById('chartDateSummary');
    if (dateSummaryObj) dateSummaryObj.textContent = rangeObj.label;
    
    let filteredTx = [];
    let xAxisData = [];
    let incomeSeries = [];
    let expenseSeries = [];

    // ====== 1. 根据 rangeObj 构建 X 轴与过滤数据 ======
    if (rangeObj.type === 'daily') {
        xAxisData = rangeObj.dates.map(d => d.slice(-5)); // MM-DD
        
        const dataMap = {};
        rangeObj.dates.forEach(d => dataMap[d] = { inc: 0, exp: 0 });
        
        allFlatTransactions.forEach(t => {
            if (dataMap[t.date] !== undefined) {
                filteredTx.push(t);
                if(t.type === 'income') dataMap[t.date].inc += parseFloat(t.amount);
                else dataMap[t.date].exp += parseFloat(t.amount);
            }
        });
        
        rangeObj.dates.forEach(d => {
            incomeSeries.push(dataMap[d].inc.toFixed(2));
            expenseSeries.push(dataMap[d].exp.toFixed(2));
        });

    } else if (rangeObj.type === 'monthly') {
        xAxisData = rangeObj.months.map(m => m.split('-')[1] + '月'); // MM月
        
        const dataMap = {};
        rangeObj.months.forEach(m => dataMap[m] = { inc: 0, exp: 0 });
        
        allFlatTransactions.forEach(t => {
            const ym = t.date.substring(0, 7); 
            if (dataMap[ym] !== undefined) {
                filteredTx.push(t);
                if(t.type === 'income') dataMap[ym].inc += parseFloat(t.amount);
                else dataMap[ym].exp += parseFloat(t.amount);
            }
        });
        
        rangeObj.months.forEach(m => {
            incomeSeries.push(dataMap[m].inc.toFixed(2));
            expenseSeries.push(dataMap[m].exp.toFixed(2));
        });
    }

    // ====== 2. 更新分类饼状图 ======
    const pieData = buildPieData(filteredTx);
    
    const pieOption = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: {
            top: 'bottom',
            icon: 'circle',
            itemWidth: 10,
            itemHeight: 10,
            textStyle: { fontSize: 12, color: '#666' }
        },
        color: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7CAC9', '#92A8D1', '#034F84'],
        series: [
            {
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '42%'],
                avoidLabelOverlap: false,
                itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
                label: { show: false, position: 'center' },
                emphasis: { label: { show: true, fontSize: '18', fontWeight: 'bold' } },
                labelLine: { show: false },
                data: pieData.length > 0 ? pieData : [{ name: '暂无明细', value: 0 }]
            }
        ]
    };
    expensePieChart.setOption(pieOption);

    // ====== 3. 更新趋势对比柱状图/折线图 ======
    const trendOption = {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: {
            data: ['支出', '收入'],
            top: 0,
            icon: 'rect',
            itemWidth: 12,
            itemHeight: 12
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'category',
            data: xAxisData,
            axisTick: { alignWithLabel: true },
            axisLine: { lineStyle: { color: '#E5E5EA' } },
            axisLabel: { color: '#8E8E93' }
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: '#F2F2F7', type: 'dashed' } },
            axisLabel: { color: '#8E8E93' }
        },
        series: [
            {
                name: '支出',
                type: 'bar',
                barMaxWidth: 20,
                itemStyle: { borderRadius: [4, 4, 0, 0], color: '#111' },
                data: expenseSeries
            },
            {
                name: '收入',
                type: 'bar',
                barMaxWidth: 20,
                itemStyle: { borderRadius: [4, 4, 0, 0], color: '#bbb' },
                data: incomeSeries
            }
        ]
    };
    trendChart.setOption(trendOption);
}

// 初始化顶部的大 Segment 切换
export function initTimeframeSelector(onTimeframeChange) {
    const btns = document.querySelectorAll('.time-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            btns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const tf = e.target.getAttribute('data-time');
            if(onTimeframeChange) onTimeframeChange(tf);
        });
    });
}
