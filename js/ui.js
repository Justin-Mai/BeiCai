import { createKeypadController } from './keypad.js';
import { showAlert, showConfirm, showPrompt } from './dialog.js';
import { getCategories, addCustomCategory, deleteCustomCategory, CATEGORY_ICONS } from './categories.js';
import { openMonthPicker, openDatePicker } from './date-picker.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let currentIconName = "restaurant-outline";
let currentAmount = "0";
let currentType = "expense";
let currentCategory = "餐饮";
let editingId = null;
let keypadDateValue = ''; // 记账键盘选择的完整日期 YYYY-MM-DD

const keypadController = createKeypadController();
let saveCallback = null;
let deleteCallback = null;

function renderGrid(grid, categories, isActiveFirst) {
    if (!grid) return;
    const catsHtml = categories.map((cat, index) => `
        <div class="category-item ${isActiveFirst && index === 0 ? 'active' : ''}" data-name="${cat.name}" data-icon="${cat.icon}" ${cat.id && cat.id.startsWith('custom_') ? `data-custom-id="${cat.id}"` : ''}>
            <div class="cat-icon"><ion-icon name="${cat.icon}"></ion-icon></div>
            <span>${cat.name}</span>
        </div>
    `).join('');

    const addBtnHtml = `
        <div class="category-item add-category-btn" data-type="${grid.id === 'expenseCategories' ? 'expense' : 'income'}">
            <div class="cat-icon" style="background: #f2f2f7;"><ion-icon name="add-outline"></ion-icon></div>
            <span>添加</span>
        </div>
    `;

    grid.innerHTML = catsHtml + addBtnHtml;
}

export function renderCategoryGrids() {
    const expenseGrid = document.getElementById('expenseCategories');
    const incomeGrid = document.getElementById('incomeCategories');

    renderGrid(expenseGrid, getCategories('expense'), true);
    renderGrid(incomeGrid, getCategories('income'), true);
}

/**
 * 打开图标选择器
 * @param {Function} onSelect - 回调，参数为选中的 icon name
 */
export function openIconPicker(onSelect) {
    const container = document.getElementById('customDialogContainer');
    if (!container) return;

    const iconsHtml = CATEGORY_ICONS.map(icon => `
        <div class="icon-pick-item" data-icon="${icon}">
            <ion-icon name="${icon}"></ion-icon>
        </div>
    `).join('');

    container.innerHTML = `
        <div class="dialog-overlay active">
            <div class="dialog-box" style="max-width: 90vw; max-height: 70vh; display: flex; flex-direction: column;">
                <div class="dialog-title">选择图标</div>
                <div class="icon-pick-grid" style="flex: 1; overflow-y: auto; padding: 8px 0;">
                    ${iconsHtml}
                </div>
                <div class="dialog-actions" style="margin-top: 12px;">
                    <button class="dialog-btn dialog-btn-cancel" id="iconPickCancelBtn">取消</button>
                </div>
            </div>
        </div>
    `;

    container.querySelectorAll('.icon-pick-item').forEach(item => {
        item.onclick = () => {
            const icon = item.getAttribute('data-icon');
            container.innerHTML = '';
            if (onSelect) onSelect(icon);
        };
    });

    document.getElementById('iconPickCancelBtn').onclick = () => {
        container.innerHTML = '';
    };
}

async function handleAddCustomCategory(type) {
    const name = await showPrompt('输入分类名称：', '', '新增分类');
    if (!name || !name.trim()) return;

    let selectedIcon = type === 'expense' ? 'pricetag-outline' : 'cash-outline';

    // 打开图标选择器
    await new Promise(resolve => {
        openIconPicker((icon) => {
            selectedIcon = icon;
            resolve();
        });
    });

    addCustomCategory(type, { icon: selectedIcon, name: name.trim() });
    renderCategoryGrids();
}

