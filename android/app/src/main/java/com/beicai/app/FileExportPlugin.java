package com.beicai.app;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

import android.util.Base64;

@CapacitorPlugin(name = "FileExport")
public class FileExportPlugin extends Plugin {

    @PluginMethod()
    public void exportJson(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName", "backup.json");

        if (data == null || data.isEmpty()) {
            call.reject("Missing data");
            return;
        }

        try {
            boolean saved = saveToDownloads(fileName, data.getBytes(StandardCharsets.UTF_8), "application/json");
            if (saved) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", fileName);
                call.resolve(ret);
            } else {
                call.reject("Failed to save file");
            }
        } catch (Exception e) {
            call.reject("Export error: " + e.getMessage(), e);
        }
    }

    @PluginMethod()
    public void exportBase64(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName", "backup.bin");
        String mimeType = call.getString("mimeType", "application/octet-stream");

        if (data == null || data.isEmpty()) {
            call.reject("Missing data");
            return;
        }

        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            boolean saved = saveToDownloads(fileName, bytes, mimeType);
            if (saved) {
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", fileName);
                call.resolve(ret);
            } else {
                call.reject("Failed to save file");
            }
        } catch (Exception e) {
            call.reject("Export error: " + e.getMessage(), e);
        }
    }

    private boolean saveToDownloads(String fileName, byte[] bytes, String mimeType) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                Uri uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri != null) {
                    OutputStream os = getContext().getContentResolver().openOutputStream(uri);
                    if (os != null) {
                        os.write(bytes);
                        os.flush();
                        os.close();
                        return true;
                    }
                }
            } else {
                // Android 9 及以下
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                File file = new File(dir, fileName);
                FileOutputStream fos = new FileOutputStream(file);
                fos.write(bytes);
                fos.flush();
                fos.close();
                return true;
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        return false;
    }
}
