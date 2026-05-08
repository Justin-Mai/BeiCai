import {
    getUsageStats, getExchangeRates, saveExchangeRates, checkStorageHealth,
    loadLedgers, saveLedger, deleteLedger, setDefaultBook,
    getActiveBookId, setActiveBookId, getLedgerById, getLedgerStats,
    migrateTransactions, getActiveBook, migrateLedgerData
} from './store.js';
import { showAlert, showConfirm } from './dialog.js';
import { initAvatarCrop } from './avatar-crop.js';
import { getCategories } from './categories.js';

function isImageDataUrl(str) {
    return str && str.startsWith('data:image');
}

function renderAvatar(container, avatarValue) {
    if (!container) return;
    if (isImageDataUrl(avatarValue)) {
        container.innerHTML = `<img src="${avatarValue}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    } else {
        container.innerHTML = `<span style="font-size: 38px;">${avatarValue || '😊'}</span>`;
    }
}

/** 刷新「我的」页面数据（不重新绑定事件） */
function refreshMineData() {
    const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
    document.getElementById('userNameDisplay').textContent = profile.name;
    document.getElementById('userSloganDisplay').textContent = profile.slogan;
    renderAvatar(document.getElementById('userAvatarContainer'), profile.avatar);

    const stats = getUsageStats();
    document.getElementById('daysUsedCount').textContent = stats.accountingDays;

    const rates = getExchangeRates();
    const infoSpan = document.getElementById('exchangeRateInfo');
    if (infoSpan) {
        infoSpan.innerHTML = `USD: ${(rates.USD || 0).toFixed(2)} &nbsp;|&nbsp; HKD: ${(rates.HKD || 0).toFixed(2)}`;
    }

    // 存储健康检查
    const health = checkStorageHealth();
    const storageEl = document.getElementById('storageHealthInfo');
    if (storageEl) {
        if (health.percent >= 80) {
            storageEl.textContent = `存储 ${health.percent}%`;
            storageEl.style.color = '#FF3B30';
        } else if (health.percent >= 50) {
            storageEl.textContent = `存储 ${health.percent}%`;
            storageEl.style.color = '#FF9500';
        } else {
            storageEl.textContent = '';
        }
    }

    // 更新当前账本名称
    updateActiveBookName();

    // 前台服务开关状态
    const fgSwitch = document.getElementById('foregroundSwitch');
    if (fgSwitch) {
        const fgDisabled = localStorage.getItem('beicai_fg_service_disabled');
        fgSwitch.checked = fgDisabled !== 'true';
    }

    // AI 记开关状态
    const aiSwitch = document.getElementById('aiSwitch');
    if (aiSwitch) {
        const aiEnabled = localStorage.getItem('beicai_ai_enabled');
        aiSwitch.checked = aiEnabled === 'true';
        // 根据后台常驻状态设置可用性
        const fgDisabled = localStorage.getItem('beicai_fg_service_disabled');
        aiSwitch.disabled = fgDisabled === 'true';
        const aiToggle = document.getElementById('aiToggle');
        if (aiToggle) {
            aiToggle.style.opacity = fgDisabled === 'true' ? '0.5' : '1';
        }
    }
}

export function renderMineTab() {
    refreshMineData();

    // 事件只绑定一次
    if (!window.mineEventsBound) {
        setupMineEvents();
        window.mineEventsBound = true;
    }
}

// 临时存储裁剪后的头像
let pendingAvatar = null;

// ============ 导出相关工具函数 ============

/** 获取分类名 → { id, icon } 映射表 */
function buildCategoryMap() {
    const map = {};
    ['expense', 'income'].forEach(type => {
        getCategories(type).forEach(cat => {
            map[cat.name] = { id: cat.id, icon: cat.icon, type };
        });
    });
    return map;
}

/** 获取账户 id → name 映射表 */
function buildAccountNameMap() {
    const accs = JSON.parse(localStorage.getItem('beicai_accounts') || '[]');
    const map = {};
    accs.forEach(acc => { map[acc.id] = acc.name; });
    return map;
}

/** 获取账户 name → id 映射表（用于导入） */
function buildAccountIdMap() {
    const accs = JSON.parse(localStorage.getItem('beicai_accounts') || '[]');
    const map = {};
    accs.forEach(acc => { map[acc.name] = acc.id; });
    return map;
}

/** 构建导出数据行（通用）
 * @param {string|null} bookId - 可选：按账本 ID 过滤，null 表示全部
 * @param {boolean} includeBookColumn - 是否包含账本列
 */
function buildExportRows(bookId = null, includeBookColumn = false) {
    const txs = JSON.parse(localStorage.getItem('beicai_transactions') || '[]');
    const accNameMap = buildAccountNameMap();
    const ledgerMap = {};
    loadLedgers().forEach(l => { ledgerMap[l.id] = l.name; });

    return txs
        .filter(t => !t.isAdjustment)
        .filter(t => !bookId || t.bookId === bookId)
        .map(t => {
            const row = {
                '日期': t.date,
                '类型': t.type === 'income' ? '收入' : '支出',
                '分类': t.title,
                '金额': parseFloat(t.amount) || 0,
                '账户': t.accountId ? (accNameMap[t.accountId] || '') : '',
                '备注': t.note || ''
            };
            if (includeBookColumn) {
                row['账本'] = t.bookId ? (ledgerMap[t.bookId] || '默认账本') : '默认账本';
            }
            return row;
        });
}

/** 生成文件名日期后缀 */
function getDateStr() {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/** 通过 Blob 下载文件（Web 端） */
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 500);
}

/** 将 ArrayBuffer 转为 Base64 */
function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// ============ 导出 JSON ============
async function exportAsJson(scope = 'current') {
    const activeBookId = getActiveBookId();
    let txs = JSON.parse(localStorage.getItem('beicai_transactions') || '[]');
    let ledgersData = JSON.parse(localStorage.getItem('beicai_ledgers') || '[]');

    // 按范围过滤交易和账本
    if (scope === 'current') {
        txs = txs.filter(t => t.bookId === activeBookId);
        // 只导出当前账本信息
        ledgersData = ledgersData.filter(l => l.id === activeBookId);
    }

    const accs = localStorage.getItem('beicai_accounts') || '[]';
    const rates = localStorage.getItem('beicai_exchange_rates') || '{}';
    const installDate = localStorage.getItem('beicai_install_date') || '';

    const backupObj = {
        transactions: txs,
        accounts: JSON.parse(accs),
        exchangeRates: JSON.parse(rates),
        ledgers: ledgersData,
        installDate
    };
    const jsonStr = JSON.stringify(backupObj, null, 2);
    const fileName = `beicai_backup_${getDateStr()}.json`;

    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileExport) {
            await window.Capacitor.Plugins.FileExport.exportJson({ data: jsonStr, fileName });
            await showAlert(`备份已保存到：下载/${fileName}`, '导出成功');
            return;
        }
        const blob = new Blob([jsonStr], { type: 'application/json' });
        downloadBlob(blob, fileName);
    } catch (e) {
        console.error('Export JSON error:', e);
        await showAlert('导出失败：' + (e.message || '未知错误'), '错误');
    }
}

// ============ 导出 Excel ============
async function exportAsExcel(scope = 'current') {
    const activeBookId = getActiveBookId();
    const bookId = scope === 'current' ? activeBookId : null;
    const includeBookColumn = scope === 'all';
    const rows = buildExportRows(bookId, includeBookColumn);

    const headers = includeBookColumn
        ? ['日期', '类型', '分类', '金额', '账户', '账本', '备注']
        : ['日期', '类型', '分类', '金额', '账户', '备注'];
    const aoa = [headers, ...rows.map(r => headers.map(h => r[h]))];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = includeBookColumn
        ? [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }]
        : [{ wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '记账明细');
    const fileName = `beicai_backup_${getDateStr()}.xlsx`;

    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileExport) {
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const base64 = arrayBufferToBase64(wbout);
            await window.Capacitor.Plugins.FileExport.exportBase64({
                data: base64, fileName,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            await showAlert(`备份已保存到：下载/${fileName}`, '导出成功');
            return;
        }
        XLSX.writeFile(wb, fileName);
    } catch (e) {
        console.error('Export Excel error:', e);
        await showAlert('导出失败：' + (e.message || '未知错误'), '错误');
    }
}

// ============ 导出 CSV ============
async function exportAsCsv(scope = 'current') {
    const activeBookId = getActiveBookId();
    const bookId = scope === 'current' ? activeBookId : null;
    const includeBookColumn = scope === 'all';
    const rows = buildExportRows(bookId, includeBookColumn);

    const headers = includeBookColumn
        ? ['日期', '类型', '分类', '金额', '账户', '账本', '备注']
        : ['日期', '类型', '分类', '金额', '账户', '备注'];
    const csvLines = [headers.join(',')];
    rows.forEach(r => {
        const line = headers.map(h => {
            const val = String(r[h] || '');
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        });
        csvLines.push(line.join(','));
    });
    const bom = '﻿';
    const csvContent = bom + csvLines.join('\n');
    const fileName = `beicai_backup_${getDateStr()}.csv`;

    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileExport) {
            const bytes = new TextEncoder().encode(csvContent);
            const base64 = arrayBufferToBase64(bytes.buffer);
            await window.Capacitor.Plugins.FileExport.exportBase64({ data: base64, fileName, mimeType: 'text/csv' });
            await showAlert(`备份已保存到：下载/${fileName}`, '导出成功');
            return;
        }
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, fileName);
    } catch (e) {
        console.error('Export CSV error:', e);
        await showAlert('导出失败：' + (e.message || '未知错误'), '错误');
    }
}

// ============ 导入数据暂存 ============
let pendingImportData = null; // { transactions, accounts?, exchangeRates?, installDate?, skipped?, count }

/** 安全写入 localStorage */
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        if (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014) {
            return false;
        }
        throw e;
    }
}

/** 应用导入数据（覆盖或合并） */
async function applyImportData(mode) {
    if (!pendingImportData) return;
    const data = pendingImportData;
    pendingImportData = null;

    try {
        // 覆盖模式：先导入账本数据，确保交易的bookId有对应的账本
        if (mode === 'overwrite') {
            // 1. 先导入账本（如果有）
            if (data.ledgers && data.ledgers.length > 0) {
                // 确保导入的账本列表中包含默认账本
                const hasDefault = data.ledgers.some(l => l.id === 'book_default');
                if (!hasDefault) {
                    data.ledgers.push({
                        id: 'book_default',
                        name: '默认账本',
                        icon: 'book-outline',
                        isDefault: true,
                        createdAt: new Date().toISOString()
                    });
                }
                safeSetItem('beicai_ledgers', JSON.stringify(data.ledgers));
            } else {
                // 如果没有账本数据，确保有默认账本
                const existingLedgers = loadLedgers();
                if (existingLedgers.length === 0) {
                    safeSetItem('beicai_ledgers', JSON.stringify([{
                        id: 'book_default',
                        name: '默认账本',
                        icon: 'book-outline',
                        isDefault: true,
                        createdAt: new Date().toISOString()
                    }]));
                }
            }
            // 重新加载账本列表
            loadLedgers();

            // 2. 验证并修复交易的bookId
            if (data.transactions) {
                const validBookIds = new Set(loadLedgers().map(l => l.id));
                const defaultBookId = 'book_default';
                data.transactions.forEach(tx => {
                    // 如果交易没有bookId，或者bookId不存在于账本列表中，则设为默认账本
                    if (!tx.bookId || !validBookIds.has(tx.bookId)) {
                        tx.bookId = defaultBookId;
                    }
                });
            }

            // 3. 导入交易数据
            if (data.transactions && !safeSetItem('beicai_transactions', JSON.stringify(data.transactions))) {
                await showAlert('导入失败：存储空间不足，请先清理旧数据。', '存储已满');
                return;
            }
            if (data.accounts) safeSetItem('beicai_accounts', JSON.stringify(data.accounts));
            if (data.exchangeRates) safeSetItem('beicai_exchange_rates', JSON.stringify(data.exchangeRates));
            if (data.installDate) safeSetItem('beicai_install_date', data.installDate);
        } else {
            // 合并模式：先合并账本，再合并交易
            // 1. 合并账本数据
            const existingLedgers = loadLedgers();
            if (data.ledgers && data.ledgers.length > 0) {
                const existingLedgerIds = new Set(existingLedgers.map(l => l.id));
                const newLedgers = data.ledgers.filter(l => !existingLedgerIds.has(l.id));
                // 确保有默认账本
                const hasDefault = existingLedgers.some(l => l.id === 'book_default') ||
                                   newLedgers.some(l => l.id === 'book_default');
                if (!hasDefault) {
                    newLedgers.push({
                        id: 'book_default',
                        name: '默认账本',
                        icon: 'book-outline',
                        isDefault: true,
                        createdAt: new Date().toISOString()
                    });
                }
                if (newLedgers.length > 0) {
                    safeSetItem('beicai_ledgers', JSON.stringify([...existingLedgers, ...newLedgers]));
                }
            } else if (existingLedgers.length === 0) {
                // 如果没有账本数据且当前也没有账本，创建默认账本
                safeSetItem('beicai_ledgers', JSON.stringify([{
                    id: 'book_default',
                    name: '默认账本',
                    icon: 'book-outline',
                    isDefault: true,
                    createdAt: new Date().toISOString()
                }]));
            }
            // 重新加载账本列表
            loadLedgers();

            // 2. 验证并修复交易的bookId
            const validBookIds = new Set(loadLedgers().map(l => l.id));
            const defaultBookId = 'book_default';
            if (data.transactions) {
                data.transactions.forEach(tx => {
                    if (!tx.bookId || !validBookIds.has(tx.bookId)) {
                        tx.bookId = defaultBookId;
                    }
                });
            }

            // 3. 合并交易数据（去重后追加）
            const existingTxs = JSON.parse(localStorage.getItem('beicai_transactions') || '[]');
            const existingIds = new Set(existingTxs.map(t => t.id));
            const newTxs = (data.transactions || []).filter(t => !existingIds.has(t.id));
            if (!safeSetItem('beicai_transactions', JSON.stringify([...existingTxs, ...newTxs]))) {
                await showAlert('导入失败：存储空间不足，请先清理旧数据。', '存储已满');
                return;
            }
            if (data.accounts) {
                const existingAccs = JSON.parse(localStorage.getItem('beicai_accounts') || '[]');
                const existingAccIds = new Set(existingAccs.map(a => a.id));
                const newAccs = data.accounts.filter(a => !existingAccIds.has(a.id));
                safeSetItem('beicai_accounts', JSON.stringify([...existingAccs, ...newAccs]));
            }
            if (data.exchangeRates) safeSetItem('beicai_exchange_rates', JSON.stringify(data.exchangeRates));
        }
    } catch (e) {
        await showAlert('导入出错：' + e.message, '导入失败');
        return;
    }

    refreshMineData();
    window.dispatchEvent(new CustomEvent('data-imported'));
    const count = data.count || (data.transactions || []).length;
    const merged = mode === 'merge' ? `（合并${count}条记录）` : '';

    // 导入后检查存储健康
    const health = checkStorageHealth();
    const warn = health.warning ? '\n\n⚠ ' + health.warning : '';
    await showAlert(`数据导入成功${merged}！${warn}`);
}

// ============ 解析 JSON ============
function parseJsonData(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    text = text.trim();
    const data = JSON.parse(text);
    if (!data.transactions || !data.accounts) return null;
    return { ...data, count: data.transactions.length, skipped: 0 };
}

// ============ CSV 行解析（处理引号包裹的字段） ============
function parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

// ============ 解析 Excel/CSV 行数据 ============
function parseTabularRows(rows) {
    if (!rows || rows.length === 0) return null;

    const catMap = buildCategoryMap();
    const accIdMap = buildAccountIdMap();

    // 构建账本名称到ID的映射
    const ledgerNameMap = {};
    loadLedgers().forEach(l => { ledgerNameMap[l.name] = l.id; });

    const txs = [];
    let skipped = 0;

    rows.forEach((row, idx) => {
        const date = row['日期'] || row['时间'] || row['date'] || '';
        const typeStr = row['类型'] || row['type'] || '';
        const category = row['分类'] || row['类别'] || row['category'] || '';
        let amount = row['金额'] || row['amount'] || '0';
        const accountName = row['账户'] || row['account'] || '';
        const note = row['备注'] || row['描述'] || row['note'] || '';
        const bookName = row['账本'] || row['book'] || '';

        let parsedDate = String(date).trim().replace(/\//g, '-');
        if (/^\d{8}$/.test(parsedDate)) {
            parsedDate = parsedDate.slice(0, 4) + '-' + parsedDate.slice(4, 6) + '-' + parsedDate.slice(6);
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parsedDate)) { skipped++; return; }

        let type = 'expense';
        if (typeStr.includes('收入') || typeStr.toLowerCase() === 'income') type = 'income';

        amount = String(amount).replace(/[¥￥,\s]/g, '');
        const numAmount = Math.abs(parseFloat(amount)) || 0;
        if (numAmount === 0) { skipped++; return; }

        const catInfo = catMap[category];
        const icon = catInfo ? catInfo.icon : (type === 'income' ? 'wallet-outline' : 'cube-outline');

        let accountId = null;
        if (accountName && accIdMap[accountName]) accountId = accIdMap[accountName];

        // 根据账本名称查找账本ID，如果不存在则创建新账本
        let bookId = null;
        if (bookName) {
            if (ledgerNameMap[bookName]) {
                bookId = ledgerNameMap[bookName];
            } else {
                // 账本名称不存在，创建新账本
                const newBookId = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newLedger = {
                    id: newBookId,
                    name: bookName,
                    icon: 'book-outline',
                    isDefault: false,
                    createdAt: new Date().toISOString()
                };
                // 保存新账本
                const currentLedgers = JSON.parse(localStorage.getItem('beicai_ledgers') || '[]');
                currentLedgers.push(newLedger);
                localStorage.setItem('beicai_ledgers', JSON.stringify(currentLedgers));
                // 更新映射
                ledgerNameMap[bookName] = newBookId;
                bookId = newBookId;
            }
        }

        const tx = {
            id: Date.now() + idx,
            type, title: category || '其他', icon,
            amount: numAmount.toFixed(2),
            date: parsedDate, note: note || '', accountId
        };
        if (bookId) {
            tx.bookId = bookId;
        }
        txs.push(tx);
    });

    if (txs.length === 0) return null;
    return { transactions: txs, count: txs.length, skipped };
}

// ============ 事件绑定 ============

function setupMineEvents() {
    // 初始化账本管理弹窗
    setupLedgerModal();

    // 初始化头像裁剪
    initAvatarCrop((dataUrl) => {
        pendingAvatar = dataUrl;
        const preview = document.getElementById('avatarPreview');
        if (preview) {
            preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    });

    // Profile Edit
    const profileModal = document.getElementById('profileModal');
    const editProfileBtn = document.getElementById('editProfileBtn');

    if (editProfileBtn && profileModal) {
        editProfileBtn.onclick = () => {
            const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
            pendingAvatar = null;

            const preview = document.getElementById('avatarPreview');
            if (preview) {
                if (isImageDataUrl(profile.avatar)) {
                    preview.innerHTML = `<img src="${profile.avatar}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                } else {
                    preview.innerHTML = profile.avatar || '😊';
                }
            }

            document.getElementById('nameInput').value = profile.name;
            document.getElementById('sloganInput').value = profile.slogan;
            profileModal.classList.add('active');
        };

        document.getElementById('closeProfileModal').onclick = () => {
            profileModal.classList.remove('active');
        };

        document.getElementById('saveProfileBtn').onclick = async () => {
            const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
            const avatar = pendingAvatar || profile.avatar || '😊';
            const name = document.getElementById('nameInput').value.trim() || '极简达人';
            const slogan = document.getElementById('sloganInput').value.trim() || '简单记账，掌控生活';

            if (!safeSetItem('beicai_user_profile', JSON.stringify({ avatar, name, slogan }))) {
                await showAlert('保存失败：存储空间不足。请尝试使用较小的头像图片。', '存储已满');
                return;
            }
            profileModal.classList.remove('active');
            pendingAvatar = null;
            refreshMineData();
        };
    }

    // Export Data - 打开格式选择弹窗
    const exportBtn = document.getElementById('exportDataBtn');
    const exportFormatModal = document.getElementById('exportFormatModal');
    if (exportBtn && exportFormatModal) {
        let exportScope = 'current'; // 默认导出当前账本

        exportBtn.onclick = () => {
            // 重置范围选择器
            exportScope = 'current';
            exportFormatModal.querySelectorAll('.scope-option').forEach(opt => {
                opt.classList.toggle('active', opt.dataset.scope === 'current');
            });
            exportFormatModal.classList.add('active');
        };

        document.getElementById('closeExportFormatModal').onclick = () => {
            exportFormatModal.classList.remove('active');
        };

        exportFormatModal.onclick = (e) => {
            if (e.target === exportFormatModal) {
                exportFormatModal.classList.remove('active');
            }
        };

        // 范围选择器事件
        exportFormatModal.querySelectorAll('.scope-option').forEach(opt => {
            opt.onclick = () => {
                exportScope = opt.dataset.scope;
                exportFormatModal.querySelectorAll('.scope-option').forEach(o => {
                    o.classList.toggle('active', o.dataset.scope === exportScope);
                });
            };
        });

        // 格式选择事件
        exportFormatModal.querySelectorAll('.export-format-option').forEach(opt => {
            opt.onclick = async () => {
                const format = opt.dataset.format;
                exportFormatModal.classList.remove('active');
                if (format === 'json') await exportAsJson(exportScope);
                else if (format === 'xlsx') await exportAsExcel(exportScope);
                else if (format === 'csv') await exportAsCsv(exportScope);
            };
        });
    }

    // Import Data - 解析文件后弹出导入方式选择
    const importInput = document.getElementById('importFileInput');
    const importBtn = document.getElementById('importDataBtn');
    const importModeModal = document.getElementById('importModeModal');

    if (importBtn && importInput && importModeModal) {
        importBtn.onclick = () => {
            importInput.click();
        };

        // 解析文件并暂存，然后弹出导入方式选择
        importInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            importInput.value = '';

            const ext = file.name.split('.').pop().toLowerCase();

            try {
                if (ext === 'json') {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const parsed = parseJsonData(event.target.result);
                            if (!parsed) { await showAlert('导入文件格式不正确，缺少关键数据节点。'); return; }
                            pendingImportData = parsed;
                            const count = parsed.count || 0;
                            document.querySelector('#importModeModal .dialog-title').textContent =
                                `解析到 ${count} 条记录，选择导入方式`;
                            importModeModal.classList.add('active');
                        } catch (err) { await showAlert('解析出错：' + err.message, '导入失败'); }
                    };
                    reader.readAsText(file, 'utf-8');
                } else if (ext === 'xlsx' || ext === 'xls') {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            const wb = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
                            const ws = wb.Sheets[wb.SheetNames[0]];
                            const rows = XLSX.utils.sheet_to_json(ws);
                            const parsed = parseTabularRows(rows);
                            if (!parsed) { await showAlert('未能解析出有效交易记录，请检查文件格式。'); return; }
                            pendingImportData = parsed;
                            let title = `解析到 ${parsed.count} 条记录`;
                            if (parsed.skipped > 0) title += `，跳过${parsed.skipped}条异常`;
                            document.querySelector('#importModeModal .dialog-title').textContent = title + '，选择导入方式';
                            importModeModal.classList.add('active');
                        } catch (err) { await showAlert('解析出错：' + err.message, '导入失败'); }
                    };
                    reader.readAsArrayBuffer(file);
                } else if (ext === 'csv') {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        try {
                            let text = event.target.result;
                            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                            // 手动解析 CSV，避免 SheetJS 对 BOM 和编码的兼容问题
                            const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
                            if (lines.length < 2) { await showAlert('文件中没有找到数据。'); return; }
                            const headers = parseCsvLine(lines[0]);
                            const rows = [];
                            for (let i = 1; i < lines.length; i++) {
                                const vals = parseCsvLine(lines[i]);
                                const row = {};
                                headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
                                rows.push(row);
                            }
                            const parsed = parseTabularRows(rows);
                            if (!parsed) { await showAlert('未能解析出有效交易记录，请检查文件格式。'); return; }
                            pendingImportData = parsed;
                            let title = `解析到 ${parsed.count} 条记录`;
                            if (parsed.skipped > 0) title += `，跳过${parsed.skipped}条异常`;
                            document.querySelector('#importModeModal .dialog-title').textContent = title + '，选择导入方式';
                            importModeModal.classList.add('active');
                        } catch (err) { await showAlert('解析出错：' + err.message, '导入失败'); }
                    };
                    reader.readAsText(file, 'utf-8');
                } else {
                    await showAlert('不支持的文件格式，请选择 .json、.xlsx 或 .csv 文件。', '格式错误');
                }
            } catch (err) {
                await showAlert('导入出错：' + err.message, '导入失败');
            }
        };

        // 导入方式选择弹窗事件
        document.getElementById('closeImportModeModal').onclick = () => {
            importModeModal.classList.remove('active');
            pendingImportData = null;
        };

        importModeModal.onclick = (e) => {
            if (e.target === importModeModal) {
                importModeModal.classList.remove('active');
                pendingImportData = null;
            }
        };

        importModeModal.querySelectorAll('.export-format-option').forEach(opt => {
            opt.onclick = async () => {
                const mode = opt.dataset.mode;
                importModeModal.classList.remove('active');
                await applyImportData(mode);
            };
        });
    }

    // Exchange Rate Modal
    const modal = document.getElementById('exchangeRateModal');
    const usdInput = document.getElementById('usdRateInput');
    const hkdInput = document.getElementById('hkdRateInput');
    const statusText = document.getElementById('rateUpdateStatus');
    const exchangeRateBtn = document.getElementById('exchangeRateBtn');

    if (exchangeRateBtn && modal) {
        exchangeRateBtn.onclick = () => {
            const rates = getExchangeRates();
            usdInput.value = (rates.USD || 0).toFixed(4);
            hkdInput.value = (rates.HKD || 0).toFixed(4);
            statusText.textContent = '';
            modal.classList.add('active');
        };

        document.getElementById('closeExchangeRateModal').onclick = () => {
            modal.classList.remove('active');
        };

        document.getElementById('autoUpdateRateBtn').onclick = async () => {
            statusText.textContent = '正在获取最新汇率...';
            statusText.style.color = '#666';
            try {
                const res = await fetch('https://open.er-api.com/v6/latest/CNY');
                const data = await res.json();
                if (data && data.rates) {
                    if (data.rates.USD) usdInput.value = (1 / data.rates.USD).toFixed(4);
                    if (data.rates.HKD) hkdInput.value = (1 / data.rates.HKD).toFixed(4);
                    statusText.textContent = '获取成功！请点击保存生效。';
                    statusText.style.color = 'green';
                } else {
                    throw new Error('API format error');
                }
            } catch (e) {
                statusText.textContent = '获取失败，请检查网络或稍后重试。';
                statusText.style.color = 'red';
            }
        };

        document.getElementById('saveExchangeRateBtn').onclick = async () => {
            const u = parseFloat(usdInput.value);
            const h = parseFloat(hkdInput.value);
            if (isNaN(u) || isNaN(h) || u <= 0 || h <= 0) {
                await showAlert('请输入有效的正数汇率。');
                return;
            }

            const currentRates = getExchangeRates();
            currentRates.USD = u;
            currentRates.HKD = h;
            saveExchangeRates(currentRates);

            modal.classList.remove('active');
            refreshMineData();

            const confirmed = await showConfirm('汇率已保存。是否立即刷新应用以更新所有资产估算汇总？');
            if (confirmed) {
                location.reload();
            }
        };
    }

    // Dashang Modal
    const dashangModal = document.getElementById('dashangModal');
    const dashangBtn = document.getElementById('dashangBtn');

    if (dashangBtn && dashangModal) {
        dashangBtn.onclick = () => {
            dashangModal.classList.add('active');
        };

        document.getElementById('closeDashangModal').onclick = () => {
            dashangModal.classList.remove('active');
        };

        dashangModal.onclick = (e) => {
            if (e.target === dashangModal) {
                dashangModal.classList.remove('active');
            }
        };
    }

    // 前台服务开关 (仅安卓平台显示)
    const fgToggle = document.getElementById('foregroundToggle');
    const fgSwitch = document.getElementById('foregroundSwitch');
    if (fgToggle && fgSwitch) {
        // 仅在安卓平台显示
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Foreground) {
            fgToggle.style.display = 'flex';

            // 读取用户设置
            const fgDisabled = localStorage.getItem('beicai_fg_service_disabled');
            fgSwitch.checked = fgDisabled !== 'true';

            // 切换事件
            fgSwitch.onchange = async () => {
                const enabled = fgSwitch.checked;
                if (enabled) {
                    localStorage.removeItem('beicai_fg_service_disabled');
                    await window.Capacitor.Plugins.Foreground.start({
                        title: '贝才',
                        content: '记账服务运行中'
                    });
                } else {
                    localStorage.setItem('beicai_fg_service_disabled', 'true');
                    await window.Capacitor.Plugins.Foreground.stop();
                }
                // 更新 AI 记开关状态
                updateAiToggleState();
            };
        }
    }

    // AI 记开关 (仅安卓平台显示，依赖后台常驻)
    const aiToggle = document.getElementById('aiToggle');
    const aiSwitch = document.getElementById('aiSwitch');
    if (aiToggle && aiSwitch) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Foreground) {
            aiToggle.style.display = 'flex';

            // 读取用户设置
            const aiEnabled = localStorage.getItem('beicai_ai_enabled');
            aiSwitch.checked = aiEnabled === 'true';

            // 根据后台常驻状态设置可用性
            updateAiToggleState();

            // 切换事件
            aiSwitch.onchange = async () => {
                if (aiSwitch.disabled) return;
                const enabled = aiSwitch.checked;
                if (enabled) {
                    localStorage.setItem('beicai_ai_enabled', 'true');
                } else {
                    localStorage.removeItem('beicai_ai_enabled');
                }
                // 更新通知内容
                await window.Capacitor.Plugins.Foreground.updateNotification({
                    showAi: enabled
                });
                // 更新引导区域显示
                updateAiGuideSection();
            };

            // 初始化引导区域
            updateAiGuideSection();
        }
    }
}