export function renderTransactions(groupedData) {
    const listContainer = document.getElementById('transactionList');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (groupedData.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">暂无账单数据，记一笔吧</div>';
        return;
    }

    groupedData.forEach(dayGroup => {
        const headerHtml = `
            <div class="day-header">
                <div>${dayGroup.date} ${dayGroup.day}</div>
                <div class="day-header-right">
                    ${parseFloat(dayGroup.income) > 0 ? `<span>收入: ${dayGroup.income}</span>` : ''}
                    <span>支出: ${dayGroup.expense}</span>
                </div>
            </div>
        `;

        const transactionsHtml = dayGroup.transactions.map(t => `
            <div class="transaction-item" data-id="${t.id}">
                <div class="t-icon-wrap">
                    <ion-icon name="${t.icon}"></ion-icon>
                </div>
                <div class="t-details">
                    <div class="t-title">${escapeHtml(t.title)} ${t.note ? `<span style="font-size:12px;color:#999;font-weight:normal;"> - ${escapeHtml(t.note)}</span>` : ''}</div>
                </div>
                <div class="t-amount ${t.type}">
                    ${t.type === 'expense' ? '-' : '+'}${parseFloat(t.amount || 0).toFixed(2)}
                </div>
            </div>
        `).join('');

        const groupDiv = document.createElement('div');
        groupDiv.className = 'day-group';
        groupDiv.innerHTML = headerHtml + transactionsHtml;

        listContainer.appendChild(groupDiv);
    });
}

export function updateHeaderSummary(monthIncome, monthExpense) {
    const topInc = document.getElementById('topIncomeValue');
    const topExp = document.getElementById('topExpenseValue');
    if (topInc) topInc.textContent = (monthIncome || 0).toFixed(2);
    if (topExp) topExp.textContent = (monthExpense || 0).toFixed(2);
}

/**
 * 设置滑动切换月份
 * @param {Function} onMonthChange - 回调函数，参数为新的月份字符串 YYYY-MM
 */
export function setupScrollMonthSwitch(onMonthChange) {
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;

    let isSwitching = false;
    let indicator = null;

    function showIndicator(text) {
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.className = 'month-switch-indicator';
            document.getElementById('tab-details').prepend(indicator);
        }
        indicator.textContent = text;
        indicator.classList.add('visible');
    }

    function hideIndicator() {
        if (indicator) {
            indicator.classList.remove('visible');
        }
    }

    function switchMonth(direction) {
        if (isSwitching) return;
        isSwitching = true;

        const displayYear = document.getElementById('displayYear');
        const displayMonth = document.getElementById('displayMonth');
        let year = parseInt(displayYear.textContent);
        let month = parseInt(displayMonth.textContent);

        if (direction === 'next') {
            month++;
            if (month > 12) { month = 1; year++; }
        } else {
            month--;
            if (month < 1) { month = 12; year--; }
        }

        const mm = String(month).padStart(2, '0');
        const newMonth = `${year}-${mm}`;

        displayYear.textContent = year;
        displayMonth.textContent = `${mm}月`;

        // 更新原生日期选择器的值
        const dateInput = document.getElementById('nativeDateInput');
        if (dateInput) dateInput.value = newMonth;

        showIndicator(direction === 'next' ? `${year}年${mm}月 ↓` : `${year}年${mm}月 ↑`);
        onMonthChange(newMonth);

        setTimeout(() => {
            hideIndicator();
            isSwitching = false;
        }, 800);
    }

    mainContent.addEventListener('wheel', (e) => {
        // 只在明细页面生效
        const detailsTab = document.getElementById('tab-details');
        if (!detailsTab || !detailsTab.classList.contains('active')) return;

        const scrollTop = mainContent.scrollTop;
        const scrollHeight = mainContent.scrollHeight;
        const clientHeight = mainContent.clientHeight;
        const atTop = scrollTop <= 2;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 2;

        // 向下滚到底部再滚 → 上一个月（更早）
        if (atBottom && e.deltaY > 0) {
            e.preventDefault();
            switchMonth('prev');
        }
        // 向上滚到顶部再滚 → 下一个月（更新）
        else if (atTop && e.deltaY < 0) {
            e.preventDefault();
            switchMonth('next');
        }
    }, { passive: false });

    // 触摸滑动支持
    let touchStartY = 0;
    mainContent.addEventListener('touchstart', (e) => {
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        const detailsTab = document.getElementById('tab-details');
        if (!detailsTab || !detailsTab.classList.contains('active')) return;

        const scrollTop = mainContent.scrollTop;
        const scrollHeight = mainContent.scrollHeight;
        const clientHeight = mainContent.clientHeight;
        const atTop = scrollTop <= 2;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 2;
        const touchDeltaY = e.touches[0].clientY - touchStartY;

        // 手指上滑到底部 → 上一个月
        if (atBottom && touchDeltaY < -30) {
            e.preventDefault();
            switchMonth('prev');
            touchStartY = e.touches[0].clientY;
        }
        // 手指下滑到顶部 → 下一个月
        else if (atTop && touchDeltaY > 30) {
            e.preventDefault();
            switchMonth('next');
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: false });
}

