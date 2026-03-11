// Data Persistence
let flatTransactions = []; // Store raw transactions
let data = []; // Grouped for UI
let currentSelectedMonth = ""; // Global selected month YYYY-MM

function loadTransactions() {
    const saved = localStorage.getItem('beicai_transactions');
    if (saved) {
        flatTransactions = JSON.parse(saved);

        // Sort descending by date, then sort by id (rough time sort)
        flatTransactions.sort((a, b) => {
            if (a.date !== b.date) {
                return new Date(b.date) - new Date(a.date);
            }
            return b.id - a.id;
        });

    } else {
        // Inject Dummy Data to demonstrate scrolling
        flatTransactions = [];
        const today = new Date();
        const icons = ['restaurant-outline', 'bus-outline', 'cart-outline', 'cash-outline'];
        const titles = ['餐饮', '交通', '购物', '兼职'];

        for (let i = 0; i < 20; i++) {
            // Spread across the last 5 days
            const d = new Date(today);
            d.setDate(d.getDate() - (i % 5));
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');

            const isIncome = i % 4 === 3; // Every 4th item is income

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
        // Save dummy data natively so it acts as standard loaded data
        localStorage.setItem('beicai_transactions', JSON.stringify(flatTransactions));

        // Ensure it's sorted
        flatTransactions.sort((a, b) => {
            if (a.date !== b.date) {
                return new Date(b.date) - new Date(a.date);
            }
            return b.id - a.id;
        });
    }

    // Group by Date for rendering AND calculate monthly totals
    data = [];
    const grouped = {};
    let monthIncome = 0;
    let monthExpense = 0;

    // Fallback if not set
    if (!currentSelectedMonth) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        currentSelectedMonth = `${yyyy}-${mm}`;
    }

    flatTransactions.forEach(t => {
        // Only include in grouped data if it matches current selected month
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

    // Convert to array
    for (const date in grouped) {
        // format numbers
        grouped[date].income = grouped[date].income.toFixed(2);
        grouped[date].expense = grouped[date].expense.toFixed(2);
        data.push(grouped[date]);
    }

    // Update Header DOM
    const topInc = document.getElementById('topIncomeValue');
    const topExp = document.getElementById('topExpenseValue');
    if (topInc) topInc.textContent = monthIncome.toFixed(2);
    if (topExp) topExp.textContent = monthExpense.toFixed(2);
}

function getDayOfWeek(dateString) {
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "未知";
    return days[d.getDay()];
}

function saveTransaction(tx) {
    const existingIndex = flatTransactions.findIndex(t => t.id === tx.id);
    if (existingIndex !== -1) {
        flatTransactions[existingIndex] = tx;
    } else {
        flatTransactions.push(tx);
    }
    localStorage.setItem('beicai_transactions', JSON.stringify(flatTransactions));
    loadTransactions(); // Regroup
    renderTransactions(); // Update UI
}

function deleteTransaction(id) {
    flatTransactions = flatTransactions.filter(t => t.id !== id);
    localStorage.setItem('beicai_transactions', JSON.stringify(flatTransactions));
    loadTransactions();
    renderTransactions();
}

function renderTransactions() {
    const listContainer = document.getElementById('transactionList');
    listContainer.innerHTML = '';

    if (data.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary);">暂无账单数据，记一笔吧</div>';
        return;
    }

    data.forEach(dayGroup => {
        // Create Day Header (Restored with summaries)
        const headerHtml = `
            <div class="day-header">
                <div>${dayGroup.date} ${dayGroup.day}</div>
                <div class="day-header-right">
                    ${parseFloat(dayGroup.income) > 0 ? `<span>收入: ${dayGroup.income}</span>` : ''}
                    <span>支出: ${dayGroup.expense}</span>
                </div>
            </div>
        `;

        // Create Transactions HTML
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

// Add interaction to bottom nav
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item:not(.fab-container)');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const topHeader = document.getElementById('topHeader');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();

            // 1. Update active state on nav icons
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            // 2. Switch tab content
            const targetTabId = item.getAttribute('data-tab');
            if (targetTabId) {
                tabPanes.forEach(pane => {
                    pane.classList.remove('active');
                    if (pane.id === targetTabId) {
                        pane.classList.add('active');
                    }
                });

                // 3. Toggle Header Visibility (Only show on Details Tab)
                if (topHeader) {
                    if (targetTabId === 'tab-details') {
                        topHeader.classList.remove('hidden');
                    } else {
                        topHeader.classList.add('hidden');
                    }
                }
            }
        });
    });

    // Transaction List Click -> Edit
    const listContainer = document.getElementById('transactionList');
    if (listContainer) {
        listContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.transaction-item');
            if (item) {
                const id = item.getAttribute('data-id');
                if (id && window.openModalForEdit) {
                    const tx = flatTransactions.find(t => t.id === parseInt(id, 10));
                    if (tx) {
                        window.openModalForEdit(tx);
                    }
                }
            }
        });
    }

    // Setup FAB and Modal
    const fab = document.getElementById('fabBtn');
    const modal = document.getElementById('addModal');
    const closeBtn = document.getElementById('closeModalBtn');

    if (fab && modal) {
        fab.addEventListener('click', () => {
            const btn = fab.querySelector('.fab-button');
            btn.style.transform = 'scale(0.92)';

            if (navigator.vibrate) {
                navigator.vibrate(50);
            }

            setTimeout(() => {
                btn.style.transform = '';
                if (window.openModalForNew) window.openModalForNew();
            }, 100);
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }
}

function setupDateSelector() {
    const dateInput = document.getElementById('nativeDateInput');
    const displayYear = document.getElementById('displayYear');
    const displayMonth = document.getElementById('displayMonth');

    if (dateInput) {
        // Initialize header to current selected month
        if (!currentSelectedMonth) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            currentSelectedMonth = `${yyyy}-${mm}`;
        }

        const [initY, initM] = currentSelectedMonth.split('-');
        dateInput.value = currentSelectedMonth;
        if (displayYear) displayYear.textContent = initY;
        if (displayMonth) displayMonth.textContent = `${initM}月`;

        // Listen for changes
        dateInput.addEventListener('change', (e) => {
            const selectedDate = e.target.value; // YYYY-MM format
            if (selectedDate) {
                const parts = selectedDate.split('-');
                if (parts.length === 2) {
                    currentSelectedMonth = selectedDate;
                    if (displayYear) displayYear.textContent = parts[0];
                    if (displayMonth) displayMonth.textContent = `${parts[1]}月`;

                    // Reload & Render based on new month
                    loadTransactions();
                    renderTransactions();
                }
            }
        });
    }

    // Also set default date for keypad date selector to today
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
                // Simple today logic check
                if (selected === `${yyyy}-${mm}-${dd}`) {
                    keypadDateDisplay.textContent = '今天';
                } else {
                    keypadDateDisplay.textContent = `${m}-${d}`;
                }
            }
        });
    }
}