/**
 * 更新 AI 记引导区域
 */
export async function updateAiGuideSection() {
    const header = document.getElementById('aiGuideHeader');
    const modal = document.getElementById('aiGuideModal');
    if (!header) return;

    const aiEnabled = localStorage.getItem('beicai_ai_enabled') === 'true';

    // 未开启AI记：显示灰色，不可点击
    if (!aiEnabled) {
        header.style.display = 'flex';
        header.style.opacity = '0.4';
        header.style.pointerEvents = 'none';
        return;
    }

    // 已开启AI记：正常显示，可点击打开弹窗
    header.style.display = 'flex';
    header.style.opacity = '1';
    header.style.pointerEvents = 'auto';

    // 点击打开弹窗
    header.onclick = () => {
        if (modal) modal.classList.add('active');
        updateGuideAccessibilityStatus();
    };

    // 关闭弹窗
    const closeBtn = document.getElementById('closeAiGuideModal');
    if (closeBtn) {
        closeBtn.onclick = () => { modal.classList.remove('active'); };
    }
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove('active');
        };
    }

    // 点击跳转到无障碍设置
    document.getElementById('guideAccessibility').onclick = async () => {
        modal.classList.remove('active');
        if (window.Capacitor?.Plugins?.AutoBook) {
            try { await window.Capacitor.Plugins.AutoBook.openAccessibilitySettings(); } catch (e) {}
        }
    };

    // 点击跳转到应用详情设置（自启动管理）
    document.getElementById('guideAutoStart').onclick = async () => {
        if (window.Capacitor?.Plugins?.AutoBook) {
            try { await window.Capacitor.Plugins.AutoBook.openAppSettings(); } catch (e) {}
        }
    };

    // 点击跳转到应用详情设置（权限管理）
    document.getElementById('guideAppManage').onclick = async () => {
        if (window.Capacitor?.Plugins?.AutoBook) {
            try { await window.Capacitor.Plugins.AutoBook.openAppSettings(); } catch (e) {}
        }
    };
}

