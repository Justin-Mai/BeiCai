/**
 * 分类配置数据
 * 所有支出/收入分类以 JSON 数组形式管理，由 JS 动态生成 UI
 */

export const EXPENSE_CATEGORIES = [
    { id: 'food', icon: 'restaurant-outline', name: '餐饮' },
    { id: 'transport', icon: 'bus-outline', name: '交通' },
    { id: 'shopping', icon: 'cart-outline', name: '购物' },
    { id: 'housing', icon: 'home-outline', name: '居住' },
    { id: 'entertainment', icon: 'game-controller-outline', name: '娱乐' },
    { id: 'medical', icon: 'medkit-outline', name: '医疗' },
    { id: 'education', icon: 'book-outline', name: '教育' },
    { id: 'other', icon: 'ellipsis-horizontal-outline', name: '其他' }
];

export const INCOME_CATEGORIES = [
    { id: 'salary', icon: 'cash-outline', name: '薪水' },
    { id: 'investment', icon: 'trending-up-outline', name: '理财' },
    { id: 'gift', icon: 'gift-outline', name: '礼金' },
    { id: 'other', icon: 'ellipsis-horizontal-outline', name: '其他' }
];
