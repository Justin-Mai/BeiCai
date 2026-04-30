package com.beicai.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(FileExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
