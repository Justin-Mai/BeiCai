/**
 * 自定义日期/月份选择器 - 替代原生 input[type=month/date]
 */

function ensureDialogContainer() {
    let container = document.getElementById('customDialogContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'customDialogContainer';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * 打开月份选择器
 * @param {string} currentMonth - 当前月份 YYYY-MM
 * @param {Function} onConfirm - 确认回调，参数为 YYYY-MM
 */
export function openMonthPicker(currentMonth, onConfirm) {
    const container = ensureDialogContainer();

    let [year, month] = currentMonth.split('-').map(Number);

    const monthLabels = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

    // 只创建一次 DOM
    const monthHtml = monthLabels.map((m, i) => {
        const isActive = (i + 1) === month;
        return `<div class="picker-month-item ${isActive ? 'active' : ''}" data-month="${i + 1}">${m}月</div>`;
    }).join('');

    container.innerHTML = `
        <div class="dialog-overlay active">
            <div class="dialog-box" style="max-width: 340px;">
                <div class="picker-year-row">
                    <button class="picker-year-btn" id="pickerYearPrev"><ion-icon name="chevron-back-outline"></ion-icon></button>
                    <span class="picker-year-text" id="pickerYearText">${year}</span>
                    <button class="picker-year-btn" id="pickerYearNext"><ion-icon name="chevron-forward-outline"></ion-icon></button>
                </div>
                <div class="picker-month-grid" id="pickerMonthGrid">${monthHtml}</div>
                <div class="dialog-actions" style="margin-top: 16px;">
                    <button class="dialog-btn dialog-btn-cancel" id="pickerMonthCancel">取消</button>
                    <button class="dialog-btn dialog-btn-primary" id="pickerMonthOk">确定</button>
                </div>
            </div>
        </div>
    `;

    const yearText = document.getElementById('pickerYearText');
    const grid = document.getElementById('pickerMonthGrid');

    function updateActiveMonth() {
        grid.querySelectorAll('.picker-month-item').forEach(item => {
            const m = parseInt(item.getAttribute('data-month'));
            item.classList.toggle('active', m === month);
        });
    }

    // 年份切换（只更新数字）
    document.getElementById('pickerYearPrev').onclick = () => { year--; yearText.textContent = year; };
    document.getElementById('pickerYearNext').onclick = () => { year++; yearText.textContent = year; };

    // 月份选择
    grid.querySelectorAll('.picker-month-item').forEach(item => {
        item.onclick = () => {
            month = parseInt(item.getAttribute('data-month'));
            updateActiveMonth();
        };
    });

    // 取消
    document.getElementById('pickerMonthCancel').onclick = () => {
        container.innerHTML = '';
    };

    // 确定
    document.getElementById('pickerMonthOk').onclick = () => {
        const mm = String(month).padStart(2, '0');
        container.innerHTML = '';
        if (onConfirm) onConfirm(`${year}-${mm}`);
    };
}

/**
 * 打开日期选择器
 * @param {string} currentDate - 当前日期 YYYY-MM-DD
 * @param {Function} onConfirm - 确认回调，参数为 YYYY-MM-DD
 */
export function openDatePicker(currentDate, onConfirm) {
    const container = ensureDialogContainer();

    let [year, month, day] = currentDate.split('-').map(Number);

    function getDaysInMonth(y, m) {
        return new Date(y, m, 0).getDate();
    }

    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

    // 创建完整 DOM（只执行一次）
    const weekHeaderHtml = weekDays.map(d => `<div class="picker-day-header">${d}</div>`).join('');

    container.innerHTML = `
        <div class="dialog-overlay active">
            <div class="dialog-box" style="max-width: 340px;">
                <div class="picker-year-row">
                    <button class="picker-year-btn" id="pickerDateYearPrev"><ion-icon name="chevron-back-outline"></ion-icon></button>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="picker-year-text" id="pickerDateYearText">${year}</span>
                        <span class="picker-year-text">-</span>
                        <span class="picker-year-text" id="pickerDateMonthText">${String(month).padStart(2, '0')}</span>
                    </div>
                    <button class="picker-year-btn" id="pickerDateYearNext"><ion-icon name="chevron-forward-outline"></ion-icon></button>
                </div>
                <div class="picker-day-grid" id="pickerDayGrid">
                    ${weekHeaderHtml}
                </div>
                <div style="margin-top: 8px; text-align: center;">
                    <button class="dialog-btn dialog-btn-cancel" id="pickerDateToday" style="flex:none;padding:6px 16px;font-size:13px;">今天</button>
                </div>
                <div class="dialog-actions" style="margin-top: 12px;">
                    <button class="dialog-btn dialog-btn-cancel" id="pickerDateCancel">取消</button>
                    <button class="dialog-btn dialog-btn-primary" id="pickerDateOk">确定</button>
                </div>
            </div>
        </div>
    `;

    const yearText = document.getElementById('pickerDateYearText');
    const monthText = document.getElementById('pickerDateMonthText');
    const dayGrid = document.getElementById('pickerDayGrid');

    // 只重建日期格子（不重建整个弹窗）
    function updateDays() {
        const daysInMonth = getDaysInMonth(year, month);
        const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
        day = Math.min(day, daysInMonth);

        // 保留星期头，替换日期部分
        const headers = dayGrid.querySelectorAll('.picker-day-header, .picker-day-empty, .picker-day-item');
        headers.forEach(el => el.remove());

        // 空白占位
        for (let i = 0; i < firstDayOfWeek; i++) {
            const empty = document.createElement('div');
            empty.className = 'picker-day-empty';
            dayGrid.appendChild(empty);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const div = document.createElement('div');
            div.className = 'picker-day-item' + (d === day ? ' active' : '');
            div.setAttribute('data-day', d);
            div.textContent = d;
            div.onclick = () => {
                dayGrid.querySelectorAll('.picker-day-item').forEach(i => i.classList.remove('active'));
                div.classList.add('active');
                day = d;
            };
            dayGrid.appendChild(div);
        }

        yearText.textContent = year;
        monthText.textContent = String(month).padStart(2, '0');
    }

    // 初始化日期格子
    updateDays();

    // 年月切换
    document.getElementById('pickerDateYearPrev').onclick = () => {
        month--;
        if (month < 1) { month = 12; year--; }
        updateDays();
    };
    document.getElementById('pickerDateYearNext').onclick = () => {
        month++;
        if (month > 12) { month = 1; year++; }
        updateDays();
    };

    // 今天
    document.getElementById('pickerDateToday').onclick = () => {
        const today = new Date();
        year = today.getFullYear();
        month = today.getMonth() + 1;
        day = today.getDate();
        updateDays();
    };

    // 取消
    document.getElementById('pickerDateCancel').onclick = () => {
        container.innerHTML = '';
    };

    // 确定
    document.getElementById('pickerDateOk').onclick = () => {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        container.innerHTML = '';
        if (onConfirm) onConfirm(`${year}-${mm}-${dd}`);
    };
}
