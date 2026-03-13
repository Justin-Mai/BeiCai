/**
 * 数字键盘逻辑
 * 封装金额输入的状态管理和数学运算，不直接操作 DOM
 *
 * 【重要】内部 currentAmount 只使用 ASCII 字符：+  -  *
 *        显示时由 getDisplayAmount() 将 * 转回 ×
 */

export function createKeypadController() {
    let currentAmount = "0";

    return {
        /** 获取原始金额字符串（内部用，含 * ） */
        getCurrentAmount() {
            return currentAmount;
        },

        /** 获取用于界面展示的金额字符串（* → ×） */
        getDisplayAmount() {
            return currentAmount.replace(/\*/g, '×');
        },

        /** 设置金额（用于编辑模式） */
        setAmount(val) {
            currentAmount = val;
        },

        /** 重置为 0 */
        reset() {
            currentAmount = "0";
        },

        /**
         * 处理数字键（0-9 和 .）
         */
        handleNumKey(val) {
            if (currentAmount === "NaN" || currentAmount === "Infinity") {
                currentAmount = "0";
            }

            // 取当前正在输入的数字段
            const parts = currentAmount.split(/[+\-*]/);
            const currentPart = parts[parts.length - 1];

            if (val === '.') {
                if (!currentPart.includes('.')) {
                    currentAmount += '.';
                }
            } else {
                if (currentAmount === "0") {
                    currentAmount = val;
                } else if (currentPart === "0") {
                    currentAmount = currentAmount.slice(0, -1) + val;
                } else if (currentPart.length < 10) {
                    if (currentPart.includes('.')) {
                        const decimals = currentPart.split('.')[1];
                        if (decimals.length < 2) {
                            currentAmount += val;
                        }
                    } else {
                        currentAmount += val;
                    }
                }
            }
            return currentAmount;
        },

        /**
         * 处理运算符键（+ - × 等）
         * 入口处立刻将 × 转为 *，内部只存 ASCII
         */
        handleOperator(operator) {
            // 标准化：把任何形式的乘号都转成 *
            let op = operator;
            if (op === '×' || op === 'x' || op === 'X') {
                op = '*';
            }

            if (/[+\-*]$/.test(currentAmount)) {
                // 末尾已有运算符，替换之
                currentAmount = currentAmount.slice(0, -1);
            } else if (/[+\-*]/.test(currentAmount)) {
                // 式子里已有运算符（如 10+5），先结算
                this.evaluateMath();
            }
            currentAmount += op;
            return currentAmount;
        },

        /** 删除最后一个字符 */
        handleDelete() {
            if (currentAmount.length > 1) {
                currentAmount = currentAmount.slice(0, -1);
            } else {
                currentAmount = "0";
            }
            return currentAmount;
        },

        /** 清空 */
        handleClear() {
            currentAmount = "0";
            return currentAmount;
        },

        /**
         * 计算数学表达式
         */
        evaluateMath() {
            try {
                let expression = currentAmount;
                // 去除末尾运算符
                expression = expression.replace(/[+\-*]+$/, '');
                // 去除末尾孤立小数点
                expression = expression.replace(/\.([+\-*])/g, '$1');
                if (expression.endsWith('.')) {
                    expression = expression.slice(0, -1);
                }

                if (!expression) {
                    currentAmount = "0";
                    return currentAmount;
                }

                const result = new Function('return (' + expression + ')')();

                if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
                    currentAmount = "0";
                } else {
                    currentAmount = (Math.round(result * 100) / 100).toString();
                }
            } catch (e) {
                currentAmount = "0";
            }
            return currentAmount;
        },

        /**
         * 当前金额是否包含运算符
         */
        hasOperator() {
            return /[+\-*]/.test(currentAmount);
        }
    };
}