/** 更新弹窗中无障碍权限的状态 */
async function updateGuideAccessibilityStatus() {
    if (!window.Capacitor?.Plugins?.AutoBook) return;
    try {
        const result = await window.Capacitor.Plugins.AutoBook.checkAccessibility();
        const guideAccIcon = document.getElementById('guideAccIcon');
        const guideAccAction = document.getElementById('guideAccAction');
        if (result.enabled) {
            guideAccIcon.style.color = '#4CAF50';
            guideAccAction.textContent = '已开启';
            guideAccAction.style.color = '#4CAF50';
        } else {
            guideAccIcon.style.color = '#f44336';
            guideAccAction.textContent = '未开启';
            guideAccAction.style.color = '#f44336';
        }
    } catch (e) {}
}

/**
 * 更新 AI 记开关的可用状态
 */
function updateAiToggleState() {
    const aiSwitch = document.getElementById('aiSwitch');
    const aiToggle = document.getElementById('aiToggle');
    if (!aiSwitch || !aiToggle) return;

    const fgDisabled = localStorage.getItem('beicai_fg_service_disabled');
    const isDisabled = fgDisabled === 'true';
    aiSwitch.disabled = isDisabled;
    aiToggle.style.opacity = isDisabled ? '0.5' : '1';

    if (isDisabled && aiSwitch.checked) {
        aiSwitch.checked = false;
        localStorage.removeItem('beicai_ai_enabled');
    }
}