export function setupNavigation(onEditOpen, onTabChange) {
    const navItems = document.querySelectorAll('.nav-item:not(.fab-container)');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const topHeader = document.getElementById('topHeader');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            const targetTabId = item.getAttribute('data-tab');
            if (targetTabId) {
                tabPanes.forEach(pane => {
                    pane.classList.remove('active');
                    if (pane.id === targetTabId) {
                        pane.classList.add('active');
                    }
                });

                if (topHeader) {
                    if (targetTabId === 'tab-details') {
                        topHeader.classList.remove('hidden');
                    } else {
                        topHeader.classList.add('hidden');
                    }
                }
                
                if (onTabChange) {
                    onTabChange(targetTabId);
                }
            }
        });
    });

    const listContainer = document.getElementById('transactionList');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.transaction-item');
            if (item) {
                const id = item.getAttribute('data-id');
                if (id && onEditOpen) {
                    onEditOpen(parseInt(id, 10));
                }
            }
        });
    }

    const fab = document.getElementById('fabBtn');
    if (fab) {
        fab.addEventListener('click', () => {
            const btn = fab.querySelector('.fab-button');
            btn.style.transform = 'scale(0.92)';
            if (navigator.vibrate) navigator.vibrate(50);
            setTimeout(() => {
                btn.style.transform = '';
                openModalForNew();
            }, 100);
        });
    }
}

export function setupDateSelector(onMonthChange, initialMonth) {
    const displayYear = document.getElementById('displayYear');
    const displayMonth = document.getElementById('displayMonth');
    const dateSelector = document.getElementById('dateSelector');

    // 初始化显示
    const [initY, initM] = initialMonth.split('-');
    if (displayYear) displayYear.textContent = initY;
    if (displayMonth) displayMonth.textContent = `${initM}月`;

    // 点击日历图标打开自定义月份选择器
    if (dateSelector) {
        dateSelector.addEventListener('click', (e) => {
            e.preventDefault();
            const currentMonth = `${displayYear.textContent}-${displayMonth.textContent.replace('月', '')}`;
            openMonthPicker(currentMonth, (newMonth) => {
                const parts = newMonth.split('-');
                if (displayYear) displayYear.textContent = parts[0];
                if (displayMonth) displayMonth.textContent = `${parts[1]}月`;
                if (onMonthChange) onMonthChange(newMonth);
            });
        });
    }

    // 记账键盘的日期选择
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');
    const keypadDateSelector = document.querySelector('.keypad-date-selector');

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    keypadDateValue = `${yyyy}-${mm}-${dd}`;

    if (keypadDateSelector) {
        keypadDateSelector.addEventListener('click', (e) => {
            e.preventDefault();
            openDatePicker(keypadDateValue, (selected) => {
                keypadDateValue = selected;
                if (selected === `${yyyy}-${mm}-${dd}`) {
                    keypadDateDisplay.textContent = '今天';
                } else {
                    const [, m, d] = selected.split('-');
                    keypadDateDisplay.textContent = `${m}-${d}`;
                }
            });
        });
    }
}

/**
 * 获取当前键盘选择的日期值
 */
