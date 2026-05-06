import { loadAccounts, getAssetsSummary, loadTransactions, saveAccount, deleteAccount, saveTransaction } from './store.js';
import { showAlert, showConfirm, showPrompt } from './dialog.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 资产类型预设配置（黑白配色，使用品牌图标）
 */
const ASSET_PRESETS = {
    bank: [
        { name: '招商银行', icon: 'card-outline' },
        { name: '工商银行', icon: 'business-outline' },
        { name: '建设银行', icon: 'storefront-outline' },
        { name: '农业银行', icon: 'leaf-outline' },
        { name: '中国银行', icon: 'globe-outline' },
        { name: '交通银行', icon: 'boat-outline' },
        { name: '浦发银行', icon: 'diamond-outline' },
        { name: '民生银行', icon: 'people-outline' },
        { name: '兴业银行', icon: 'flash-outline' },
        { name: '光大银行', icon: 'sunny-outline' },
        { name: '平安银行', icon: 'shield-checkmark-outline' },
        { name: '邮政储蓄', icon: 'mail-outline' },
    ],
    virtual: [
        { name: '支付宝', icon: 'logo-alipay' },
        { name: '微信支付', icon: 'logo-wechat' },
        { name: '京东支付', icon: 'bag-outline' },
        { name: '云闪付', icon: 'thunderstorm-outline' },
    ],
    credit: [
        { name: '花呗', icon: 'flower-outline' },
        { name: '借呗', icon: 'hand-left-outline' },
        { name: '信用卡', icon: 'card-outline' },
        { name: '白条', icon: 'document-text-outline' },
    ],
    investment: [
        { name: '余额宝', icon: 'trending-up-outline' },
        { name: '基金', icon: 'bar-chart-outline' },
        { name: '股票', icon: 'pulse-outline' },
        { name: '定期理财', icon: 'lock-closed-outline' },
    ],
    foreign_exchange: [
        { name: '港美股', icon: 'globe-outline' },
        { name: '加密货币', icon: 'logo-bitcoin' },
        { name: '外汇', icon: 'swap-horizontal-outline' },
    ],
    cash: [
        { name: '现金', icon: 'wallet-outline' },
        { name: '零钱', icon: 'cash-outline' },
    ],
};

const ASSET_TYPE_ICONS = {
    'cash': 'wallet-outline',
    'bank': 'card-outline',
    'virtual': 'phone-portrait-outline',
    'credit': 'layers-outline',
    'investment': 'trending-up-outline',
    'foreign_exchange': 'globe-outline'
};

const ASSET_TYPE_LABELS = {
    'cash': '资金账户 (现金/零钱)',
    'bank': '银行卡',
    'virtual': '虚拟账户 (支付宝/微信)',
    'credit': '负债 (信用卡/花呗)',
    'investment': '投资理财',
    'foreign_exchange': '外汇 (港美股/加密货币)'
};