// ==================== 账本管理 ====================

let editingLedgerId = null; // 当前正在编辑的账本 ID
let migrateSourceId = null; // 待迁移的源账本 ID
let migrateTargetId = null; // 迁移目标账本 ID

/** 更新当前账本名称显示 */
function updateActiveBookName() {
    const activeBook = getActiveBook();
    const nameEl = document.getElementById('activeBookName');
    if (nameEl && activeBook) {
        nameEl.textContent = activeBook.name;
    }
}

/** 渲染账本列表 */
function renderLedgerList() {
    const ledgers = loadLedgers();
    const activeBookId = getActiveBookId();
    const listEl = document.getElementById('ledgerList');
    if (!listEl) return;

    listEl.innerHTML = ledgers.map(ledger => {
        const stats = getLedgerStats(ledger.id);
        const isActive = ledger.id === activeBookId;
        const isDefault = ledger.isDefault;
        const canDelete = ledgers.length > 1;

        return `
            <div class="ledger-list-item ${isActive ? 'active' : ''}" data-book-id="${ledger.id}">
                <div class="ledger-icon">
                    <ion-icon name="${ledger.icon || 'book-outline'}"></ion-icon>
                </div>
                <div class="ledger-info">
                    <div class="ledger-name">${ledger.name}</div>
                    <div class="ledger-stats">${stats.txCount} 条记录</div>
                </div>
                ${isActive ? '<div class="ledger-badge">当前</div>' : ''}
                ${isDefault ? '<div class="ledger-badge" style="background:#666;">默认</div>' : ''}
                <div class="ledger-actions">
                    <button class="ledger-action-btn" data-action="edit" data-book-id="${ledger.id}" title="编辑">
                        <ion-icon name="create-outline"></ion-icon>
                    </button>
                    ${canDelete ? `
                        <button class="ledger-action-btn" data-action="delete" data-book-id="${ledger.id}" title="删除">
                            <ion-icon name="trash-outline"></ion-icon>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // 绑定列表项点击事件（切换账本）
    listEl.querySelectorAll('.ledger-list-item').forEach(item => {
        item.onclick = (e) => {
            // 忽略按钮点击
            if (e.target.closest('.ledger-action-btn')) return;

            const bookId = item.dataset.bookId;
            if (bookId === activeBookId) return;

            setActiveBookId(bookId);
            updateActiveBookName();

            // 关闭弹窗
            document.getElementById('ledgerModal').classList.remove('active');

            // 触发账本切换事件
            window.dispatchEvent(new CustomEvent('book-changed'));
        };
    });

    // 绑定编辑按钮事件
    listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const bookId = btn.dataset.bookId;
            const ledger = getLedgerById(bookId);
            if (ledger) {
                openLedgerForm(ledger);
            }
        };
    });

    // 绑定删除按钮事件
    listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const bookId = btn.dataset.bookId;
            handleDeleteLedger(bookId);
        };
    });
}