export function getKeypadDateValue() {
    if (!keypadDateValue) {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    }
    return keypadDateValue;
}

function updateAmountDisplay() {
    const amountDisplay = document.getElementById('amountDisplay');
    if (amountDisplay) amountDisplay.textContent = keypadController.getDisplayAmount();
}

function closeModal() {
    const modal = document.getElementById('addModal');
    const stepCategory = document.getElementById('stepCategory');
    const stepAmount = document.getElementById('stepAmount');
    const typeToggle = document.getElementById('modalTypeToggle');
    const noteInput = document.getElementById('txNote');
    
    if (modal) modal.classList.remove('active');
    setTimeout(() => {
        if(stepAmount) stepAmount.classList.add('hidden');
        if(stepCategory) stepCategory.classList.remove('hidden');
        if(typeToggle) typeToggle.style.visibility = 'visible';
        keypadController.reset();
        editingId = null;
        if(noteInput) noteInput.value = '';
        updateAmountDisplay();
    }, 300);
}

export function initModal(onSave, onDelete) {
    saveCallback = onSave;
    deleteCallback = onDelete;
    
    const typeBtns = document.querySelectorAll('.type-btn');
    const expenseGrid = document.getElementById('expenseCategories');
    const incomeGrid = document.getElementById('incomeCategories');
    const stepCategory = document.getElementById('stepCategory');
    const stepAmount = document.getElementById('stepAmount');
    const typeToggle = document.getElementById('modalTypeToggle');
    const selectedCatIcon = document.getElementById('selectedCatIcon');
    const selectedCatName = document.getElementById('selectedCatName');
    const noteInput = document.getElementById('txNote');
    
    // Type Toggle
    typeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentType = btn.getAttribute('data-type');
            if (currentType === 'expense') {
                if(expenseGrid) expenseGrid.classList.remove('hidden');
                if(incomeGrid) incomeGrid.classList.add('hidden');
            } else {
                if(incomeGrid) incomeGrid.classList.remove('hidden');
                if(expenseGrid) expenseGrid.classList.add('hidden');
            }
        });
    });

    // Delegated Category click + long-press delete
    let longPressTimer = null;
    let longPressTriggered = false;

    [expenseGrid, incomeGrid].forEach(grid => {
        if (!grid) return;

        // 长按删除自定义分类
        grid.addEventListener('touchstart', (e) => {
            const item = e.target.closest('.category-item');
            if (!item || item.classList.contains('add-category-btn') || !item.getAttribute('data-custom-id')) return;
            longPressTriggered = false;
            longPressTimer = setTimeout(async () => {
                longPressTriggered = true;
                const customId = item.getAttribute('data-custom-id');
                const catName = item.getAttribute('data-name');
                const type = grid.id === 'expenseCategories' ? 'expense' : 'income';
                const confirmed = await showConfirm(`确定删除自定义分类「${catName}」吗？`);
                if (confirmed) {
                    deleteCustomCategory(type, customId);
                    renderCategoryGrids();
                }
            }, 600);
        }, { passive: true });

        grid.addEventListener('touchend', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        });

        grid.addEventListener('touchmove', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        });

        grid.addEventListener('click', async (e) => {
            // 如果长按已触发，阻止后续点击
            if (longPressTriggered) { longPressTriggered = false; return; }

            const item = e.target.closest('.category-item');
            if (!item) return;

            // 点击了"添加"按钮
            if (item.classList.contains('add-category-btn')) {
                const type = item.getAttribute('data-type');
                await handleAddCustomCategory(type);
                return;
            }

            grid.querySelectorAll('.category-item').forEach(sibling => sibling.classList.remove('active'));
            item.classList.add('active');

            const iconName = item.getAttribute('data-icon') || item.querySelector('ion-icon').getAttribute('name');
            const catName = item.getAttribute('data-name') || item.querySelector('span').textContent;

            currentCategory = catName;
            currentIconName = iconName;
            if(selectedCatIcon) selectedCatIcon.setAttribute('name', iconName);
            if(selectedCatName) selectedCatName.textContent = catName;

            stepCategory.classList.add('hidden');
            stepAmount.classList.remove('hidden');
            if(typeToggle) typeToggle.style.visibility = 'hidden';

            keypadController.reset();
            updateAmountDisplay();
        });
    });

    // Back to Category
    const backToCatBtn = document.getElementById('backToCatBtn');
    if (backToCatBtn) {
        backToCatBtn.addEventListener('click', () => {
            stepAmount.classList.add('hidden');
            stepCategory.classList.remove('hidden');
            if(typeToggle) typeToggle.style.visibility = 'visible';
        });
    }

    // Keypad binding
    const numKeys = document.querySelectorAll('.num-key');
    numKeys.forEach(key => {
        key.addEventListener('click', () => {
            keypadController.handleNumKey(key.textContent);
            updateAmountDisplay();
        });
    });

    const opKeys = document.querySelectorAll('.num-operator');
    opKeys.forEach(key => {
        key.addEventListener('click', () => {
            keypadController.handleOperator(key.textContent);
            updateAmountDisplay();
        });
    });

    const keyDelete = document.getElementById('keyDelete');
    if (keyDelete) {
        keyDelete.addEventListener('click', () => {
            keypadController.handleDelete();
            updateAmountDisplay();
        });
    }

    const keyClear = document.getElementById('keyClear');
    if (keyClear) {
        keyClear.addEventListener('click', () => {
            keypadController.handleClear();
            updateAmountDisplay();
        });
    }

    const handleSave = async (closeAfter) => {
        // 如果有算式，先自动计算出结果
        if (keypadController.hasOperator()) {
            keypadController.evaluateMath();
            updateAmountDisplay();
        }

        const amountStr = keypadController.getCurrentAmount();
        if (parseFloat(amountStr) <= 0) {
            await showAlert("请输入有效金额");
            return;
        }

        let dateVal = getKeypadDateValue();

        const txId = editingId || Date.now();
        const newTx = {
            id: txId,
            type: currentType,
            title: currentCategory,
            icon: currentIconName,
            amount: amountStr,
            date: dateVal,
            note: noteInput ? noteInput.value : ''
        };

        if (saveCallback) saveCallback(newTx);

        if (closeAfter) {
            closeModal();
        } else {
            // 继续记一笔：回到分类选择页
            const stepCategory = document.getElementById('stepCategory');
            const stepAmount = document.getElementById('stepAmount');
            const typeToggle = document.getElementById('modalTypeToggle');
            
            if(stepAmount) stepAmount.classList.add('hidden');
            if(stepCategory) stepCategory.classList.remove('hidden');
            if(typeToggle) typeToggle.style.visibility = 'visible';
            
            keypadController.reset();
            updateAmountDisplay();
            if(noteInput) noteInput.value = '';
            editingId = null;
        }
    };

    const keySubmit = document.getElementById('keySubmit');
    if (keySubmit) {
        keySubmit.addEventListener('click', () => handleSave(true));
    }

    const keySubmitAnother = document.getElementById('keySubmitAnother');
    if (keySubmitAnother) {
        keySubmitAnother.addEventListener('click', () => handleSave(false));
    }

    const keyDeleteTxButton = document.getElementById('keyDeleteTxButton');
    if (keyDeleteTxButton) {
        keyDeleteTxButton.addEventListener('click', () => {
            if (editingId) {
                if (deleteCallback) deleteCallback(editingId);
                closeModal();
            }
        });
    }

    // Modal Close
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
    
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

