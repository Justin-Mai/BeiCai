package com.beicai.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 自动记账插件 - Capacitor桥接层
 * 串联：截图 → OCR → 规则解析 → 返回记账数据
 */
@CapacitorPlugin(name = "AutoBook")
public class AutoBookPlugin extends Plugin {

    private static final String TAG = "AutoBookPlugin";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private OcrService ocrService;

    @Override
    public void load() {
        super.load();
        ocrService = new OcrService();
    }

    /**
     * 主方法：自动记账
     * 检查权限 → 截图 → OCR → 解析 → 返回结果
     */
    @PluginMethod()
    public void autoBook(PluginCall call) {
        // 1. 检查 API 版本
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", "api_level");
            ret.put("message", "自动记账需要 Android 11 或更高版本");
            call.resolve(ret);
            return;
        }

        // 2. 检查无障碍权限
        if (!AutoBookAccessibilityService.isRunning()) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("needAccessibility", true);
            ret.put("message", "需要开启无障碍权限才能使用自动记账");
            call.resolve(ret);
            return;
        }

        // 3. 异步执行截图+OCR+解析
        call.setKeepAlive(true);
        executor.execute(() -> {
            try {
                // 优先使用预截图
                Bitmap screenshot = AutoBookAccessibilityService.getPreCapturedBitmap();

                if (screenshot == null) {
                    Log.d(TAG, "预截图不可用，实时截图");
                    screenshot = AutoBookAccessibilityService.takeScreenshotSync(10);
                    if (screenshot != null) {
                        int statusBarHeight = screenshot.getHeight() / 20;
                        if (statusBarHeight > 0 && statusBarHeight < screenshot.getHeight()) {
                            Bitmap cropped = Bitmap.createBitmap(
                                screenshot, 0, statusBarHeight,
                                screenshot.getWidth(), screenshot.getHeight() - statusBarHeight
                            );
                            screenshot.recycle();
                            screenshot = cropped;
                        }
                    }
                } else {
                    Log.d(TAG, "使用预截图");
                }

                if (screenshot == null) {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", "screenshot_failed");
                    ret.put("message", "截图失败。请先打开支付页面，再从通知栏点击「自动记」。");
                    call.resolve(ret);
                    return;
                }

                // OCR识别
                final Bitmap finalScreenshot = screenshot;
                ocrService.recognize(finalScreenshot, new OcrService.OcrCallback() {
                    @Override
                    public void onSuccess(String text) {
                        try {
                            // 规则解析
                            TransactionParser.ParseResult parsed = TransactionParser.parse(text);

                            // 构建返回数据
                            JSObject data = new JSObject();
                            data.put("amount", parsed.amount != null ? parsed.amount : "");
                            data.put("type", parsed.type);
                            data.put("category", parsed.category);
                            data.put("icon", parsed.icon);
                            data.put("merchant", parsed.merchant != null ? parsed.merchant : "");
                            data.put("note", parsed.note != null ? parsed.note : "");
                            data.put("date", parsed.date);
                            data.put("confidence", parsed.confidence);
                            data.put("rawText", text.length() > 500 ? text.substring(0, 500) : text);

                            JSObject ret = new JSObject();
                            ret.put("success", true);
                            ret.put("data", data);
                            call.resolve(ret);
                        } catch (Exception e) {
                            Log.e(TAG, "解析失败", e);
                            JSObject ret = new JSObject();
                            ret.put("success", false);
                            ret.put("error", "parse_failed");
                            ret.put("message", "解析失败: " + e.getMessage());
                            call.resolve(ret);
                        } finally {
                            finalScreenshot.recycle();
                        }
                    }

                    @Override
                    public void onError(String error) {
                        finalScreenshot.recycle();
                        JSObject ret = new JSObject();
                        ret.put("success", false);
                        ret.put("error", "ocr_failed");
                        ret.put("message", error);
                        call.resolve(ret);
                    }
                });
            } catch (Exception e) {
                Log.e(TAG, "自动记账失败", e);
                JSObject ret = new JSObject();
                ret.put("success", false);
                ret.put("error", "unknown");
                ret.put("message", "自动记账失败: " + e.getMessage());
                call.resolve(ret);
            }
        });
    }

    /**
     * 检查无障碍服务是否已开启
     */
    @PluginMethod()
    public void checkAccessibility(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", AutoBookAccessibilityService.isRunning());
        call.resolve(ret);
    }

    /**
     * 跳转到无障碍设置页
     */
    @PluginMethod()
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开设置页: " + e.getMessage(), e);
        }
    }

    /**
     * 跳转到应用详情设置页（用于开启自启动权限）
     */
    @PluginMethod()
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("无法打开应用设置: " + e.getMessage(), e);
        }
    }

    /**
     * 读取并清除待处理的 action（由 JS 启动后主动调用）
     */
    @PluginMethod()
    public void getPendingAction(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            MainActivity.PREF_NAME, android.content.Context.MODE_PRIVATE
        );
        String action = prefs.getString(MainActivity.KEY_ACTION, null);
        if (action != null) {
            prefs.edit().remove(MainActivity.KEY_ACTION).apply();
        }
        JSObject ret = new JSObject();
        ret.put("action", action);
        call.resolve(ret);
    }

    /**
     * 读取并清除待处理的自动记账结果（由 JS 启动后主动调用，防止冷启动事件丢失）
     */
    @PluginMethod()
    public void getPendingAutoBookResult(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(
            MainActivity.PREF_NAME, android.content.Context.MODE_PRIVATE
        );
        String resultJson = prefs.getString("auto_book_result", null);
        String action = prefs.getString(MainActivity.KEY_ACTION, null);

        if ("auto-book-result".equals(action) && resultJson != null) {
            // 清除 pending 数据
            prefs.edit()
                .remove(MainActivity.KEY_ACTION)
                .remove("auto_book_result")
                .apply();
            JSObject ret = new JSObject();
            ret.put("hasResult", true);
            ret.put("result", resultJson);
            call.resolve(ret);
        } else {
            JSObject ret = new JSObject();
            ret.put("hasResult", false);
            call.resolve(ret);
        }
    }
}
