/**
 * 自定义弹窗模块 - 替代原生 alert/confirm/prompt
 */

function ensureDialogContainer() {
    let container = document.getElementById('customDialogContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'customDialogContainer';
        document.body.appendChild(container);
    }
    return container;
}

/**
 * 自定义 alert
 */
export function showAlert(message, title = '提示') {
    return new Promise(resolve => {
        const container = ensureDialogContainer();
        container.innerHTML = `
            <div class="dialog-overlay active" id="alertOverlay">
                <div class="dialog-box">
                    <div class="dialog-title">${title}</div>
                    <div class="dialog-message">${message}</div>
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-primary" id="alertOkBtn">确定</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('alertOkBtn').onclick = () => {
            container.innerHTML = '';
            resolve();
        };
    });
}

/**
 * 自定义 confirm
 */
export function showConfirm(message, title = '确认') {
    return new Promise(resolve => {
        const container = ensureDialogContainer();
        container.innerHTML = `
            <div class="dialog-overlay active" id="confirmOverlay">
                <div class="dialog-box">
                    <div class="dialog-title">${title}</div>
                    <div class="dialog-message">${message}</div>
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-cancel" id="confirmCancelBtn">取消</button>
                        <button class="dialog-btn dialog-btn-primary" id="confirmOkBtn">确定</button>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('confirmCancelBtn').onclick = () => {
            container.innerHTML = '';
            resolve(false);
        };
        document.getElementById('confirmOkBtn').onclick = () => {
            container.innerHTML = '';
            resolve(true);
        };
    });
}

/**
 * 自定义 prompt
 */
export function showPrompt(message, defaultValue = '', title = '输入') {
    return new Promise(resolve => {
        const container = ensureDialogContainer();
        container.innerHTML = `
            <div class="dialog-overlay active" id="promptOverlay">
                <div class="dialog-box">
                    <div class="dialog-title">${title}</div>
                    <div class="dialog-message">${message}</div>
                    <div class="dialog-input-wrap">
                        <input type="text" class="dialog-input" id="promptInput" value="${defaultValue}">
                    </div>
                    <div class="dialog-actions">
                        <button class="dialog-btn dialog-btn-cancel" id="promptCancelBtn">取消</button>
                        <button class="dialog-btn dialog-btn-primary" id="promptOkBtn">确定</button>
                    </div>
                </div>
            </div>
        `;
        const input = document.getElementById('promptInput');
        input.focus();
        input.select();
        document.getElementById('promptCancelBtn').onclick = () => {
            container.innerHTML = '';
            resolve(null);
        };
        document.getElementById('promptOkBtn').onclick = () => {
            const val = input.value;
            container.innerHTML = '';
            resolve(val);
        };
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                const val = input.value;
                container.innerHTML = '';
                resolve(val);
            }
        };
    });
}
