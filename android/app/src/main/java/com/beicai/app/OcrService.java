package com.beicai.app;

import android.graphics.Bitmap;

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions;

/**
 * OCR服务 - 使用 Google ML Kit 中文文字识别
 * 完全离线运行，捆绑模型，无需网络
 */
public class OcrService {

    private final TextRecognizer recognizer;

    public OcrService() {
        // 使用中文识别模型（捆绑在APK中，无需下载）
        recognizer = TextRecognition.getClient(new ChineseTextRecognizerOptions.Builder().build());
    }

    /**
     * 识别图片中的文字
     * @param bitmap 待识别的图片
     * @param callback 识别结果回调
     */
    public void recognize(Bitmap bitmap, OcrCallback callback) {
        if (bitmap == null) {
            callback.onError("截图为空");
            return;
        }

        InputImage image = InputImage.fromBitmap(bitmap, 0);
        recognizer.process(image)
            .addOnSuccessListener(text -> {
                String resultText = text.getText();
                if (resultText.isEmpty()) {
                    callback.onError("未识别到文字");
                } else {
                    callback.onSuccess(resultText);
                }
            })
            .addOnFailureListener(e -> {
                callback.onError("文字识别失败: " + e.getMessage());
            });
    }

    /** 释放资源 */
    public void close() {
        recognizer.close();
    }

    /** OCR结果回调接口 */
    public interface OcrCallback {
        void onSuccess(String text);
        void onError(String error);
    }
}