/** 打开账本编辑表单（新建/编辑） */
function openLedgerForm(ledger = null) {
    const modal = document.getElementById('ledgerEditModal');
    const titleEl = document.getElementById('ledgerEditTitle');
    const nameInput = document.getElementById('ledgerNameInput');
    const iconGrid = document.getElementById('ledgerIconGrid');

    if (!modal || !titleEl || !nameInput || !iconGrid) return;

    editingLedgerId = ledger ? ledger.id : null;
    titleEl.textContent = ledger ? '编辑账本' : '新建账本';
    nameInput.value = ledger ? ledger.name : '';

    // 可选图标列表
    const icons = [
        'book-outline', 'wallet-outline', 'home-outline', 'car-outline',
        'airplane-outline', 'gift-outline', 'heart-outline', 'star-outline',
        'briefcase-outline', 'school-outline', 'fitness-outline', 'restaurant-outline',
        'cart-outline', 'bag-outline', 'bed-outline', 'cafe-outline',
        'game-controller-outline', 'musical-notes-outline', 'paw-outline', 'phone-portrait-outline'
    ];

    const currentIcon = ledger ? (ledger.icon || 'book-outline') : 'book-outline';

    // 渲染图标网格
    iconGrid.innerHTML = icons.map(icon => `
        <div class="icon-grid-item ${icon === currentIcon ? 'selected' : ''}" data-icon="${icon}">
            <ion-icon name="${icon}"></ion-icon>
        </div>
    `).join('');

    // 绑定图标选择事件
    iconGrid.querySelectorAll('.icon-grid-item').forEach(item => {
        item.onclick = () => {
            iconGrid.querySelectorAll('.icon-grid-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        };
    });

    modal.classList.add('active');
    nameInput.focus();
}

/** 初始化账本管理弹窗 */
function setupLedgerModal() {
    const ledgerModal = document.getElementById('ledgerModal');
    const ledgerEditModal = document.getElementById('ledgerEditModal');
    const migrateModal = document.getElementById('migrateModal');

    if (!ledgerModal || !ledgerEditModal || !migrateModal) return;

    // 打开账本管理弹窗
    const ledgerManageBtn = document.getElementById('ledgerManageBtn');
    if (ledgerManageBtn) {
        ledgerManageBtn.onclick = () => {
            renderLedgerList();
            ledgerModal.classList.add('active');
        };
    }

    // 关闭账本管理弹窗
    document.getElementById('closeLedgerModal').onclick = () => {
        ledgerModal.classList.remove('active');
    };

    ledgerModal.onclick = (e) => {
        if (e.target === ledgerModal) {
            ledgerModal.classList.remove('active');
        }
    };

    // 新建账本按钮
    document.getElementById('addLedgerBtn').onclick = () => {
        openLedgerForm();
    };

    // 关闭账本编辑弹窗
    document.getElementById('cancelLedgerEdit').onclick = () => {
        ledgerEditModal.classList.remove('active');
        editingLedgerId = null;
    };

    ledgerEditModal.onclick = (e) => {
        if (e.target === ledgerEditModal) {
            ledgerEditModal.classList.remove('active');
            editingLedgerId = null;
        }
    };

    // 确认保存账本
    document.getElementById('confirmLedgerEdit').onclick = async () => {
        const name = document.getElementById('ledgerNameInput').value.trim();
        const selectedIconItem = document.querySelector('#ledgerIconGrid .icon-grid-item.selected');
        const icon = selectedIconItem ? selectedIconItem.dataset.icon : 'book-outline';

        if (!name) {
            await showAlert('请输入账本名称', '提示');
            return;
        }

        const ledger = {
            id: editingLedgerId || `book_${Date.now()}`,
            name,
            icon,
            isDefault: false,
            createdAt: new Date().toISOString()
        };

        // 如果是编辑，保留原有的 isDefault 和 createdAt
        if (editingLedgerId) {
            const existing = getLedgerById(editingLedgerId);
            if (existing) {
                ledger.isDefault = existing.isDefault;
                ledger.createdAt = existing.createdAt;
            }
        }

        const success = saveLedger(ledger);
        if (!success) {
            await showAlert('账本名称重复，请使用其他名称', '保存失败');
            return;
        }

        ledgerEditModal.classList.remove('active');
        editingLedgerId = null;

        // 刷新账本列表
        renderLedgerList();

        // 如果是新建账本，自动切换到新账本
        if (!editingLedgerId) {
            setActiveBookId(ledger.id);
            updateActiveBookName();
            window.dispatchEvent(new CustomEvent('book-changed'));
        }
    };

    // 取消迁移
    document.getElementById('cancelMigrate').onclick = () => {
        migrateModal.classList.remove('active');
        migrateSourceId = null;
        migrateTargetId = null;
    };

    migrateModal.onclick = (e) => {
        if (e.target === migrateModal) {
            migrateModal.classList.remove('active');
            migrateSourceId = null;
            migrateTargetId = null;
        }
    };

    // 确认迁移
    document.getElementById('confirmMigrate').onclick = async () => {
        if (!migrateSourceId || !migrateTargetId) {
            await showAlert('请选择目标账本', '提示');
            return;
        }

        // 执行迁移
        const count = migrateTransactions(migrateSourceId, migrateTargetId);

        // 删除源账本
        deleteLedger(migrateSourceId);

        // 如果删除的是当前活跃账本，切换到目标账本
        if (getActiveBookId() === migrateSourceId) {
            setActiveBookId(migrateTargetId);
            updateActiveBookName();
        }

        migrateModal.classList.remove('active');
        migrateSourceId = null;
        migrateTargetId = null;

        // 关闭账本管理弹窗并刷新
        document.getElementById('ledgerModal').classList.remove('active');
        window.dispatchEvent(new CustomEvent('book-changed'));

        await showAlert(`已迁移 ${count} 条记录`, '迁移成功');
    };

    // 直接删除（含记录）
    document.getElementById('forceDeleteMigrate').onclick = async () => {
        if (!migrateSourceId) return;

        const ledger = getLedgerById(migrateSourceId);
        const stats = getLedgerStats(migrateSourceId);

        const confirmed = await showConfirm(`确定删除账本「${ledger ? ledger.name : ''}」及其 ${stats.txCount} 条记录？此操作不可恢复！`);
        if (!confirmed) return;

        // 删除账本下的所有交易
        const transactions = JSON.parse(localStorage.getItem('beicai_transactions') || '[]');
        const filteredTxs = transactions.filter(t => t.bookId !== migrateSourceId);
        localStorage.setItem('beicai_transactions', JSON.stringify(filteredTxs));

        // 删除账本
        deleteLedger(migrateSourceId);

        // 如果删除的是当前活跃账本，切换到默认账本
        if (getActiveBookId() === migrateSourceId) {
            const defaultLedger = loadLedgers().find(l => l.isDefault);
            if (defaultLedger) {
                setActiveBookId(defaultLedger.id);
            } else if (loadLedgers().length > 0) {
                setActiveBookId(loadLedgers()[0].id);
            }
            updateActiveBookName();
        }

        migrateModal.classList.remove('active');
        migrateSourceId = null;
        migrateTargetId = null;

        // 关闭账本管理弹窗并刷新
        document.getElementById('ledgerModal').classList.remove('active');
        window.dispatchEvent(new CustomEvent('book-changed'));

        await showAlert(`已删除账本及 ${stats.txCount} 条记录`, '删除成功');
    };
}

/** 处理删除账本 */
async function handleDeleteLedger(bookId) {
    const ledger = getLedgerById(bookId);
    if (!ledger) return;

    const stats = getLedgerStats(bookId);

    if (stats.txCount === 0) {
        // 无记录，直接删除
        const confirmed = await showConfirm(`确定删除账本「${ledger.name}」？`);
        if (confirmed) {
            deleteLedger(bookId);
            renderLedgerList();
            updateActiveBookName();
            window.dispatchEvent(new CustomEvent('book-changed'));
        }
    } else {
        // 有记录，需要迁移
        const migrateModal = document.getElementById('migrateModal');
        const infoText = document.getElementById('migrateInfoText');
        const targetList = document.getElementById('migrateTargetList');

        if (!migrateModal || !infoText || !targetList) return;

        migrateSourceId = bookId;
        migrateTargetId = null;

        infoText.textContent = `账本「${ledger.name}」中有 ${stats.txCount} 条记录`;

        // 获取其他账本作为迁移目标
        const ledgers = loadLedgers().filter(l => l.id !== bookId);
        targetList.innerHTML = ledgers.map(l => `
            <div class="migrate-target-item" data-book-id="${l.id}">
                <ion-icon name="${l.icon || 'book-outline'}"></ion-icon>
                <span>${l.name}</span>
            </div>
        `).join('');

        // 绑定目标选择事件
        targetList.querySelectorAll('.migrate-target-item').forEach(item => {
            item.onclick = () => {
                migrateTargetId = item.dataset.bookId;
                targetList.querySelectorAll('.migrate-target-item').forEach(i => {
                    i.classList.toggle('selected', i.dataset.bookId === migrateTargetId);
                });
            };
        });

        migrateModal.classList.add('active');
    }
}
