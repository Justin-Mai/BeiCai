package com.beicai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.view.View;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

/**
 * 前台服务 - 用于在状态栏常驻通知，保持应用后台存活
 */
public class ForegroundService extends Service {

    private static final String CHANNEL_ID = "beicai_foreground";
    private static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_OPEN_ADD = "com.beicai.app.OPEN_ADD";
    public static final String ACTION_AUTO_ADD = "com.beicai.app.AUTO_ADD";
    public static final String EXTRA_SHOW_AI = "show_ai";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String title = "贝才";
        String content = "记账服务运行中";
        boolean showAi = false;

        if (intent != null) {
            String t = intent.getStringExtra("title");
            String c = intent.getStringExtra("content");
            showAi = intent.getBooleanExtra(EXTRA_SHOW_AI, false);
            if (t != null && !t.isEmpty()) title = t;
            if (c != null && !c.isEmpty()) content = c;
        }

        Notification notification = buildNotification(title, content, showAi);
        startForeground(NOTIFICATION_ID, notification);

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "贝才后台服务",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("贝才记账应用后台常驻通知");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String title, String content, boolean showAi) {
        // 点击通知主体打开应用
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // "记一笔"按钮 Intent
        Intent addIntent = new Intent(this, MainActivity.class);
        addIntent.setAction(ACTION_OPEN_ADD);
        addIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent addPendingIntent = PendingIntent.getActivity(
            this, 1, addIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // "自动记"按钮 Intent
        Intent aiIntent = new Intent(this, MainActivity.class);
        aiIntent.setAction(ACTION_AUTO_ADD);
        aiIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent aiPendingIntent = PendingIntent.getActivity(
            this, 2, aiIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 创建自定义布局
        RemoteViews customView = new RemoteViews(getPackageName(), R.layout.notification_foreground);
        customView.setTextViewText(R.id.notification_title, title);
        customView.setOnClickPendingIntent(R.id.btn_add, addPendingIntent);

        if (showAi) {
            customView.setViewVisibility(R.id.btn_ai, View.VISIBLE);
            customView.setOnClickPendingIntent(R.id.btn_ai, aiPendingIntent);
        } else {
            customView.setViewVisibility(R.id.btn_ai, View.GONE);
        }

        // 使用 DecoratedCustomViewStyle 让自定义布局在折叠状态下显示
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setCustomContentView(customView)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .build();
    }
}
