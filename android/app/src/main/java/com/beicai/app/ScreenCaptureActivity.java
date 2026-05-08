package com.beicai.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.media.projection.MediaProjectionManager;
import android.os.Bundle;
import android.util.Log;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 透明 Activity - 请求 MediaProjection 授权
 * 授权后将数据传给 ScreenCaptureService 执行截图
 */
public class ScreenCaptureActivity extends Activity {

    private static final String TAG = "ScreenCapture";
    private static final int REQUEST_CODE_CAPTURE = 1001;

    private static final AtomicReference<Bitmap> resultBitmap = new AtomicReference<>(null);
    private static final AtomicReference<String> resultError = new AtomicReference<>(null);
    private static CountDownLatch resultLatch;

    /** 启动截图流程 */
    public static void startCapture(Context context) {
        resultBitmap.set(null);
        resultError.set(null);
        resultLatch = new CountDownLatch(1);

        Intent intent = new Intent(context, ScreenCaptureActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    /** 获取截图结果（阻塞等待） */
    public static Bitmap getResult(int waitSec) {
        if (resultLatch == null) return null;
        try {
            resultLatch.await(waitSec, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Log.e(TAG, "等待截图被中断");
        }
        return resultBitmap.get();
    }

    public static String getError() {
        return resultError.get();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 不显示任何 UI
        getWindow().setLayout(1, 1);

        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            finishWithError("无法获取 MediaProjectionManager");
            return;
        }

        startActivityForResult(manager.createScreenCaptureIntent(), REQUEST_CODE_CAPTURE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != REQUEST_CODE_CAPTURE) {
            finishWithError("未知请求码");
            return;
        }

        if (resultCode != RESULT_OK || data == null) {
            finishWithError("用户取消了截图授权");
            return;
        }

        try {
            // 启动前台服务执行截图
            ScreenCaptureService.startService(this, resultCode, data);

            // 等待服务完成截图
            new Thread(() -> {
                try {
                    Bitmap result = ScreenCaptureService.getResult(10);
                    if (result != null) {
                        resultBitmap.set(result);
                    } else {
                        resultError.set(ScreenCaptureService.getError());
                    }
                } catch (Exception e) {
                    resultError.set("等待截图失败: " + e.getMessage());
                } finally {
                    if (resultLatch != null) resultLatch.countDown();
                    runOnUiThread(() -> finish());
                }
            }).start();
        } catch (Exception e) {
            finishWithError("启动截图服务失败: " + e.getMessage());
        }
    }

    private void finishWithError(String error) {
        Log.e(TAG, error);
        resultError.set(error);
        if (resultLatch != null) resultLatch.countDown();
        finish();
    }
}
