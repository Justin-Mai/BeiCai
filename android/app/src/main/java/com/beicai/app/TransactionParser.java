package com.beicai.app;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 记账要素解析器 - 从OCR文本中提取金额、商户、分类、日期
 * 使用规则引擎（正则 + 关键词匹配），完全离线运行
 */
public class TransactionParser {

    /** 解析结果 */
    public static class ParseResult {
        public String amount;      // 金额字符串，如 "25.50"
        public String type;        // "expense" 或 "income"
        public String category;    // 分类名称
        public String icon;        // 分类图标
        public String merchant;    // 商户名
        public String note;        // 备注
        public String date;        // 日期 YYYY-MM-DD
        public double confidence;  // 置信度 0.0~1.0
    }

    // ==================== 分类关键词映射（支出） ====================
    private static final Map<String, String[]> EXPENSE_CATEGORY_MAP = new LinkedHashMap<String, String[]>() {{
        put("餐饮", new String[]{"肯德基","麦当劳","星巴克","瑞幸","美团","饿了么","海底捞","必胜客","餐饮","餐厅","饭店","食堂","小吃","火锅","烧烤","奶茶","咖啡","蛋糕","面包","披萨","寿司","麻辣烫","黄焖鸡","沙县","蜜雪冰城","喜茶","奈雪","茶百道","古茗","霸王茶姬","库迪","Tims","汉堡王","德克士","吉野家","真功夫","西贝"});
        put("零食", new String[]{"零食","坚果","薯片","巧克力","糖果","饼干","瓜子","花生","三只松鼠","良品铺子","百草味","来伊份","绝味","周黑鸭"});
        put("外卖", new String[]{"外卖","配送费","跑腿费","美团外卖","饿了么外卖"});
        put("交通", new String[]{"滴滴","出租车","地铁","公交","高铁","火车","机票","航空","打车","停车","加油","充电","过路费","ETC","共享单车","哈啰","青桔","美团单车","T3出行","曹操出行","高德打车","铁路12306","携程","飞猪","去哪儿","同程"});
        put("通讯", new String[]{"中国移动","中国联通","中国电信","话费","流量","宽带","充值","手机充值"});
        put("住房", new String[]{"房租","物业","水费","电费","燃气","暖气","房贷","租金","物业费","供暖费"});
        put("居家", new String[]{"家居","家具","装修","保洁","洗衣","维修","快递","驿站","菜鸟","顺丰","京东快递","中通","圆通","韵达","申通","极兔"});
        put("服饰", new String[]{"优衣库","ZARA","H&M","GAP","服装","衣服","鞋","包","帽","袜","内衣","NIKE","阿迪达斯","安踏","李宁","耐克"});
        put("美妆", new String[]{"化妆品","护肤","美甲","美发","理发","面膜","口红","香水","兰蔻","雅诗兰黛","欧莱雅","资生堂","SK-II","完美日记","花西子","珀莱雅"});
        put("购物", new String[]{"淘宝","京东","拼多多","天猫","苏宁","唯品会","商城","超市","便利店","百货","沃尔玛","永辉","盒马","大润发","全家","7-11","罗森","物美","华润万家","山姆","Costco","名创优品","无印良品","宜家"});
        put("运动", new String[]{"健身","游泳","瑜伽","球场","运动","体育","器材","Keep","健身房","羽毛球场","篮球场"});
        put("娱乐", new String[]{"电影","游戏","KTV","网吧","剧本杀","密室","演出","门票","景区","旅游","酒店","民宿","Steam","PlayStation","Switch","电影院","万达","猫眼","淘票票","大麦","迪士尼","环球影城"});
        put("社交", new String[]{"红包","转账","AA","聚会","请客","份子钱","随礼"});
        put("医疗", new String[]{"医院","药房","药店","诊所","挂号","体检","牙科","眼科","药","处方","口腔","丁香医生","阿里健康","京东健康"});
        put("教育", new String[]{"学费","培训","课程","教材","考试","书店","图书馆","网课","得到","知乎","极客时间","慕课"});
        put("书籍", new String[]{"图书","书籍","当当","kindle","电子书","阅读","豆瓣阅读","微信读书"});
        put("孩子", new String[]{"奶粉","尿不湿","玩具","幼儿园","托儿所","童装","童鞋","婴儿","母婴"});
        put("宠物", new String[]{"宠物","猫粮","狗粮","宠物医院","宠物店","猫砂","宠物美容"});
        put("数码", new String[]{"苹果","Apple","华为","小米","手机","电脑","耳机","充电宝","数据线","数码","OPPO","vivo","荣耀","三星","联想","戴尔"});
        put("日用", new String[]{"纸巾","洗衣液","牙膏","洗发水","沐浴露","垃圾袋","保鲜膜","洗手液","洗洁精","清洁"});
        put("礼金", new String[]{"礼物","礼品","鲜花","花束","礼金","生日礼物"});
        put("理财亏损", new String[]{"亏损","亏了","跌了","割肉"});
        put("长辈", new String[]{"孝敬","孝顺","给爸妈","给爷爷","给奶奶","给外公","给外婆"});
    }};

