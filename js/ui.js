import { createKeypadController } from './keypad.js';

let currentIconName = "restaurant-outline";
let currentAmount = "0";
let currentType = "expense";
let currentCategory = "餐饮";
let editingId = null;

const keypadController = createKeypadController();
let saveCallback = null;
let deleteCallback = null;

// Exported UI functions

export function renderCategoryGrids(expenseCategories, incomeCategories) {
    const expenseGrid = document.getElementById('expenseCategories');
    const incomeGrid = document.getElementById('incomeCategories');

    if (expenseGrid) {
        expenseGrid.innerHTML = expenseCategories.map((cat, index) => `
            <div class="category-item ${index === 0 ? 'active' : ''}">
                <div class="cat-icon"><ion-icon name="${cat.icon}"></ion-icon></div>
                <span>${cat.name}</span>
            </div>
        `).join('');
    }

    if (incomeGrid) {
        incomeGrid.innerHTML = incomeCategories.map((cat, index) => `
            <div class="category-item ${index === 0 ? 'active' : ''}">
                <div class="cat-icon"><ion-icon name="${cat.icon}"></ion-icon></div>
                <span>${cat.name}</span>
            </div>
        `).join('');
    }
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
                    <div class="t-title">${t.title} ${t.note ? `<span style="font-size:12px;color:#999;font-weight:normal;"> - ${t.note}</span>` : ''}</div>
                </div>
                <div class="t-amount ${t.type}">
                    ${t.type === 'expense' ? '-' : '+'}${parseFloat(t.amount).toFixed(2)}
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
    if (topInc) topInc.textContent = monthIncome.toFixed(2);
    if (topExp) topExp.textContent = monthExpense.toFixed(2);
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
    const dateInput = document.getElementById('nativeDateInput');
    const displayYear = document.getElementById('displayYear');
    const displayMonth = document.getElementById('displayMonth');

    if (dateInput) {
        const [initY, initM] = initialMonth.split('-');
        dateInput.value = initialMonth;
        if (displayYear) displayYear.textContent = initY;
        if (displayMonth) displayMonth.textContent = `${initM}月`;

        dateInput.addEventListener('change', (e) => {
            const selectedDate = e.target.value; 
            if (selectedDate) {
                const parts = selectedDate.split('-');
                if (parts.length === 2 && onMonthChange) {
                    if (displayYear) displayYear.textContent = parts[0];
                    if (displayMonth) displayMonth.textContent = `${parts[1]}月`;
                    onMonthChange(selectedDate);
                }
            }
        });
    }

    const keypadDateInput = document.getElementById('keypadDateInput');
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');
    if (keypadDateInput && keypadDateDisplay) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        keypadDateInput.value = `${yyyy}-${mm}-${dd}`;

        keypadDateInput.addEventListener('change', (e) => {
            const selected = e.target.value;
            if (selected) {
                const [y, m, d] = selected.split('-');
                if (selected === `${yyyy}-${mm}-${dd}`) {
                    keypadDateDisplay.textContent = '今天';
                } else {
                    keypadDateDisplay.textContent = `${m}-${d}`;
                }
            }
        });
    }
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
    const keypadDateInput = document.getElementById('keypadDateInput');
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

    // Delegated Category click
    [expenseGrid, incomeGrid].forEach(grid => {
        if (!grid) return;
        grid.addEventListener('click', (e) => {
            const item = e.target.closest('.category-item');
            if (item) {
                grid.querySelectorAll('.category-item').forEach(sibling => sibling.classList.remove('active'));
                item.classList.add('active');
                
                const iconName = item.querySelector('ion-icon').getAttribute('name');
                const catName = item.querySelector('span').textContent;
                
                currentCategory = catName;
                currentIconName = iconName;
                if(selectedCatIcon) selectedCatIcon.setAttribute('name', iconName);
                if(selectedCatName) selectedCatName.textContent = catName;

                stepCategory.classList.add('hidden');
                stepAmount.classList.remove('hidden');
                if(typeToggle) typeToggle.style.visibility = 'hidden';
                
                keypadController.reset();
                updateAmountDisplay();
            }
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

    const handleSave = (closeAfter) => {
        // 如果有算式，先自动计算出结果
        if (keypadController.hasOperator()) {
            keypadController.evaluateMath();
            updateAmountDisplay();
        }

        const amountStr = keypadController.getCurrentAmount();
        if (parseFloat(amountStr) <= 0) {
            alert("请输入有效金额");
            return;
        }

        let dateVal = keypadDateInput ? keypadDateInput.value : '';
        if (!dateVal) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateVal = `${yyyy}-${mm}-${dd}`;
        }

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
    const keypadDateInput = document.getElementById('keypadDateInput');
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
        // Select first active
        const items = expenseGrid.querySelectorAll('.category-item');
        items.forEach(i => i.classList.remove('active'));
        if (items.length > 0) {
            items[0].classList.add('active');
            currentCategory = items[0].querySelector('span').textContent;
            currentIconName = items[0].querySelector('ion-icon').getAttribute('name');
        }
    }
    if (incomeGrid) incomeGrid.classList.add('hidden');

    if (stepAmount) stepAmount.classList.add('hidden');
    if (stepCategory) stepCategory.classList.remove('hidden');
    if (typeToggle) typeToggle.style.visibility = 'visible';

    // set today
    if (keypadDateInput && keypadDateDisplay) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        keypadDateInput.value = `${yyyy}-${mm}-${dd}`;
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
    const keypadDateInput = document.getElementById('keypadDateInput');
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');
    const selectedCatIcon = document.getElementById('selectedCatIcon');
    const selectedCatName = document.getElementById('selectedCatName');
    const modal = document.getElementById('addModal');

    if (noteInput) noteInput.value = tx.note || "";

    if (keypadDateInput && keypadDateDisplay) {
        keypadDateInput.value = tx.date;
        const [y, m, d] = tx.date.split('-');
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