let selectedPreset = null;
let assetEventsBound = false;

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
                        <div class="acc-icon-wrap">
                            <ion-icon name="${acc.icon}"></ion-icon>
                        </div>
                        <div class="acc-info">
                            <div class="acc-name">${acc.name} <span class="acc-type-tag" style="display:none">${types[acc.type]}</span></div>
                            <div class="acc-type">${types[type]}</div>
                        </div>
                        <div class="acc-balance ${isNegative ? 'negative' : ''}">
                            ${(acc.balance || 0).toFixed(2)}${acc.currency && acc.currency !== 'CNY' ? ' <span style="font-size: 14px; font-weight: normal; color: #666;">' + acc.currency + '</span>' : ''}
                        </div>
                    </div>
                `;
            });
        }
    }

    accountList.innerHTML = html;
    setupAssetEventListeners();
}

function setupAssetEventListeners() {
    const accountList = document.getElementById('accountList');
    if (accountList) {
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

    // 以下事件只需绑定一次
    if (assetEventsBound) return;
    assetEventsBound = true;

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

    // 资产类型自定义选择器
    const typeSelector = document.getElementById('assetTypeSelector');
    const typeInput = document.getElementById('assetTypeInput');
    const typeText = document.getElementById('assetTypeText');
    const currencyInput = document.getElementById('assetCurrencyInput');
    const currencySelector = document.getElementById('assetCurrencySelector');
    const currencyText = document.getElementById('assetCurrencyText');

    const CURRENCY_OPTIONS = ['CNY', 'HKD', 'USD'];

    function updateAssetTypeUI(type) {
        typeInput.value = type;
        typeText.textContent = ASSET_TYPE_LABELS[type] || type;
        renderAssetPresets(type);
        if (type === 'foreign_exchange') {
            currencySelector.style.display = 'block';
            if (currencyInput.value === 'CNY') {
                currencyInput.value = 'HKD';
                currencyText.textContent = 'HKD';
            }
        } else {
            currencySelector.style.display = 'none';
            currencyInput.value = 'CNY';
            currencyText.textContent = 'CNY';
        }
    }

    // 货币自定义选择器
    if (currencySelector) {
        currencySelector.addEventListener('click', () => {
            let container = document.getElementById('customDialogContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'customDialogContainer';
                document.body.appendChild(container);
            }

            const optionsHtml = CURRENCY_OPTIONS.map(c => `
                <div class="picker-month-item ${c === currencyInput.value ? 'active' : ''}" data-currency="${c}" style="grid-column: span 2;">
                    ${c}
                </div>
            `).join('');

            container.innerHTML = `
                <div class="dialog-overlay active">
                    <div class="dialog-box" style="max-width: 300px;">
                        <div class="dialog-title">选择币种</div>
                        <div class="picker-month-grid" style="gap: 6px;">
                            ${optionsHtml}
                        </div>
                        <div class="dialog-actions" style="margin-top: 16px;">
                            <button class="dialog-btn dialog-btn-cancel" id="currencyCancelBtn">取消</button>
                        </div>
                    </div>
                </div>
            `;

            container.querySelectorAll('.picker-month-item').forEach(item => {
                item.onclick = () => {
                    const val = item.getAttribute('data-currency');
                    currencyInput.value = val;
                    currencyText.textContent = val;
                    container.innerHTML = '';
                };
            });

            document.getElementById('currencyCancelBtn').onclick = () => {
                container.innerHTML = '';
            };
        });
    }

    if (typeSelector) {
        typeSelector.addEventListener('click', () => {
            // 确保容器存在
            let container = document.getElementById('customDialogContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'customDialogContainer';
                document.body.appendChild(container);
            }

            const typesHtml = Object.entries(ASSET_TYPE_LABELS).map(([key, label]) => `
                <div class="picker-month-item ${key === typeInput.value ? 'active' : ''}" data-type="${key}" style="grid-column: span 2; text-align: left; padding: 12px 16px; font-size: 14px;">
                    ${label}
                </div>
            `).join('');

            container.innerHTML = `
                <div class="dialog-overlay active">
                    <div class="dialog-box" style="max-width: 340px;">
                        <div class="dialog-title">选择资产类型</div>
                        <div class="picker-month-grid" style="gap: 6px;">
                            ${typesHtml}
                        </div>
                        <div class="dialog-actions" style="margin-top: 16px;">
                            <button class="dialog-btn dialog-btn-cancel" id="assetTypeCancelBtn">取消</button>
                        </div>
                    </div>
                </div>
            `;

            container.querySelectorAll('.picker-month-item').forEach(item => {
                item.onclick = () => {
                    const selectedType = item.getAttribute('data-type');
                    updateAssetTypeUI(selectedType);
                    container.innerHTML = '';
                };
            });

            document.getElementById('assetTypeCancelBtn').onclick = () => {
                container.innerHTML = '';
            };
        });
    }
}

/**
 * 渲染资产预设选项
 */
function renderAssetPresets(type) {
    const container = document.getElementById('assetPresetContainer');
    if (!container) return;

    const presets = ASSET_PRESETS[type] || [];
    if (presets.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <label style="display: block; font-size: 14px; color: #888; margin-bottom: 8px;">快速选择</label>
        <div class="preset-scroll">
            ${presets.map(p => `
                <button class="preset-btn" data-name="${p.name}" data-icon="${p.icon}">
                    <ion-icon name="${p.icon}"></ion-icon>
                    <span>${p.name}</span>
                </button>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.preset-btn').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const name = btn.getAttribute('data-name');
            const icon = btn.getAttribute('data-icon');

            document.getElementById('assetNameInput').value = name;
            selectedPreset = { icon, color: '#333' };
        };
    });
}

let editingAssetId = null;

function openAssetModal(asset = null) {
    const modal = document.getElementById('assetModal');
    const title = document.getElementById('assetModalTitle');
    const nameInput = document.getElementById('assetNameInput');
    const typeInput = document.getElementById('assetTypeInput');
    const typeText = document.getElementById('assetTypeText');
    const balanceInput = document.getElementById('assetBalanceInput');
    const currencyInput = document.getElementById('assetCurrencyInput');
    const currencySelector = document.getElementById('assetCurrencySelector');
    const currencyText = document.getElementById('assetCurrencyText');

    selectedPreset = null;

    if (asset) {
        editingAssetId = asset.id;
        title.textContent = '编辑资产';
        nameInput.value = asset.name;
        typeInput.value = asset.type;
        typeText.textContent = ASSET_TYPE_LABELS[asset.type] || asset.type;
        balanceInput.value = asset.balance;
        const cur = asset.currency || 'CNY';
        currencyInput.value = cur;
        currencyText.textContent = cur;
    } else {
        editingAssetId = null;
        title.textContent = '添加资产';
        nameInput.value = '';
        typeInput.value = 'bank';
        typeText.textContent = ASSET_TYPE_LABELS['bank'];
        balanceInput.value = '';
        currencyInput.value = 'CNY';
        currencyText.textContent = 'CNY';
    }

    // 显示预设
    renderAssetPresets(typeInput.value);
    if (typeInput.value === 'foreign_exchange') {
        currencySelector.style.display = 'block';
    } else {
        currencySelector.style.display = 'none';
    }
    modal.classList.add('active');
}