    // ==================== 分类关键词映射（收入） ====================
    private static final Map<String, String[]> INCOME_CATEGORY_MAP = new LinkedHashMap<String, String[]>() {{
        put("工资", new String[]{"工资","薪资","月薪","底薪","绩效","奖金","年终奖","发工资","薪水","劳务费"});
        put("副业", new String[]{"兼职","副业","稿费","稿酬","设计费","咨询费","外包","接单"});
        put("理财", new String[]{"收益","分红","利息","股息","基金收益","理财收益","到期","赎回","到账"});
        put("礼金", new String[]{"红包","转账","生日红包","压岁钱","份子钱"});
        put("报销", new String[]{"报销","差旅报销","医疗报销","报销到账"});
        put("退款", new String[]{"退款","退货退款","返还","退费","退款到账"});
        put("医保", new String[]{"医保","医疗保险","医保报销","医保到账"});
        put("公积金", new String[]{"公积金","住房公积金","公积金提取"});
        put("年金", new String[]{"年金","养老金","退休金","社保"});
    }};

    // ==================== 分类→图标映射 ====================
    private static final Map<String, String> CATEGORY_ICON_MAP = new LinkedHashMap<String, String>() {{
        // 支出
        put("餐饮", "restaurant-outline");
        put("零食", "nutrition-outline");
        put("外卖", "bicycle-outline");
        put("交通", "car-outline");
        put("通讯", "call-outline");
        put("住房", "home-outline");
        put("居家", "bed-outline");
        put("服饰", "shirt-outline");
        put("美妆", "color-wand-outline");
        put("购物", "cart-outline");
        put("运动", "football-outline");
        put("娱乐", "game-controller-outline");
        put("社交", "people-outline");
        put("医疗", "medkit-outline");
        put("教育", "school-outline");
        put("书籍", "book-outline");
        put("孩子", "happy-outline");
        put("宠物", "paw-outline");
        put("数码", "hardware-chip-outline");
        put("日用", "cube-outline");
        put("礼金", "gift-outline");
        put("理财亏损", "trending-down-outline");
        put("长辈", "heart-outline");
        put("其他", "ellipsis-horizontal-outline");
        // 收入
        put("工资", "cash-outline");
        put("副业", "briefcase-outline");
        put("理财", "trending-up-outline");
        put("报销", "receipt-outline");
        put("退款", "arrow-undo-outline");
        put("医保", "shield-checkmark-outline");
        put("公积金", "business-outline");
        put("年金", "wallet-outline");
    }};

    // ==================== 已知商户名 ====================
    private static final String[] KNOWN_MERCHANTS = {
        "肯德基","麦当劳","星巴克","瑞幸","海底捞","必胜客","蜜雪冰城","喜茶","奈雪",
        "美团","饿了么","淘宝","京东","拼多多","天猫","苏宁","唯品会",
        "滴滴","哈啰","携程","飞猪","铁路12306",
        "中国移动","中国联通","中国电信",
        "沃尔玛","永辉","盒马","大润发","全家","7-11","罗森","山姆",
        "优衣库","ZARA","H&M","NIKE","安踏","李宁",
        "苹果","Apple","华为","小米","OPPO","vivo","三星",
        "Steam","PlayStation","Switch",
        "支付宝","微信","云闪付","银联"
    };

    // ==================== 金额提取正则 ====================
    // 优先级1：人民币符号后跟数字
    private static final Pattern AMOUNT_CNY_PATTERN = Pattern.compile("[¥￥]\\s*(\\d+\\.?\\d*)");
    // 优先级2：关键词后的金额
    private static final Pattern AMOUNT_KEYWORD_PATTERN = Pattern.compile(
        "(?:金额|支付|消费|付款|实付|实收|合计|总计|总额|价格|售价|花费|支出|收入|到账|充值|提现)[：:￥¥]?\\s*(\\d+\\.?\\d*)"
    );
    // 优先级3：通用金额格式（带两位小数的数字，排除年份和电话）
    private static final Pattern AMOUNT_GENERIC_PATTERN = Pattern.compile(
        "(?<!\\d)(?!\\d{4}[年.-/])(\\d{1,6}\\.\\d{2})(?!\\d)"
    );

