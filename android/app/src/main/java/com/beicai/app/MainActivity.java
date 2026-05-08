package com.beicai.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String PREF_NAME = "beicai_pending";
    static final String KEY_ACTION = "pending_action";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileExportPlugin.class);
        registerPlugin(ForegroundPlugin.class);
        registerPlugin(AutoBookPlugin.class);
        super.onCreate(savedInstanceState);

        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // 检查 SharedPreferences 中是否有待处理的自动记账结果
        checkPendingAutoBookResult();
    }

    /** 检查并派发自动记账结果 */
    private void checkPendingAutoBookResult() {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                SharedPreferences prefs = getSharedPreferences(PREF_NAME, MODE_PRIVATE);
                String action = prefs.getString(KEY_ACTION, null);
                String resultJson = prefs.getString("auto_book_result", null);

                if ("auto-book-result".equals(action) && resultJson != null) {
                    // 清除 pending 数据
                    prefs.edit()
                        .remove(KEY_ACTION)
                        .remove("auto_book_result")
                        .apply();

                    // 派发给 JS
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        String js = "window.dispatchEvent(new CustomEvent('open-add-modal', {detail: " + resultJson + "}));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                } else if ("auto-book-resumed".equals(action)) {
                    prefs.edit().remove(KEY_ACTION).apply();
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('auto-book-resumed'));",
                            null
                        );
                    }
                }
            } catch (Exception ignored) {}
        }, 800);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();

        if (ForegroundService.ACTION_OPEN_ADD.equals(action)) {
            dispatchSimpleEvent("open-add-modal");
        } else if (ForegroundService.ACTION_AUTO_ADD.equals(action)) {
            // 通知栏点击"自动记"，由 AutoBookReceiver 处理，这里不需要做任何事
        } else if ("com.beicai.app.AUTO_BOOK_RESULT".equals(action)) {
            // AutoBookReceiver 打开的，结果已在 SharedPreferences 中
            // onResume 会检查并派发，这里不需要额外处理
        }
    }

    private void dispatchSimpleEvent(String eventName) {
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('" + eventName + "'));",
                        null
                    );
                }
            } catch (Exception ignored) {}
        }, 500);
    }
}