export function openModalForNew() {
    editingId = null;
    keypadController.reset();
    
    const typeBtns = document.querySelectorAll('.type-btn');
    const expenseGrid = document.getElementById('expenseCategories');
    const incomeGrid = document.getElementById('incomeCategories');
    const stepCategory = document.getElementById('stepCategory');
    const stepAmount = document.getElementById('stepAmount');
    const typeToggle = document.getElementById('modalTypeToggle');
    const keySubmitAnother = document.getElementById('keySubmitAnother');
    const keyDeleteTxButton = document.getElementById('keyDeleteTxButton');
    const noteInput = document.getElementById('txNote');
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');
    const modal = document.getElementById('addModal');
    
    if(noteInput) noteInput.value = "";
    if (keySubmitAnother) keySubmitAnother.style.display = 'block';
    if (keyDeleteTxButton) keyDeleteTxButton.style.display = 'none';

    typeBtns.forEach(b => b.classList.remove('active'));
    if (typeBtns[0]) typeBtns[0].classList.add('active');
    currentType = 'expense';
    
    if (expenseGrid) {
        expenseGrid.classList.remove('hidden');
        // Select first real category (skip "添加" button)
        const items = expenseGrid.querySelectorAll('.category-item:not(.add-category-btn)');
        items.forEach(i => i.classList.remove('active'));
        if (items.length > 0) {
            items[0].classList.add('active');
            currentCategory = items[0].getAttribute('data-name') || items[0].querySelector('span').textContent;
            currentIconName = items[0].getAttribute('data-icon') || items[0].querySelector('ion-icon').getAttribute('name');
        }
    }
    if (incomeGrid) incomeGrid.classList.add('hidden');

    if (stepAmount) stepAmount.classList.add('hidden');
    if (stepCategory) stepCategory.classList.remove('hidden');
    if (typeToggle) typeToggle.style.visibility = 'visible';

    // set today
    const today2 = new Date();
    keypadDateValue = `${today2.getFullYear()}-${String(today2.getMonth() + 1).padStart(2, '0')}-${String(today2.getDate()).padStart(2, '0')}`;
    if (keypadDateDisplay) {
        keypadDateDisplay.textContent = '今天';
    }

    updateAmountDisplay();
    if (modal) modal.classList.add('active');
}