    // ==================== 日期提取正则 ====================
    private static final Pattern DATE_CN_PATTERN = Pattern.compile("(\\d{4})年(\\d{1,2})月(\\d{1,2})日");
    private static final Pattern DATE_DOT_PATTERN = Pattern.compile("(20\\d{2})\\.(\\d{1,2})\\.(\\d{1,2})");
    private static final Pattern DATE_DASH_PATTERN = Pattern.compile("(20\\d{2})-(\\d{1,2})-(\\d{1,2})");
    private static final Pattern DATE_SLASH_PATTERN = Pattern.compile("(20\\d{2})/(\\d{1,2})/(\\d{1,2})");

    // ==================== 商户名提取正则 ====================
    private static final Pattern MERCHANT_PATTERN = Pattern.compile(
        "(?:商户|商家|收款方|店铺|门店|收款商户|交易对方)[：:]?\\s*(.+?)(?:\\s|$)"
    );

    /**
     * 解析OCR文本，提取记账要素
     * @param text OCR识别出的文本
     * @return 解析结果
     */
    public static ParseResult parse(String text) {
        ParseResult result = new ParseResult();
        if (text == null || text.isEmpty()) {
            result.type = "expense";
            result.category = "其他";
            result.icon = CATEGORY_ICON_MAP.get("其他");
            result.date = getTodayDate();
            result.confidence = 0.0;
            return result;
        }

        // 预处理：过滤状态栏噪声行
        text = filterStatusBarNoise(text);

        // 1. 提取金额
        result.amount = extractAmount(text);

        // 2. 提取商户
        result.merchant = extractMerchant(text);

        // 3. 提取日期
        result.date = extractDate(text);

        // 4. 判断收入/支出并匹配分类
        boolean isIncome = detectIncome(text);
        result.type = isIncome ? "income" : "expense";

        if (isIncome) {
            result.category = matchCategory(text, INCOME_CATEGORY_MAP);
        } else {
            result.category = matchCategory(text, EXPENSE_CATEGORY_MAP);
        }
        result.icon = CATEGORY_ICON_MAP.getOrDefault(result.category, "ellipsis-horizontal-outline");

        // 5. 生成备注
        result.note = generateNote(text, result.merchant);

        // 6. 计算置信度
        result.confidence = calculateConfidence(result);

        return result;
    }

    /** 提取金额 */
    private static String extractAmount(String text) {
        // 优先级1：人民币符号
        Matcher m = AMOUNT_CNY_PATTERN.matcher(text);
        if (m.find()) {
            return formatAmount(m.group(1));
        }

        // 优先级2：关键词后的数字
        m = AMOUNT_KEYWORD_PATTERN.matcher(text);
        if (m.find()) {
            return formatAmount(m.group(1));
        }

        // 优先级3：通用金额格式
        m = AMOUNT_GENERIC_PATTERN.matcher(text);
        String bestAmount = null;
        while (m.find()) {
            String candidate = m.group(1);
            double val = Double.parseDouble(candidate);
            // 合理范围：0.01 ~ 999999
            if (val >= 0.01 && val <= 999999) {
                if (bestAmount == null || val > Double.parseDouble(bestAmount)) {
                    bestAmount = candidate;
                }
            }
        }
        return bestAmount != null ? formatAmount(bestAmount) : null;
    }

    /** 格式化金额为两位小数 */
    private static String formatAmount(String amount) {
        try {
            double val = Double.parseDouble(amount);
            return String.format(Locale.US, "%.2f", val);
        } catch (NumberFormatException e) {
            return amount;
        }
    }

    /** 提取商户名 */
    private static String extractMerchant(String text) {
        // 方式1：关键词提取
        Matcher m = MERCHANT_PATTERN.matcher(text);
        if (m.find()) {
            String merchant = m.group(1).trim();
            // 清理商户名中的无关字符
            merchant = merchant.replaceAll("[\\s\\n]+", "");
            if (merchant.length() > 1 && merchant.length() <= 30) {
                return merchant;
            }
        }

        // 方式2：已知商户名匹配
        for (String merchant : KNOWN_MERCHANTS) {
            if (text.contains(merchant)) {
                return merchant;
            }
        }

        return null;
    }

