package com.beicai.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileExportPlugin.class);
        registerPlugin(ForegroundPlugin.class);
        super.onCreate(savedInstanceState);

        // 处理从通知按钮打开记账弹窗的 Intent
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        if (ForegroundService.ACTION_OPEN_ADD.equals(action)) {
            // "记一笔" - 通知前端打开记账弹窗
            triggerJsEvent("open-add-modal");
        }
        // "自动记" - 只打开 app，不做其他操作
    }

    private void triggerJsEvent(String eventName) {
        try {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('" + eventName + "'));",
                null
            );
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
