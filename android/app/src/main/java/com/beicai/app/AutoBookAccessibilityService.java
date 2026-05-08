package com.beicai.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 无障碍服务 - 用于静默截图
 * 通过 AccessibilityService.takeScreenshot() (API 30+) 实现无弹窗截图
 */
public class AutoBookAccessibilityService extends AccessibilityService {

    private static final String TAG = "AutoBookService";
    private static AutoBookAccessibilityService instance;
    private static final AtomicReference<Bitmap> screenshotResult = new AtomicReference<>(null);
    private static final AtomicReference<String> screenshotError = new AtomicReference<>(null);
    private static CountDownLatch screenshotLatch;
    // 预截图缓存（在 App 切到前台之前捕获）
    private static final AtomicReference<Bitmap> preCaptureBitmap = new AtomicReference<>(null);

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        Log.i(TAG, "无障碍服务已连接");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // 不需要处理无障碍事件，仅用于截图
    }

    @Override
    public void onInterrupt() {
        Log.w(TAG, "无障碍服务被中断");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
        Log.i(TAG, "无障碍服务已销毁");
    }

    /** 检查无障碍服务是否正在运行 */
    public static boolean isRunning() {
        return instance != null;
    }

    /**
     * 在 App 切到前台之前预先截图
     * 由 MainActivity.handleIntent 在处理 ACTION_AUTO_ADD 时调用
     */
    public static void captureBeforeForeground() {
        // 清除之前的预截图
        Bitmap old = preCaptureBitmap.getAndSet(null);
        if (old != null && !old.isRecycled()) {
            old.recycle();
        }

        if (instance == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }

        Handler mainHandler = new Handler(Looper.getMainLooper());
        mainHandler.post(() -> {
            try {
                instance.takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    instance.getMainExecutor(),
                    new TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(ScreenshotResult result) {
                            try {
                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(
                                    result.getHardwareBuffer(), result.getColorSpace()
                                );
                                result.getHardwareBuffer().close();
                                if (bitmap != null) {
                                    // 裁剪掉顶部状态栏区域（约 5% 高度）
                                    int statusBarHeight = bitmap.getHeight() / 20;
                                    if (statusBarHeight > 0 && statusBarHeight < bitmap.getHeight()) {
                                        Bitmap cropped = Bitmap.createBitmap(
                                            bitmap, 0, statusBarHeight,
                                            bitmap.getWidth(), bitmap.getHeight() - statusBarHeight
                                        );
                                        bitmap.recycle();
                                        preCaptureBitmap.set(cropped);
                                    } else {
                                        preCaptureBitmap.set(bitmap);
                                    }
                                    Log.i(TAG, "预截图成功");
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "预截图处理失败", e);
                            }
                        }

                        @Override
                        public void onFailure(int errorCode) {
                            Log.w(TAG, "预截图失败，错误码: " + errorCode);
                        }
                    }
                );
            } catch (Exception e) {
                Log.e(TAG, "调用预截图失败", e);
            }
        });
    }

    /**
     * 获取预截图（获取后清空引用，由调用方负责回收）
     */
    public static Bitmap getPreCapturedBitmap() {
        return preCaptureBitmap.getAndSet(null);
    }

    /**
     * 同步截图方法（在后台线程调用）
     * @param timeoutSeconds 超时时间（秒）
     * @return 截图Bitmap，失败返回null
     */
    public static Bitmap takeScreenshotSync(int timeoutSeconds) {
        if (instance == null) {
            Log.e(TAG, "无障碍服务未运行");
            return null;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            Log.e(TAG, "截图需要 Android 11 (API 30) 或更高版本");
            return null;
        }

        screenshotResult.set(null);
        screenshotError.set(null);
        screenshotLatch = new CountDownLatch(1);

        Handler mainHandler = new Handler(Looper.getMainLooper());
        mainHandler.post(() -> {
            try {
                instance.takeScreenshot(
                    Display.DEFAULT_DISPLAY,
                    instance.getMainExecutor(),
                    new TakeScreenshotCallback() {
                        @Override
                        public void onSuccess(ScreenshotResult result) {
                            try {
                                Bitmap bitmap = Bitmap.wrapHardwareBuffer(
                                    result.getHardwareBuffer(), result.getColorSpace()
                                );
                                result.getHardwareBuffer().close();
                                screenshotResult.set(bitmap);
                            } catch (Exception e) {
                                screenshotError.set("处理截图失败: " + e.getMessage());
                            } finally {
                                screenshotLatch.countDown();
                            }
                        }

                        @Override
                        public void onFailure(int errorCode) {
                            String errorMsg;
                            switch (errorCode) {
                                case 1: // ERROR_DISPLAY_UNAVAILABLE
                                    errorMsg = "屏幕不可用";
                                    break;
                                case 2: // ERROR_INVALID_DISPLAY
                                    errorMsg = "无效的屏幕";
                                    break;
                                case 3: // ERROR_SECURITY
                                    errorMsg = "安全限制，无法截图";
                                    break;
                                default:
                                    errorMsg = "截图失败，错误码: " + errorCode;
                            }
                            screenshotError.set(errorMsg);
                            screenshotLatch.countDown();
                        }
                    }
                );
            } catch (Exception e) {
                screenshotError.set("调用截图失败: " + e.getMessage());
                screenshotLatch.countDown();
            }
        });

        // 等待截图完成
        try {
            boolean completed = screenshotLatch.await(timeoutSeconds, TimeUnit.SECONDS);
            if (!completed) {
                Log.e(TAG, "截图超时");
                return null;
            }
        } catch (InterruptedException e) {
            Log.e(TAG, "截图被中断");
            return null;
        }

        Bitmap result = screenshotResult.get();
        if (result == null) {
            String error = screenshotError.get();
            Log.e(TAG, error != null ? error : "截图返回空结果");
        }
        return result;
    }
}