export function openModalForEdit(tx) {
    editingId = tx.id;
    keypadController.setAmount(tx.amount.toString());
    currentType = tx.type;
    currentCategory = tx.title;
    currentIconName = tx.icon;

    const typeBtns = document.querySelectorAll('.type-btn');
    const stepCategory = document.getElementById('stepCategory');
    const stepAmount = document.getElementById('stepAmount');
    const typeToggle = document.getElementById('modalTypeToggle');
    const keySubmitAnother = document.getElementById('keySubmitAnother');
    const keyDeleteTxButton = document.getElementById('keyDeleteTxButton');
    const noteInput = document.getElementById('txNote');
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');
    const selectedCatIcon = document.getElementById('selectedCatIcon');
    const selectedCatName = document.getElementById('selectedCatName');
    const modal = document.getElementById('addModal');

    if (noteInput) noteInput.value = tx.note || "";

    if (keypadDateDisplay) {
        const [, m, d] = tx.date.split('-');
        const today = new Date();
        const ty = today.getFullYear(), tm = String(today.getMonth() + 1).padStart(2, '0'), td = String(today.getDate()).padStart(2, '0');
        if (tx.date === `${ty}-${tm}-${td}`) {
            keypadDateDisplay.textContent = '今天';
        } else {
            keypadDateDisplay.textContent = `${m}-${d}`;
        }
    }

    if (selectedCatIcon) selectedCatIcon.setAttribute('name', currentIconName);
    if (selectedCatName) selectedCatName.textContent = currentCategory;

    // Type toggles sync UI
    typeBtns.forEach(b => b.classList.remove('active'));
    if(currentType === 'expense' && typeBtns.length > 0) {
        typeBtns[0].classList.add('active');
    } else if(currentType === 'income' && typeBtns.length > 1) {
        typeBtns[1].classList.add('active');
    }

    if (stepCategory) stepCategory.classList.add('hidden');
    if (stepAmount) stepAmount.classList.remove('hidden');
    if (typeToggle) typeToggle.style.visibility = 'hidden';

    if (keySubmitAnother) keySubmitAnother.style.display = 'none';
    if (keyDeleteTxButton) keyDeleteTxButton.style.display = 'block';
    
    updateAmountDisplay();
    if (modal) modal.classList.add('active');
}