    /** 提取日期 */
    private static String extractDate(String text) {
        Matcher m;

        // 中文日期格式
        m = DATE_CN_PATTERN.matcher(text);
        if (m.find()) {
            return formatDate(m.group(1), m.group(2), m.group(3));
        }

        // 点分隔
        m = DATE_DOT_PATTERN.matcher(text);
        if (m.find()) {
            return formatDate(m.group(1), m.group(2), m.group(3));
        }

        // 横线分隔
        m = DATE_DASH_PATTERN.matcher(text);
        if (m.find()) {
            return formatDate(m.group(1), m.group(2), m.group(3));
        }

        // 斜线分隔
        m = DATE_SLASH_PATTERN.matcher(text);
        if (m.find()) {
            return formatDate(m.group(1), m.group(2), m.group(3));
        }

        return getTodayDate();
    }

    /** 格式化日期为 YYYY-MM-DD */
    private static String formatDate(String year, String month, String day) {
        return year + "-" +
               String.format(Locale.US, "%02d", Integer.parseInt(month)) + "-" +
               String.format(Locale.US, "%02d", Integer.parseInt(day));
    }

    /** 获取今天日期 */
    private static String getTodayDate() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /** 判断是否为收入 */
    private static boolean detectIncome(String text) {
        String[] incomeKeywords = {"收入","到账","进账","收款","工资","薪资","奖金","分红","利息","收益",
                                   "报销","退款","返还","提取","提现","转入","存入","红包收入","压岁钱"};
        for (String keyword : incomeKeywords) {
            if (text.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    /** 匹配分类 */
    private static String matchCategory(String text, Map<String, String[]> categoryMap) {
        for (Map.Entry<String, String[]> entry : categoryMap.entrySet()) {
            for (String keyword : entry.getValue()) {
                if (text.contains(keyword)) {
                    return entry.getKey();
                }
            }
        }
        return "其他";
    }

    // 状态栏/系统UI相关的噪声模式
    private static final Pattern STATUS_BAR_NOISE = Pattern.compile(
        "^\\d{1,2}:\\d{2}$|" +                    // 纯时间 "12:30"
        "^\\d{1,2}:\\d{2}\\s*(AM|PM)$|" +          // "12:30 PM"
        "^\\d+%$|" +                                // 电量 "85%"
        "^(LTE|5G|4G|Wi-?Fi|\\d+\\.\\d+G)$|" +     // 网络标识
        "^(中国移动|中国联通|中国电信)$|" +             // 运营商
        "^(HD|VoLTE|VPN)$|" +                       // 状态图标文字
        "^(返回|主页|最近)$|" +                       // 导航栏
        "^\\d+条未读" +                              // 通知数
        "截图|截屏|分享|编辑"                         // 截图工具栏
    );

    /** 生成备注 */
    private static String generateNote(String text, String merchant) {
        if (merchant != null && !merchant.isEmpty()) {
            return merchant;
        }
        // 尝试提取第一行有意义的文本作为备注
        String[] lines = text.split("\\n");
        for (String line : lines) {
            line = line.trim();
            // 跳过过短、纯数字、或状态栏噪声
            if (line.length() < 2 || line.length() > 30) continue;
            if (line.matches("^[\\d.¥￥]+$")) continue;
            if (STATUS_BAR_NOISE.matcher(line).find()) continue;
            return line;
        }
        return "";
    }

    /** 过滤状态栏噪声 */
    private static String filterStatusBarNoise(String text) {
        String[] lines = text.split("\\n");
        StringBuilder sb = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) continue;
            if (STATUS_BAR_NOISE.matcher(trimmed).matches()) continue;
            // 跳过单独的时间格式行（如 "上午 10:30"）
            if (trimmed.matches("^[上下]午\\s*\\d{1,2}:\\d{2}$")) continue;
            if (sb.length() > 0) sb.append("\n");
            sb.append(trimmed);
        }
        return sb.toString();
    }

    /** 计算置信度 */
    private static double calculateConfidence(ParseResult result) {
        double score = 0.0;
        if (result.amount != null && !result.amount.equals("0.00")) score += 0.4;
        if (result.merchant != null && !result.merchant.isEmpty()) score += 0.3;
        if (result.category != null && !result.category.equals("其他")) score += 0.2;
        if (result.date != null && !result.date.equals(getTodayDate())) score += 0.1;
        return score;
    }
}
