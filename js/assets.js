import { loadAccounts, getAssetsSummary, loadTransactions, saveAccount, deleteAccount, saveTransaction } from './store.js';

/**
 * 渲染资产页面
 */
export function renderAssets() {
    const assetsOverview = document.getElementById('assetsOverview');
    const accountList = document.getElementById('accountList');
    
    if (!assetsOverview || !accountList) return;

    const summary = getAssetsSummary();
    const accounts = loadAccounts();

    // 1. 渲染总览卡片
    assetsOverview.innerHTML = `
        <span class="net-assets-label">净资产 (元)</span>
        <span class="net-assets-value">${summary.netAssets}</span>
        <div class="assets-details">
            <div class="stat-item">
                <span class="stat-label">总资产</span>
                <span class="stat-value">${summary.totalAssets}</span>
            </div>
            <div class="stat-item" style="text-align: right;">
                <span class="stat-label">总负债</span>
                <span class="stat-value">${summary.totalLiabilities}</span>
            </div>
        </div>
    `;

    // 2. 按类型分组渲染账户
    const types = {
        'cash': '资金账户',
        'bank': '银行卡',
        'virtual': '虚拟账户',
        'credit': '负债',
        'investment': '投资理财',
        'foreign_exchange': '跨境资产'
    };

    const grouped = {};
    accounts.forEach(acc => {
        if (!grouped[acc.type]) grouped[acc.type] = [];
        grouped[acc.type].push(acc);
    });

    let html = '';
    for (const type in types) {
        if (grouped[type] && grouped[type].length > 0) {
            html += `<div class="account-group-title">${types[type]}</div>`;
            grouped[type].forEach(acc => {
                const isNegative = acc.balance < 0;
                html += `
                    <div class="account-card" data-id="${acc.id}">
                        <div class="acc-icon-wrap" style="background-color: ${acc.color || '#999'};">
                            <ion-icon name="${acc.icon}"></ion-icon>
                        </div>
                        <div class="acc-info">
                            <div class="acc-name">${acc.name} <span class="acc-type-tag" style="display:none">${types[acc.type]}</span></div>
                            <div class="acc-type">${types[type]}</div>
                        </div>
                        <div class="acc-balance ${isNegative ? 'negative' : ''}">
                            ${acc.balance.toFixed(2)}${acc.currency && acc.currency !== 'CNY' ? ' <span style="font-size: 14px; font-weight: normal; color: #666;">' + acc.currency + '</span>' : ''}
                        </div>
                    </div>
                `;
            });
        }
    }
    
    accountList.innerHTML = html;

    // 绑定点击事件 (委托处理或直接绑定)
    setupAssetEventListeners();
}

/**
 * 设置资产页面相关的事件监听器
 */
function setupAssetEventListeners() {
    const accountList = document.getElementById('accountList');
    if (accountList) {
        // 使用委托来处理资产行点击
        accountList.onclick = (e) => {
            const card = e.target.closest('.account-card');
            if (card) {
                const id = card.getAttribute('data-id');
                openAssetDetails(id);
            }
        };
    }

    const addAccountBtn = document.getElementById('addAccountBtn');
    if (addAccountBtn) {
        addAccountBtn.onclick = () => {
            openAssetModal();
        };
    }

    const closeBtn = document.getElementById('closeAssetDetails');
    if (closeBtn) {
        closeBtn.onclick = () => {
            document.getElementById('assetDetailsPage').classList.add('hidden');
        };
    }

    // Modal Events
    const closeAssetModalBtn = document.getElementById('closeAssetModal');
    if (closeAssetModalBtn) {
        closeAssetModalBtn.onclick = () => closeModal('assetModal');
    }

    const saveAssetBtn = document.getElementById('saveAssetBtn');
    if (saveAssetBtn) {
        saveAssetBtn.onclick = handleSaveAsset;
    }

    const typeInput = document.getElementById('assetTypeInput');
    const currencyInput = document.getElementById('assetCurrencyInput');
    if (typeInput && currencyInput) {
        typeInput.onchange = (e) => {
            if (e.target.value === 'foreign_exchange') {
                currencyInput.style.display = 'block';
                if (currencyInput.value === 'CNY') currencyInput.value = 'HKD';
            } else {
                currencyInput.style.display = 'none';
                currencyInput.value = 'CNY';
            }
        };
    }
}

