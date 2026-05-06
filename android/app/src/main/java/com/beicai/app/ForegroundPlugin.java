package com.beicai.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * 前台服务 Capacitor 插件
 * 提供 start/stop/isRunning 方法给前端 JS 调用
 */
@CapacitorPlugin(
    name = "Foreground",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { Manifest.permission.POST_NOTIFICATIONS }
        )
    }
)
public class ForegroundPlugin extends Plugin {

    private boolean isRunning = false;
    private PluginCall pendingCall;

    /**
     * 预请求通知权限 (Android 13+)
     */
    @PluginMethod()
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("notifications", call, "handleRequestPermission");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void handleRequestPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED);
        call.resolve(ret);
    }

    /**
     * 更新通知内容（用于切换 AI 记按钮显示）
     * 参数: showAi (boolean)
     */
    @PluginMethod()
    public void updateNotification(PluginCall call) {
        boolean showAi = call.getBoolean("showAi", false);

        try {
            Intent serviceIntent = new Intent(getContext(), ForegroundService.class);
            serviceIntent.putExtra(ForegroundService.EXTRA_SHOW_AI, showAi);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("更新通知失败: " + e.getMessage(), e);
        }
    }

    /**
     * 启动前台服务
     * 参数: title (可选), content (可选)
     */
    @PluginMethod()
    public void start(PluginCall call) {
        // Android 13+ 需要通知权限
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                pendingCall = call;
                requestPermissionForAlias("notifications", call, "handleNotificationPermission");
                return;
            }
        }

        startForegroundService(call);
    }

    @PermissionCallback
    private void handleNotificationPermission(PluginCall call) {
        if (getPermissionState("notifications") == com.getcapacitor.PermissionState.GRANTED) {
            startForegroundService(pendingCall != null ? pendingCall : call);
        } else {
            call.reject("需要通知权限才能显示常驻通知");
        }
        pendingCall = null;
    }

    private void startForegroundService(PluginCall call) {
        String title = call.getString("title", "贝才");
        String content = call.getString("content", "记账服务运行中");

        try {
            Intent serviceIntent = new Intent(getContext(), ForegroundService.class);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("content", content);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            isRunning = true;

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("启动前台服务失败: " + e.getMessage(), e);
        }
    }

    /**
     * 停止前台服务
     */
    @PluginMethod()
    public void stop(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), ForegroundService.class);
            getContext().stopService(serviceIntent);

            isRunning = false;

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("停止前台服务失败: " + e.getMessage(), e);
        }
    }

    /**
     * 查询前台服务是否运行中
     */
    @PluginMethod()
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", isRunning);
        call.resolve(ret);
    }
}