async function handleSaveAsset() {
    const name = document.getElementById('assetNameInput').value;
    const type = document.getElementById('assetTypeInput').value;
    let balance = parseFloat(document.getElementById('assetBalanceInput').value) || 0;
    const currencyInput = document.getElementById('assetCurrencyInput');
    const currency = currencyInput ? currencyInput.value : 'CNY';

    if (!name) {
        await showAlert('请输入资产名称或选择预设');
        return;
    }

    // 负债类型自动转为负数
    if (type === 'credit' && balance > 0) {
        balance = -balance;
    }

    // 确定图标和颜色
    let icon = ASSET_TYPE_ICONS[type] || 'help-outline';
    let color = '#333333';

    if (selectedPreset) {
        icon = selectedPreset.icon;
        color = selectedPreset.color;
    } else {
        // 尝试匹配已有预设
        const presets = ASSET_PRESETS[type] || [];
        const matched = presets.find(p => p.name === name);
        if (matched) {
            icon = matched.icon;
        }
    }

    const assetId = editingAssetId || 'acc_' + Date.now();

    // 余额调整逻辑
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
                note: `从 ${(oldAsset.balance || 0).toFixed(2)} 调整为 ${(balance || 0).toFixed(2)}`,
                accountId: assetId,
                isAdjustment: true
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
        icon,
        color
    };

    saveAccount(newAcc);
    closeModal('assetModal');
    renderAssets();

    if (!document.getElementById('assetDetailsPage').classList.contains('hidden')) {
        openAssetDetails(newAcc.id);
    }
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openAssetDetails(assetId) {
    const accounts = loadAccounts();
    const asset = accounts.find(a => a.id === assetId);
    if (!asset) return;

    const overlay = document.getElementById('assetDetailsPage');
    const cardContainer = document.getElementById('assetDetailCardContainer');
    const transactionListContainer = document.getElementById('assetTransactionList');

    if (!overlay || !cardContainer) return;

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
            <div class="acc-balance">${(asset.balance || 0).toFixed(2)}${asset.currency && asset.currency !== 'CNY' ? ' <span style="font-size: 16px; font-weight: normal; color: #666;">' + asset.currency + '</span>' : ''}</div>
            <div class="acc-label">余额</div>
        </div>
    `;

    setupDetailActionListeners(assetId);
    renderAssetTransactions(assetId, transactionListContainer);
    overlay.classList.remove('hidden');
}

function setupDetailActionListeners(assetId) {
    const deleteBtn = document.getElementById('deleteAssetBtn');
    const adjustBtn = document.getElementById('adjustBalanceBtnFooter');

    if (deleteBtn) {
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const confirmed = await showConfirm('确定要删除该资产吗？此操作不可撤销。');
            if (confirmed) {
                deleteAccount(assetId);
                setTimeout(() => {
                    document.getElementById('assetDetailsPage').classList.add('hidden');
                    renderAssets();
                }, 100);
            }
        };
    }

    if (adjustBtn) {
        adjustBtn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const accounts = loadAccounts();
            const asset = accounts.find(a => a.id === assetId);
            if (!asset) return;

            const input = await showPrompt(`调整【${asset.name}】的余额，请输入当前的真实金额：`, asset.balance.toString(), '调整余额');
            if (input === null || input.trim() === '') return;

            const newBalance = parseFloat(input);
            if (isNaN(newBalance)) {
                await showAlert('请输入有效的数字金额');
                return;
            }

            if (newBalance !== asset.balance) {
                const diff = newBalance - asset.balance;
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');

                const tx = {
                    id: Date.now(),
                    type: diff > 0 ? 'income' : 'expense',
                    title: '余额调整',
                    icon: 'swap-vertical-outline',
                    amount: Math.abs(diff).toFixed(2),
                    date: `${yyyy}-${mm}-${dd}`,
                    note: `由 ${(asset.balance || 0).toFixed(2)} 变更为 ${(newBalance || 0).toFixed(2)}`,
                    accountId: assetId,
                    isAdjustment: true
                };
                saveTransaction(tx);

                asset.balance = newBalance;
                saveAccount(asset);

                renderAssets();
                openAssetDetails(assetId);
            }
        };
    }
}

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
                        <div class="t-title">${escapeHtml(t.title)}</div>
                        <div style="font-size:12px;color:#999;">${escapeHtml(t.note || '')}</div>
                    </div>
                    <div class="t-amount ${t.type}">
                        ${t.type === 'expense' ? '-' : '+'}${parseFloat(t.amount || 0).toFixed(2)}
                    </div>
                </div>
            `).join('')}
        </div>
    `).join('');
}
