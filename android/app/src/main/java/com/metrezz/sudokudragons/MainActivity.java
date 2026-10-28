package com.metrezz.sudokudragons;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Required by Capacitor 8 when SystemBars.insetsHandling is not "disable" (see capacitor.config.ts).
        // Must run before setContentView, which BridgeActivity calls in super.onCreate.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