function setupAddTransactionModal() {
    // UI Elements
    const typeBtns = document.querySelectorAll('.type-btn');
    const expenseGrid = document.getElementById('expenseCategories');
    const incomeGrid = document.getElementById('incomeCategories');

    const stepCategory = document.getElementById('stepCategory');
    const stepAmount = document.getElementById('stepAmount');
    const modalHeader = document.getElementById('addModalHeader');
    const typeToggle = document.getElementById('modalTypeToggle');
    const submitTxBtn = document.getElementById('submitTxBtn');

    // Step 2 Display Elements
    const selectedCatIcon = document.getElementById('selectedCatIcon');
    const selectedCatName = document.getElementById('selectedCatName');
    const amountDisplay = document.getElementById('amountDisplay');
    const backToCatBtn = document.getElementById('backToCatBtn');

    // We need to store the current icon name to save later
    let currentIconName = "ellipsis-horizontal-outline";
    let currentAmount = "0";
    let currentType = "expense";
    let currentCategory = "";

    // Globals for editing
    window.editingId = null;

    // Global APIs for opening modal
    const modal = document.getElementById('addModal');
    const delTxBtn = document.getElementById('delTxBtn');
    const noteInput = document.getElementById('txNote');
    const keypadDateInput = document.getElementById('keypadDateInput');
    const keypadDateDisplay = document.getElementById('keypadDateDisplay');

    window.openModalForNew = function () {
        window.editingId = null;
        currentAmount = "0";
        if (noteInput) noteInput.value = "";
        if (delTxBtn) delTxBtn.style.display = 'none';

        // Reset to expense default visually
        typeBtns.forEach(b => b.classList.remove('active'));
        if (typeBtns[0]) typeBtns[0].classList.add('active');
        currentType = 'expense';
        if (expenseGrid) expenseGrid.classList.remove('hidden');
        if (incomeGrid) incomeGrid.classList.add('hidden');

        if (stepAmount) stepAmount.classList.add('hidden');
        if (stepCategory) stepCategory.classList.remove('hidden');
        if (typeToggle) typeToggle.style.visibility = 'visible';

        // Set today
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
    };

    window.openModalForEdit = function (tx) {
        window.editingId = tx.id;
        currentAmount = tx.amount.toString();
        currentType = tx.type;
        currentCategory = tx.title;
        currentIconName = tx.icon;

        if (noteInput) noteInput.value = tx.note || "";

        // Setup Date
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

        // UI setup: jump straight to amount step
        if (selectedCatIcon) selectedCatIcon.setAttribute('name', currentIconName);
        if (selectedCatName) selectedCatName.textContent = currentCategory;

        if (stepCategory) stepCategory.classList.add('hidden');
        if (stepAmount) stepAmount.classList.remove('hidden');
        if (typeToggle) typeToggle.style.visibility = 'hidden';

        if (delTxBtn) delTxBtn.style.display = 'block'; // Show delete button
        updateAmountDisplay();
        if (modal) modal.classList.add('active');
    };

    if (delTxBtn) {
        delTxBtn.addEventListener('click', () => {
            if (window.editingId && confirm("确定要删除这笔记录吗？")) {
                deleteTransaction(window.editingId);
                const closeModalBtn = document.getElementById('closeModalBtn');
                if (modal) modal.classList.remove('active');
            }
        });
    }

    function updateAmountDisplay() {
        if (amountDisplay) amountDisplay.textContent = currentAmount;
    }

    // 1. Toggle Income / Expense Types
    typeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentType = btn.getAttribute('data-type');
            if (currentType === 'expense') {
                expenseGrid.classList.remove('hidden');
                incomeGrid.classList.add('hidden');
            } else {
                incomeGrid.classList.remove('hidden');
                expenseGrid.classList.add('hidden');
            }
        });
    });

    // 2. Select Category (Move to Step 2)
    const categoryItems = document.querySelectorAll('.category-item');
    categoryItems.forEach(item => {
        item.addEventListener('click', () => {
            const iconName = item.querySelector('ion-icon').getAttribute('name');
            const catName = item.querySelector('span').textContent;

            const parentGrid = item.closest('.category-grid');
            if (parentGrid) {
                parentGrid.querySelectorAll('.category-item').forEach(sibling => sibling.classList.remove('active'));
                item.classList.add('active');
            }

            // Setup Step 2 UI
            currentCategory = catName;
            currentIconName = iconName; // Store for saving
            selectedCatIcon.setAttribute('name', iconName);
            selectedCatName.textContent = catName;

            // Switch Views
            stepCategory.classList.add('hidden');
            stepAmount.classList.remove('hidden');
            typeToggle.style.visibility = 'hidden';
            submitTxBtn.style.visibility = 'hidden';

            // Reset Amount
            currentAmount = "0";
            updateAmountDisplay();
        });
    });

    // 3. Back to Categories
    if (backToCatBtn) {
        backToCatBtn.addEventListener('click', () => {
            stepAmount.classList.add('hidden');
            stepCategory.classList.remove('hidden');
            typeToggle.style.visibility = 'visible';
        });
    }

    // 4. Keypad Logic
    function updateAmountDisplay() {
        amountDisplay.textContent = currentAmount;
    }

    const numKeys = document.querySelectorAll('.num-key');
    numKeys.forEach(key => {
        key.addEventListener('click', () => {
            const val = key.textContent;

            if (val === '.') {
                if (!currentAmount.includes('.')) {
                    currentAmount += '.';
                }
            } else {
                if (currentAmount === "0") {
                    currentAmount = val;
                } else if (currentAmount.length < 10) {
                    if (currentAmount.includes('.')) {
                        const decimals = currentAmount.split('.')[1];
                        if (decimals.length < 2) {
                            currentAmount += val;
                        }
                    } else {
                        currentAmount += val;
                    }
                }
            }
            updateAmountDisplay();
        });
    });

    const keyDelete = document.getElementById('keyDelete');
    if (keyDelete) {
        keyDelete.addEventListener('click', () => {
            if (currentAmount.length > 1) {
                currentAmount = currentAmount.slice(0, -1);
            } else {
                currentAmount = "0";
            }
            updateAmountDisplay();
        });
    }

    const keyClear = document.getElementById('keyClear');
    if (keyClear) {
        keyClear.addEventListener('click', () => {
            currentAmount = "0";
            updateAmountDisplay();
        });
    }

    function closeModal() {
        modal.classList.remove('active');
        setTimeout(() => {
            stepAmount.classList.add('hidden');
            stepCategory.classList.remove('hidden');
            typeToggle.style.visibility = 'visible';
            currentAmount = "0";
            editingId = null;
            const noteInput = document.getElementById('txNote');
            if (noteInput) noteInput.value = '';
            updateAmountDisplay();
        }, 300);
    }

    // Math Evaluation helper
    function evaluateMath(expression) {
        try {
            // Only allow numbers, dots, plus, minus
            if (!/^[0-9.+\-]+$/.test(expression)) return "0";
            // Prevent ending with operator
            if (/[+\-]$/.test(expression)) {
                expression = expression.slice(0, -1);
            }
            // Simple safe evaluation
            const result = new Function(`return ${expression}`)();
            if (isNaN(result) || !isFinite(result)) return "0";
            return parseFloat(result.toFixed(2)).toString(); // Max 2 decimals
        } catch (e) {
            return "0";
        }
    }

    // 5. Submit Transaction from Keypad
    const keySubmit = document.getElementById('keySubmit');
    if (keySubmit) {
        keySubmit.addEventListener('click', () => {
            // First evaluate if it contains math
            if (/[+\-]/.test(currentAmount)) {
                currentAmount = evaluateMath(currentAmount);
                updateAmountDisplay();
            }

            // Validation
            if (parseFloat(currentAmount) <= 0) {
                alert("请输入有效金额");
                return;
            }

            const noteInput = document.getElementById('txNote');
            const note = noteInput ? noteInput.value : '';

            const keypadDateInput = document.getElementById('keypadDateInput');
            let dateVal = keypadDateInput ? keypadDateInput.value : '';
            if (!dateVal) {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                dateVal = `${yyyy}-${mm}-${dd}`;
            }

            // Save object
            const txId = editingId || Date.now();
            const newTx = {
                id: txId,
                type: currentType, // 'expense' | 'income'
                title: currentCategory,
                icon: currentIconName,
                amount: currentAmount,
                date: dateVal,
                note: note
            };

            saveTransaction(newTx);
            closeModal();
        });
    }

    // Modal cleanup on close
    const closeModalBtn = document.getElementById('closeModalBtn');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            closeModal();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadTransactions();
    renderTransactions();
    setupAddTransactionModal();
    setupNavigation();
    setupDateSelector();
});
