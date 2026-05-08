package com.beicai.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

/**
 * 透明Activity - 接收"自动记"按钮点击，延迟截图后打开贝才
 */
public class AutoBookReceiver extends Activity {

    private static final String TAG = "AutoBookReceiver";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 窗口尽量小且透明，不遮挡前一个App
        getWindow().setLayout(1, 1);

        Log.d(TAG, "AutoBookReceiver Activity 启动");

        // 延迟1秒截图，让通知栏收起、前一个App界面显示
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            // 在后台线程执行截图+OCR，避免主线程死锁
            new Thread(this::doCapture).start();
        }, 1000);
    }

    private void doCapture() {
        Log.d(TAG, "开始截图");

        // 检查无障碍服务
        if (!AutoBookAccessibilityService.isRunning()) {
            Log.e(TAG, "无障碍服务未运行");
            runOnUiThread(() -> Toast.makeText(this, "请先开启无障碍服务", Toast.LENGTH_SHORT).show());
            openMainActivity(null);
            return;
        }

        // 截图
        Bitmap screenshot = AutoBookAccessibilityService.takeScreenshotSync(10);

        // 裁剪状态栏
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

        if (screenshot == null) {
            Log.e(TAG, "截图失败");
            runOnUiThread(() -> Toast.makeText(this, "截图失败，请重试", Toast.LENGTH_SHORT).show());
            openMainActivity(null);
            return;
        }

        Log.d(TAG, "截图成功，开始OCR");

        // OCR识别
        OcrService ocrService = new OcrService();
        final Bitmap finalScreenshot = screenshot;
        ocrService.recognize(finalScreenshot, new OcrService.OcrCallback() {
            @Override
            public void onSuccess(String text) {
                finalScreenshot.recycle();
                Log.d(TAG, "OCR成功");

                TransactionParser.ParseResult parsed = TransactionParser.parse(text);

                String resultJson = "{\"amount\":\"" + (parsed.amount != null ? parsed.amount : "") + "\"," +
                    "\"type\":\"" + parsed.type + "\"," +
                    "\"category\":\"" + parsed.category + "\"," +
                    "\"icon\":\"" + parsed.icon + "\"," +
                    "\"merchant\":\"" + (parsed.merchant != null ? parsed.merchant : "") + "\"," +
                    "\"note\":\"" + (parsed.note != null ? parsed.note : "") + "\"," +
                    "\"date\":\"" + parsed.date + "\"," +
                    "\"confidence\":" + parsed.confidence + "}";

                Log.d(TAG, "解析结果: " + resultJson);
                saveResultAndOpen(resultJson);
            }

            @Override
            public void onError(String error) {
                finalScreenshot.recycle();
                Log.e(TAG, "OCR失败: " + error);
                runOnUiThread(() -> Toast.makeText(AutoBookReceiver.this, "识别失败，请重试", Toast.LENGTH_SHORT).show());
                openMainActivity(null);
            }
        });
    }

    /** 将结果存入 SharedPreferences，再打开 MainActivity */
    private void saveResultAndOpen(String resultJson) {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREF_NAME, MODE_PRIVATE);
        prefs.edit()
            .putString("auto_book_result", resultJson)
            .putString(MainActivity.KEY_ACTION, "auto-book-result")
            .apply();
        Log.d(TAG, "结果已存入 SharedPreferences");
        openMainActivity(resultJson);
    }

    private void openMainActivity(String resultJson) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.beicai.app.AUTO_BOOK_RESULT");
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }
}
