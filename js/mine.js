import { getUsageStats, getExchangeRates, saveExchangeRates } from './store.js';
import { showAlert, showConfirm } from './dialog.js';
import { initAvatarCrop } from './avatar-crop.js';

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

export function renderMineTab() {
    // 0. Update Profile
    const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
    document.getElementById('userNameDisplay').textContent = profile.name;
    document.getElementById('userSloganDisplay').textContent = profile.slogan;
    renderAvatar(document.getElementById('userAvatarContainer'), profile.avatar);

    // 1. Update stats
    const stats = getUsageStats();
    document.getElementById('daysUsedCount').textContent = stats.accountingDays;

    // 2. Setup Exchange Rates info
    const rates = getExchangeRates();
    const infoSpan = document.getElementById('exchangeRateInfo');
    if (infoSpan) {
        infoSpan.innerHTML = `USD: ${rates.USD.toFixed(2)} &nbsp;|&nbsp; HKD: ${rates.HKD.toFixed(2)}`;
    }

    // 3. Setup event listeners if not already done
    if (!window.mineEventsBound) {
        setupMineEvents();
        window.mineEventsBound = true;
    }
}

// 临时存储裁剪后的头像
let pendingAvatar = null;

let avatarCropInitialized = false;

function setupMineEvents() {
    // 初始化头像裁剪（只初始化一次）
    if (!avatarCropInitialized) {
    initAvatarCrop((dataUrl) => {
        pendingAvatar = dataUrl;
        // 更新预览
        const preview = document.getElementById('avatarPreview');
        if (preview) {
            preview.innerHTML = `<img src="${dataUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    });
    avatarCropInitialized = true;
    } // end avatarCropInitialized check

    // Profile Edit
    const profileModal = document.getElementById('profileModal');
    const editProfileBtn = document.getElementById('editProfileBtn');

    if (editProfileBtn && profileModal) {
        editProfileBtn.onclick = () => {
            const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
            pendingAvatar = null;

            // 更新头像预览
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

        document.getElementById('saveProfileBtn').onclick = () => {
            const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
            const avatar = pendingAvatar || profile.avatar || '😊';
            const name = document.getElementById('nameInput').value.trim() || '极简达人';
            const slogan = document.getElementById('sloganInput').value.trim() || '简单记账，掌控生活';

            localStorage.setItem('beicai_user_profile', JSON.stringify({ avatar, name, slogan }));
            profileModal.classList.remove('active');
            pendingAvatar = null;
            renderMineTab();
        };
    }

    // Export Data
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.onclick = async () => {
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
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            const fileName = `beicai_backup_${dateStr}.json`;

            try {
                // 使用自定义原生插件保存到下载目录
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.FileExport) {
                    await window.Capacitor.Plugins.FileExport.exportJson({
                        data: jsonStr,
                        fileName: fileName
                    });
                    await showAlert(`备份已保存到：下载/${fileName}`, '导出成功');
                    return;
                }

                // 降级：浏览器下载
                const blob = new Blob([jsonStr], { type: 'application/json' });
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
            } catch (e) {
                console.error('Export error:', e);
                await showAlert('导出失败：' + (e.message || '未知错误'), '错误');
            }
        };
    }

    // Import Data
    const importInput = document.getElementById('importFileInput');
    const importBtn = document.getElementById('importDataBtn');
    if (importBtn && importInput) {
        importBtn.onclick = () => {
            importInput.click();
        };

        importInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    // 清除 BOM 和多余空白
                    let text = event.target.result;
                    if (text.charCodeAt(0) === 0xFEFF) {
                        text = text.slice(1);
                    }
                    text = text.trim();

                    const data = JSON.parse(text);
                    if (data.transactions && data.accounts) {
                        const confirmed = await showConfirm('即将覆盖当前所有数据。导入后应用将重启，是否继续？');
                        if (confirmed) {
                            localStorage.setItem('beicai_transactions', JSON.stringify(data.transactions));
                            localStorage.setItem('beicai_accounts', JSON.stringify(data.accounts));
                            if (data.exchangeRates) {
                                localStorage.setItem('beicai_exchange_rates', JSON.stringify(data.exchangeRates));
                            }
                            if (data.installDate) {
                                localStorage.setItem('beicai_install_date', data.installDate);
                            }
                            // 重置事件绑定标记，强制重新绑定
                            window.mineEventsBound = false;
                            // 清除弹窗容器
                            const dc = document.getElementById('customDialogContainer');
                            if (dc) dc.innerHTML = '';
                            // 重新渲染当前页面
                            renderMineTab();
                            // 通知主页面刷新数据
                            window.dispatchEvent(new CustomEvent('data-imported'));
                            await showAlert('数据导入成功！');
                        }
                    } else {
                        await showAlert('导入文件格式不正确，缺少关键数据节点。');
                    }
                } catch (err) {
                    await showAlert('解析出错：' + err.message, '导入失败');
                }
            };
            reader.readAsText(file, 'utf-8');
            importInput.value = '';
        };
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
            usdInput.value = rates.USD.toFixed(4);
            hkdInput.value = rates.HKD.toFixed(4);
            statusText.textContent = '';
            modal.classList.add('active');
        };

        document.getElementById('closeExchangeRateModal').onclick = () => {
            modal.classList.remove('active');
        };

        // Auto update
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

        // Save
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
            renderMineTab();

            const confirmed = await showConfirm('汇率已保存。是否立即刷新应用以更新所有资产估算汇总？');
            if (confirmed) {
                location.reload();
            }
        };
    }

    // Dashang (打赏作者) Modal
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
}