let editingAssetId = null;

function openAssetModal(asset = null) {
    const modal = document.getElementById('assetModal');
    const title = document.getElementById('assetModalTitle');
    const nameInput = document.getElementById('assetNameInput');
    const typeInput = document.getElementById('assetTypeInput');
    const balanceInput = document.getElementById('assetBalanceInput');
    const currencyInput = document.getElementById('assetCurrencyInput');

    if (asset) {
        editingAssetId = asset.id;
        title.textContent = '编辑资产';
        nameInput.value = asset.name;
        typeInput.value = asset.type;
        balanceInput.value = asset.balance;
        if (currencyInput) currencyInput.value = asset.currency || 'CNY';
        if (typeInput) typeInput.dispatchEvent(new Event('change'));
    } else {
        editingAssetId = null;
        title.textContent = '添加资产';
        nameInput.value = '';
        typeInput.value = 'bank';
        balanceInput.value = '';
        if (currencyInput) currencyInput.value = 'CNY';
        if (typeInput) typeInput.dispatchEvent(new Event('change'));
    }

    modal.classList.add('active');
}

function handleSaveAsset() {
    const name = document.getElementById('assetNameInput').value;
    const type = document.getElementById('assetTypeInput').value;
    const balance = parseFloat(document.getElementById('assetBalanceInput').value) || 0;
    const currencyInput = document.getElementById('assetCurrencyInput');
    const currency = currencyInput ? currencyInput.value : 'CNY';

    if (!name) {
        alert('请输入资产名称');
        return;
    }

    const icons = {
        'cash': 'wallet-outline',
        'bank': 'card-outline',
        'virtual': 'logo-alipay',
        'credit': 'layers-outline',
        'investment': 'trending-up-outline',
        'foreign_exchange': 'earth-outline'
    };

    const assetId = editingAssetId || 'acc_' + Date.now();
    
    // 余额调整逻辑：如果正在编辑现有资产，且余额发生了变化
    if (editingAssetId) {
        const accounts = loadAccounts();
        const oldAsset = accounts.find(a => a.id === editingAssetId);
        if (oldAsset && oldAsset.balance !== balance) {
            const diff = balance - oldAsset.balance;
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');

            const adjustmentTx = {
                id: Date.now(),
                type: diff > 0 ? 'income' : 'expense',
                title: '手动调整余额',
                icon: 'construct-outline',
                amount: Math.abs(diff).toFixed(2),
                date: `${yyyy}-${mm}-${dd}`,
                note: `从 ${oldAsset.balance.toFixed(2)} 调整为 ${balance.toFixed(2)}`,
                accountId: assetId
            };
            saveTransaction(adjustmentTx);
        }
    }

    const newAcc = {
        id: assetId,
        name,
        type,
        balance,
        currency,
        icon: icons[type] || 'help-outline',
        color: '#000000'
    };

    saveAccount(newAcc);
    closeModal('assetModal');
    renderAssets();
    
    // 如果详情页打开着，也更新详情页
    if (!document.getElementById('assetDetailsPage').classList.contains('hidden')) {
        openAssetDetails(newAcc.id);
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

/**
 * 打开资产详情页
 * @param {string} assetId 
 */
function openAssetDetails(assetId) {
    const accounts = loadAccounts();
    const asset = accounts.find(a => a.id === assetId);
    if (!asset) return;

    const overlay = document.getElementById('assetDetailsPage');
    const cardContainer = document.getElementById('assetDetailCardContainer');
    const transactionListContainer = document.getElementById('assetTransactionList');
    
    if (!overlay || !cardContainer) return;

    // 渲染资产卡片 (移除卡片内的调整余额按钮)
    const types = {
        'cash': '现金',
        'bank': '储蓄卡',
        'virtual': '虚拟账户',
        'credit': '信用卡',
        'investment': '投资账户',
        'foreign_exchange': '跨境资产'
    };

    cardContainer.innerHTML = `
        <div class="asset-card-large">
            <div class="acc-name">${asset.name} <span class="acc-type-tag">${types[asset.type] || '账户'}</span></div>
            <div class="acc-balance">${asset.balance.toFixed(2)}${asset.currency && asset.currency !== 'CNY' ? ' <span style="font-size: 16px; font-weight: normal; color: #666;">' + asset.currency + '</span>' : ''}</div>
            <div class="acc-label">余额</div>
        </div>
    `;

    // 绑定底部操作 (左侧删除，右侧调整余额)
    setupDetailActionListeners(assetId);

    // 渲染收支明细 (加载该账户的真实交易)
    renderAssetTransactions(assetId, transactionListContainer);

    // 显示覆盖层
    overlay.classList.remove('hidden');
}

function setupDetailActionListeners(assetId) {
    const deleteBtn = document.getElementById('deleteAssetBtn');
    const adjustBtn = document.getElementById('adjustBalanceBtnFooter');

    // 删除资产
    if (deleteBtn) {
        deleteBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('确定要删除该资产吗？此操作不可撤销。')) {
                deleteAccount(assetId);
                // 延迟隐藏覆盖层以防止触发底层界面的“幽灵点击”
                setTimeout(() => {
                    document.getElementById('assetDetailsPage').classList.add('hidden');
                    renderAssets();
                }, 100);
            }
        };
    }

    // 调整余额
    if (adjustBtn) {
        adjustBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const accounts = loadAccounts();
            const asset = accounts.find(a => a.id === assetId);
            if (!asset) return;

            const input = prompt(`调整【${asset.name}】的余额\n请输入当前的真实金额：`, asset.balance);
            if (input === null || input.trim() === '') return;

            const newBalance = parseFloat(input);
            if (isNaN(newBalance)) {
                alert('请输入有效的数字金额');
                return;
            }

            if (newBalance !== asset.balance) {
                const diff = newBalance - asset.balance;
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');

                // 保存交易记录
                const tx = {
                    id: Date.now(),
                    type: diff > 0 ? 'income' : 'expense',
                    title: '余额调整',
                    icon: 'swap-vertical-outline',
                    amount: Math.abs(diff).toFixed(2),
                    date: `${yyyy}-${mm}-${dd}`,
                    note: `由 ${asset.balance.toFixed(2)} 变更为 ${newBalance.toFixed(2)}`,
                    accountId: assetId,
                    isAdjustment: true
                };
                saveTransaction(tx);

                // 更新余额
                asset.balance = newBalance;
                saveAccount(asset);

                // 刷新页面显示
                renderAssets();
                openAssetDetails(assetId); // 自动更新详情页显示
            }
        };
    }
}

/**
 * 渲染资产收支明细 (真实数据)
 */
function renderAssetTransactions(assetId, container) {
    const { groupedData } = loadTransactions(null, assetId);

    if (groupedData.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding: 40px; color: var(--text-secondary); font-size: 13px;">暂无该账户的历史记录</div>';
        return;
    }

    container.innerHTML = groupedData.map(group => `
        <div class="day-group">
            <div class="day-header" style="background: transparent;">
                <div>${group.date.substring(5)} ${group.day}</div>
            </div>
            ${group.transactions.map(t => `
                <div class="transaction-item no-border">
                    <div class="t-icon-wrap" style="background-color: #f2f2f7;">
                        <ion-icon name="${t.icon || 'receipt-outline'}"></ion-icon>
                    </div>
                    <div class="t-details">
                        <div class="t-title">${t.title}</div>
                        <div style="font-size:12px;color:#999;">${t.note || ''}</div>
                    </div>
                    <div class="t-amount ${t.type}">
                        ${t.type === 'expense' ? '-' : '+'}${parseFloat(t.amount).toFixed(2)}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}
