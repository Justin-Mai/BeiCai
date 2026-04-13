import { getUsageStats, getExchangeRates, saveExchangeRates } from './store.js';

export function renderMineTab() {
    // 0. Update Profile
    const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
    document.getElementById('userNameDisplay').textContent = profile.name;
    document.getElementById('userSloganDisplay').textContent = profile.slogan;
    document.getElementById('userAvatarContainer').innerHTML = `<span style="font-size: 38px;">${profile.avatar}</span>`;

    // 1. Update stats
    const stats = getUsageStats();
    document.getElementById('daysUsedCount').textContent = stats.daysUsed;
    document.getElementById('consecutiveDaysCount').textContent = stats.consecutiveDays;

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

function setupMineEvents() {
    // Profile Edit
    const profileModal = document.getElementById('profileModal');
    const editProfileBtn = document.getElementById('editProfileBtn');
    
    if (editProfileBtn && profileModal) {
        editProfileBtn.onclick = () => {
            const profile = JSON.parse(localStorage.getItem('beicai_user_profile') || '{"avatar": "😊", "name": "极简达人", "slogan": "简单记账，掌控生活"}');
            document.getElementById('avatarInput').value = profile.avatar;
            document.getElementById('nameInput').value = profile.name;
            document.getElementById('sloganInput').value = profile.slogan;
            profileModal.classList.add('active');
        };

        document.getElementById('closeProfileModal').onclick = () => {
            profileModal.classList.remove('active');
        };

        document.getElementById('saveProfileBtn').onclick = () => {
            const avatar = document.getElementById('avatarInput').value.trim() || '😊';
            const name = document.getElementById('nameInput').value.trim() || '极简达人';
            const slogan = document.getElementById('sloganInput').value.trim() || '简单记账，掌控生活';
            
            localStorage.setItem('beicai_user_profile', JSON.stringify({ avatar, name, slogan }));
            profileModal.classList.remove('active');
            renderMineTab(); 
        };
    }

    // Export Data
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.onclick = () => {
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

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupObj, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
            downloadAnchorNode.setAttribute("download", `beicai_backup_${dateStr}.json`);
            document.body.appendChild(downloadAnchorNode); // required for firefox
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        };
    }

    // Import Data
    const importInput = document.getElementById('importFileInput');
    const importBtn = document.getElementById('importDataBtn');
    if (importBtn && importInput) {
        importBtn.onclick = () => {
            importInput.click();
        };

        importInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    if (data.transactions && data.accounts) {
                        if (confirm('即将覆盖当前所有数据。导入后应用将重启，是否继续？')) {
                            localStorage.setItem('beicai_transactions', JSON.stringify(data.transactions));
                            localStorage.setItem('beicai_accounts', JSON.stringify(data.accounts));
                            if (data.exchangeRates) {
                                localStorage.setItem('beicai_exchange_rates', JSON.stringify(data.exchangeRates));
                            }
                            if (data.installDate) {
                                localStorage.setItem('beicai_install_date', data.installDate);
                            }
                            alert('数据导入成功！');
                            location.reload();
                        }
                    } else {
                        alert('导入文件格式不正确，缺少关键数据节点。');
                    }
                } catch (err) {
                    alert('解析文件出错，请确保是有效的 JSON 备份文件。');
                }
            };
            reader.readAsText(file);
            importInput.value = ''; // reset
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
        document.getElementById('saveExchangeRateBtn').onclick = () => {
            const u = parseFloat(usdInput.value);
            const h = parseFloat(hkdInput.value);
            if (isNaN(u) || isNaN(h) || u <= 0 || h <= 0) {
                alert('请输入有效的正数汇率。');
                return;
            }

            const currentRates = getExchangeRates();
            currentRates.USD = u;
            currentRates.HKD = h;
            saveExchangeRates(currentRates);
            
            modal.classList.remove('active');
            renderMineTab(); // update text
            
            // 提示刷新
            if (confirm('汇率已保存。是否立即刷新应用以更新所有资产估算汇总？')) {
                location.reload();
            }
        };
    }
}
