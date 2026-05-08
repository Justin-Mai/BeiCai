package com.beicai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.util.Log;

import java.nio.ByteBuffer;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 前台服务 - 持有 MediaProjection 并执行截图
 * Android 14+ 要求 MediaProjection 必须关联前台服务
 */
public class ScreenCaptureService extends Service {

    private static final String TAG = "ScreenCaptureService";
    private static final String CHANNEL_ID = "beicai_capture";

    private static final AtomicReference<Bitmap> resultBitmap = new AtomicReference<>(null);
    private static final AtomicReference<String> resultError = new AtomicReference<>(null);
    private static CountDownLatch resultLatch;
    private MediaProjection mediaProjection;
    private VirtualDisplay virtualDisplay;
    private ImageReader imageReader;

    /** 启动服务并传入授权数据 */
    public static void startService(Context context, int resultCode, Intent data) {
        Intent intent = new Intent(context, ScreenCaptureService.class);
        intent.putExtra("resultCode", resultCode);
        intent.putExtra("data", data);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
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
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        // 立即提升为前台服务
        createNotificationChannel();
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("贝才")
            .setContentText("正在截取屏幕...")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build();
        startForeground(1001, notification);

        // 准备截图
        resultBitmap.set(null);
        resultError.set(null);
        resultLatch = new CountDownLatch(1);

        int resultCode = intent.getIntExtra("resultCode", -1);
        Intent data = intent.getParcelableExtra("data");

        if (resultCode == -1 || data == null) {
            resultError.set("授权数据无效");
            resultLatch.countDown();
            stopSelf();
            return START_NOT_STICKY;
        }

        // 创建 MediaProjection
        MediaProjectionManager manager = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
        if (manager == null) {
            resultError.set("无法获取 MediaProjectionManager");
            resultLatch.countDown();
            stopSelf();
            return START_NOT_STICKY;
        }

        mediaProjection = manager.getMediaProjection(resultCode, data);
        if (mediaProjection == null) {
            resultError.set("无法创建 MediaProjection");
            resultLatch.countDown();
            stopSelf();
            return START_NOT_STICKY;
        }

        // 截图
        doCapture();

        return START_NOT_STICKY;
    }

    private void doCapture() {
        DisplayMetrics metrics = getResources().getDisplayMetrics();
        int width = metrics.widthPixels;
        int height = metrics.heightPixels;
        int density = metrics.densityDpi;

        // 限制最大 1080p
        if (width > 1080) {
            height = (int) (height * (1080.0 / width));
            width = 1080;
        }

        final int finalWidth = width;
        final int finalHeight = height;
        imageReader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 1);

        virtualDisplay = mediaProjection.createVirtualDisplay(
            "BeiCaiCapture",
            width, height, density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader.getSurface(),
            null, null
        );

        // 等待一帧图像
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                Image image = imageReader.acquireLatestImage();
                if (image != null) {
                    Bitmap bitmap = imageToBitmap(image, finalWidth, finalHeight);
                    image.close();

                    if (bitmap != null) {
                        // 裁剪掉顶部状态栏（约 5%）
                        int statusBarHeight = bitmap.getHeight() / 20;
                        if (statusBarHeight > 0 && statusBarHeight < bitmap.getHeight()) {
                            Bitmap cropped = Bitmap.createBitmap(
                                bitmap, 0, statusBarHeight,
                                bitmap.getWidth(), bitmap.getHeight() - statusBarHeight
                            );
                            bitmap.recycle();
                            bitmap = cropped;
                        }
                        resultBitmap.set(bitmap);
                        Log.i(TAG, "截图成功: " + finalWidth + "x" + finalHeight);
                    } else {
                        resultError.set("图像转换失败");
                    }
                } else {
                    resultError.set("未获取到图像");
                }
            } catch (Exception e) {
                resultError.set("截图异常: " + e.getMessage());
                Log.e(TAG, "截图异常", e);
            } finally {
                cleanup();
                if (resultLatch != null) resultLatch.countDown();
                stopSelf();
            }
        }, 300);
    }

    private Bitmap imageToBitmap(Image image, int width, int height) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer();
        int pixelStride = plane.getPixelStride();
        int rowStride = plane.getRowStride();
        int rowPadding = rowStride - pixelStride * width;

        Bitmap bitmap = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888);
        bitmap.copyPixelsFromBuffer(buffer);

        if (rowPadding > 0) {
            Bitmap cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height);
            bitmap.recycle();
            return cropped;
        }
        return bitmap;
    }

    private void cleanup() {
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
        if (mediaProjection != null) {
            mediaProjection.stop();
            mediaProjection = null;
        }
    }

    @Override
    public void onDestroy() {
        cleanup();
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "截图服务", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("自动记账截图服务");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }
}
