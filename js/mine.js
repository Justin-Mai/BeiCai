import { getUsageStats, getExchangeRates, saveExchangeRates, checkStorageHealth } from './store.js';
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

/** 构建导出数据行（通用） */
function buildExportRows() {
    const txs = JSON.parse(localStorage.getItem('beicai_transactions') || '[]');
    const accNameMap = buildAccountNameMap();
    return txs
        .filter(t => !t.isAdjustment)
        .map(t => ({
            '日期': t.date,
            '类型': t.type === 'income' ? '收入' : '支出',
            '分类': t.title,
            '金额': parseFloat(t.amount) || 0,
            '账户': t.accountId ? (accNameMap[t.accountId] || '') : '',
            '备注': t.note || ''
        }));
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
async function exportAsJson() {
    const txs = localStorage.getItem('beicai_transactions') || '[]';
    const accs = localStorage.getItem('beicai_accounts') || '[]';
    const rates = localStorage.getItem('beicai_exchange_rates') || '{}';
    const installDate = localStorage.getItem('beicai_install_date') || '';

    const backupObj = {
        transactions: JSON.parse(txs),
        accounts: JSON.parse(accs),
        exchangeRates: JSON.parse(rates),
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
async function exportAsExcel() {
    const rows = buildExportRows();
    const headers = ['日期', '类型', '分类', '金额', '账户', '备注'];
    const aoa = [headers, ...rows.map(r => headers.map(h => r[h]))];

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [
        { wch: 12 }, { wch: 6 }, { wch: 10 },
        { wch: 12 }, { wch: 12 }, { wch: 20 }
    ];
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
async function exportAsCsv() {
    const rows = buildExportRows();
    const headers = ['日期', '类型', '分类', '金额', '账户', '备注'];
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
        if (mode === 'overwrite') {
            if (data.transactions && !safeSetItem('beicai_transactions', JSON.stringify(data.transactions))) {
                await showAlert('导入失败：存储空间不足，请先清理旧数据。', '存储已满');
                return;
            }
            if (data.accounts) safeSetItem('beicai_accounts', JSON.stringify(data.accounts));
            if (data.exchangeRates) safeSetItem('beicai_exchange_rates', JSON.stringify(data.exchangeRates));
            if (data.installDate) safeSetItem('beicai_install_date', data.installDate);
        } else {
            // 合并模式：去重后追加
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
    const txs = [];
    let skipped = 0;

    rows.forEach((row, idx) => {
        const date = row['日期'] || row['时间'] || row['date'] || '';
        const typeStr = row['类型'] || row['type'] || '';
        const category = row['分类'] || row['类别'] || row['category'] || '';
        let amount = row['金额'] || row['amount'] || '0';
        const accountName = row['账户'] || row['account'] || '';
        const note = row['备注'] || row['描述'] || row['note'] || '';

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

        txs.push({
            id: Date.now() + idx,
            type, title: category || '其他', icon,
            amount: numAmount.toFixed(2),
            date: parsedDate, note: note || '', accountId
        });
    });

    if (txs.length === 0) return null;
    return { transactions: txs, count: txs.length, skipped };
}

// ============ 事件绑定 ============

function setupMineEvents() {
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
        exportBtn.onclick = () => {
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

        exportFormatModal.querySelectorAll('.export-format-option').forEach(opt => {
            opt.onclick = async () => {
                const format = opt.dataset.format;
                exportFormatModal.classList.remove('active');
                if (format === 'json') await exportAsJson();
                else if (format === 'xlsx') await exportAsExcel();
                else if (format === 'csv') await exportAsCsv();
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
            };
        }
    }
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
