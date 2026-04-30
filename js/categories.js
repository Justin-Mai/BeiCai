/**
 * 分类配置数据
 * 所有支出/收入分类以 JSON 数组形式管理，由 JS 动态生成 UI
 * 支持默认分类 + 用户自定义分类
 */

const CUSTOM_CATEGORIES_KEY = 'beicai_custom_categories';

export const DEFAULT_EXPENSE_CATEGORIES = [
    { id: 'food', icon: 'restaurant-outline', name: '餐饮' },
    { id: 'snack', icon: 'ice-cream-outline', name: '零食' },
    { id: 'takeout', icon: 'bicycle-outline', name: '外卖' },
    { id: 'transport', icon: 'bus-outline', name: '交通' },
    { id: 'comm', icon: 'call-outline', name: '通讯' },
    { id: 'housing', icon: 'home-outline', name: '住房' },
    { id: 'home', icon: 'bed-outline', name: '居家' },
    { id: 'clothing', icon: 'shirt-outline', name: '服饰' },
    { id: 'beauty', icon: 'color-wand-outline', name: '美妆' },
    { id: 'shopping', icon: 'cart-outline', name: '购物' },
    { id: 'sports', icon: 'football-outline', name: '运动' },
    { id: 'entertainment', icon: 'game-controller-outline', name: '娱乐' },
    { id: 'social', icon: 'people-outline', name: '社交' },
    { id: 'medical', icon: 'medkit-outline', name: '医疗' },
    { id: 'education', icon: 'school-outline', name: '教育' },
    { id: 'books', icon: 'book-outline', name: '书籍' },
    { id: 'child', icon: 'happy-outline', name: '孩子' },
    { id: 'pet', icon: 'paw-outline', name: '宠物' },
    { id: 'digital', icon: 'phone-portrait-outline', name: '数码' },
    { id: 'daily', icon: 'cube-outline', name: '日用' },
    { id: 'gift_out', icon: 'gift-outline', name: '礼金' },
    { id: 'elder', icon: 'people-circle-outline', name: '长辈' },
    { id: 'invest_loss', icon: 'trending-down-outline', name: '理财亏损' },
    { id: 'other_expense', icon: 'ellipsis-horizontal-outline', name: '其他' },
];

export const DEFAULT_INCOME_CATEGORIES = [
    { id: 'salary', icon: 'wallet-outline', name: '工资' },
    { id: 'sidejob', icon: 'briefcase-outline', name: '副业' },
    { id: 'investment', icon: 'trending-up-outline', name: '理财' },
    { id: 'gift', icon: 'gift-outline', name: '礼金' },
    { id: 'reimburse', icon: 'receipt-outline', name: '报销' },
    { id: 'refund', icon: 'arrow-undo-outline', name: '退款' },
    { id: 'medical_ins', icon: 'medkit-outline', name: '医保' },
    { id: 'housing_fund', icon: 'business-outline', name: '公积金' },
    { id: 'annuity', icon: 'time-outline', name: '年金' },
    { id: 'other_income', icon: 'ellipsis-horizontal-outline', name: '其他' },
];

/**
 * 获取用户自定义分类
 */
function getCustomCategories() {
    try {
        const saved = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
        return saved ? JSON.parse(saved) : { expense: [], income: [] };
    } catch {
        return { expense: [], income: [] };
    }
}

/**
 * 获取全部分类（默认 + 自定义）
 * @param {'expense'|'income'} type
 * @returns {Array}
 */
export function getCategories(type) {
    const defaults = type === 'expense' ? DEFAULT_EXPENSE_CATEGORIES : DEFAULT_INCOME_CATEGORIES;
    const custom = getCustomCategories()[type] || [];
    return [...defaults, ...custom];
}

/**
 * 添加自定义分类
 * @param {'expense'|'income'} type
 * @param {{ icon: string, name: string }} category
 */
export function addCustomCategory(type, category) {
    const all = getCustomCategories();
    if (!all[type]) all[type] = [];
    const id = 'custom_' + Date.now();
    all[type].push({ id, icon: category.icon, name: category.name });
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
}

/**
 * 删除自定义分类
 * @param {'expense'|'income'} type
 * @param {string} id
 */
export function deleteCustomCategory(type, id) {
    const all = getCustomCategories();
    if (all[type]) {
        all[type] = all[type].filter(c => c.id !== id);
        localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
    }
}

/**
 * 可选图标列表（用于自定义分类选择图标）
 */
export const CATEGORY_ICONS = [
    'restaurant-outline', 'cafe-outline', 'ice-cream-outline', 'wine-outline', 'bicycle-outline',
    'bus-outline', 'car-outline', 'train-outline', 'airplane-outline', 'boat-outline',
    'call-outline', 'wifi-outline', 'home-outline', 'bed-outline', 'build-outline',
    'shirt-outline', 'color-wand-outline', 'cut-outline', 'cart-outline', 'bag-outline',
    'football-outline', 'barbell-outline', 'game-controller-outline', 'musical-notes-outline', 'film-outline',
    'people-outline', 'chatbubbles-outline', 'heart-outline', 'gift-outline', 'hand-left-outline',
    'medkit-outline', 'fitness-outline', 'bandage-outline', 'school-outline', 'book-outline',
    'library-outline', 'pencil-outline', 'create-outline', 'calculator-outline', 'phone-portrait-outline',
    'laptop-outline', 'camera-outline', 'headset-outline', 'watch-outline', 'key-outline',
    'happy-outline', 'paw-outline', 'leaf-outline', 'flower-outline', 'sunny-outline',
    'umbrella-outline', 'briefcase-outline', 'wallet-outline', 'cash-outline', 'card-outline',
    'trending-up-outline', 'receipt-outline', 'document-text-outline', 'folder-outline', 'flag-outline',
    'star-outline', 'ribbon-outline', 'trophy-outline', 'medal-outline', 'diamond-outline',
    'flash-outline', 'battery-charging-outline', 'rocket-outline', 'globe-outline', 'map-outline',
    'navigate-outline', 'compass-outline', 'time-outline', 'alarm-outline', 'hourglass-outline',
    'lock-closed-outline', 'shield-checkmark-outline', 'keypad-outline', 'options-outline', 'settings-outline',
    'arrow-undo-outline', 'arrow-redo-outline', 'swap-vertical-outline', 'sync-outline', 'download-outline',
    'cloud-outline', 'server-outline', 'code-outline', 'bug-outline', 'hammer-outline',
    'ellipsis-horizontal-outline', 'add-circle-outline', 'remove-circle-outline', 'checkmark-circle-outline',
];
