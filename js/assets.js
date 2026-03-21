import { loadAccounts, getAssetsSummary } from './store.js';

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
        'investment': '投资理财'
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
                            <div class="acc-name">${acc.name}</div>
                            <div class="acc-type">${types[type]}</div>
                        </div>
                        <div class="acc-balance ${isNegative ? 'negative' : ''}">
                            ${acc.balance.toFixed(2)}
                        </div>
                    </div>
                `;
            });
        }
    }
    
    accountList.innerHTML = html;
}
