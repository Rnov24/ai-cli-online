# Spike: Standalone Android Foreground Service Companion APK

- **Target Architecture**: Android ARM64 (`aarch64`)
- **Category**: Mobile Runtime / Host Architecture
- **Status**: Complete / Prototype Ready
- **Date**: 2026-09-05

---

## 1. Executive Summary & Problem Statement

Currently, running **AGY Online** on mobile devices relies on **Termux** as the host environment. While Termux provides a familiar Linux userland and package manager (`pkg`), it poses several challenges for casual mobile users and long-running autonomous workflows:

1. **Phantom Process Killer (Android 12+)**: Android strictly limits background processes for non-system apps to 32 total processes and aggressively throttles or kills background processes consuming CPU.
2. **Setup Friction**: Users must install Termux, Termux:Boot, grant special permissions (battery optimization, wake lock), configure bootstrap scripts, and manage sockets manually.
3. **App Lifecycle & Process Reclamation**: Without an explicit Android Foreground Service, Android OS treats background terminal processes as cached and reclaims them under memory pressure.

A native **Android Foreground Service Companion APK** (e.g., `com.huacheng.agyonline`) solves these issues by:
- Operating a native **Foreground Service** (`startForeground`) displaying an ongoing system notification (`AGY Online Running | [Open UI] [Stop]`).
- Bypassing the Phantom Process Killer and background process limits under Android platform rules.
- Providing zero-configuration auto-start on device boot via `BOOT_COMPLETED`.
- Hosting the pure-Go, 0-CGO AGY Online web server directly on the Android runtime.

---

## 2. Android Manifest & Permissions

Under modern Android releases (Android 13+ API 33 and Android 14+ API 34), foreground services and notification postings require explicit permissions and typed service declarations.

### Required Permissions

| Permission | Min API | Rationale |
|---|---|---|
| `android.permission.RECEIVE_BOOT_COMPLETED` | API 1 | Allows auto-starting the server service when the device finishes booting. |
| `android.permission.FOREGROUND_SERVICE` | API 28 | Base permission to run background processes as foreground services. |
| `android.permission.FOREGROUND_SERVICE_SPECIAL_USE` | API 34 (Android 14) | Foreground service type for developer tools / local servers not fitting standard media/camera types. |
| `android.permission.POST_NOTIFICATIONS` | API 33 (Android 13) | Required to display the mandatory persistent foreground service notification. |
| `android.permission.WAKE_LOCK` | API 1 | Keeps CPU active while tasks and terminal sessions are running. |
| `android.permission.INTERNET` | API 1 | Allows binding local TCP sockets (e.g., `127.0.0.1:3001` or `0.0.0.0:3001`). |

### `AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    package="com.huacheng.agyonline">

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="AGY Online"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.AGYOnline"
        android:extractNativeLibs="true">

        <!-- Launcher / Dashboard Activity -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Foreground Service -->
        <service
            android:name=".service.AGYServerService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Local autonomous AI development terminal and web server" />
        </service>

        <!-- Boot Completed Receiver -->
        <receiver
            android:name=".receiver.BootReceiver"
            android:enabled="true"
            android:exported="true"
            android:directBootAware="no">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </receiver>

        <!-- Notification Action Broadcast Receiver -->
        <receiver
            android:name=".receiver.ServiceActionReceiver"
            android:exported="false" />

    </application>
</manifest>
```

---

## 3. Foreground Service Implementation (`AGYServerService.kt`)

The service manages the lifecycle of the Go binary:
1. Creates the notification channel with `IMPORTANCE_LOW` (no intrusive sound/vibration).
2. Posts a persistent ongoing notification with interactive actions: `[ Open UI ]` and `[ Stop ]`.
3. Promotes itself to foreground via `ServiceCompat.startForeground`.
4. Extracts or locates the precompiled `ai-cli-online` Go executable.
5. Launches the daemon with an isolated environment (`HOME`, `PATH`, `TMPDIR`, `DATA_DIR`).
6. Tracks process termination and cleans up wake locks on destroy.

```kotlin
package com.huacheng.agyonline.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.huacheng.agyonline.R
import com.huacheng.agyonline.receiver.ServiceActionReceiver
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.concurrent.atomic.AtomicBoolean

class AGYServerService : Service() {

    companion object {
        private const val TAG = "AGYServerService"
        const val CHANNEL_ID = "agy_online_server_channel"
        const val NOTIFICATION_ID = 42001
        const val ACTION_START = "com.huacheng.agyonline.ACTION_START"
        const val ACTION_STOP = "com.huacheng.agyonline.ACTION_STOP"
        const val DEFAULT_PORT = 3001

        fun start(context: Context) {
            val intent = Intent(context, AGYServerService::class.java).apply {
                action = ACTION_START
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, AGYServerService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var serverProcess: Process? = null
    private val isRunning = AtomicBoolean(false)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Log.i(TAG, "Received STOP action. Stopping service...")
                stopServer()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_START, null -> {
                startForegroundNotification()
                if (!isRunning.get()) {
                    startServerProcess()
                }
            }
        }
        return START_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "AGY Online Server",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the AGY Online Web Terminal and task backend running"
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val serverUrl = "http://localhost:$DEFAULT_PORT"

        // Intent to open browser UI
        val openIntent = Intent(Intent.ACTION_VIEW, Uri.parse(serverUrl)).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val openPendingIntent = PendingIntent.getActivity(
            this,
            0,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Intent to stop server
        val stopIntent = Intent(this, ServiceActionReceiver::class.java).apply {
            action = ACTION_STOP
        }
        val stopPendingIntent = PendingIntent.getBroadcast(
            this,
            1,
            stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AGY Online Running")
            .setContentText("Listening on $serverUrl")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_menu_view, "Open UI", openPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopPendingIntent)
            .build()

        val foregroundType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        } else {
            0
        }

        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, foregroundType)
    }

    private fun startServerProcess() {
        Thread {
            try {
                val binaryFile = prepareBinary()
                val filesDir = applicationContext.filesDir
                val homeDir = File(filesDir, "home").apply { mkdirs() }
                val binDir = File(filesDir, "bin").apply { mkdirs() }
                val runDir = File(homeDir, ".ai-cli-online/run").apply { mkdirs() }

                val pb = ProcessBuilder(binaryFile.absolutePath, "start", "-p", DEFAULT_PORT.toString())
                val env = pb.environment()
                env["HOME"] = homeDir.absolutePath
                env["TMPDIR"] = cacheDir.absolutePath
                env["DATA_DIR"] = File(homeDir, ".ai-cli-online/data").absolutePath
                env["PATH"] = "${binDir.absolutePath}:/system/bin:/system/xbin"
                env["HOST"] = "0.0.0.0"

                pb.directory(homeDir)
                pb.redirectErrorStream(true)

                Log.i(TAG, "Starting AGY Online binary: ${binaryFile.absolutePath}")
                val process = pb.start()
                serverProcess = process
                isRunning.set(true)

                // Pipe process stdout to logcat
                process.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { line -> Log.d("AGYNativeServer", line) }
                }

                val exitCode = process.waitFor()
                Log.i(TAG, "AGY Online server process exited with code $exitCode")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to run AGY Online server process", e)
            } finally {
                isRunning.set(false)
                stopSelf()
            }
        }.start()
    }

    private fun prepareBinary(): File {
        // Strategy A: Check nativeLibraryDir (packaged as libagyserver.so)
        val nativeLib = File(applicationInfo.nativeLibraryDir, "libagyserver.so")
        if (nativeLib.exists() && nativeLib.canExecute()) {
            return nativeLib
        }

        // Strategy B: Extracted from assets to files/bin/ai-cli-online
        val binDir = File(applicationContext.filesDir, "bin").apply { mkdirs() }
        val target = File(binDir, "ai-cli-online")
        if (!target.exists() || target.length() == 0L) {
            assets.open("bin/ai-cli-online-android-arm64").use { input ->
                FileOutputStream(target).use { output ->
                    input.copyTo(output)
                }
            }
            target.setExecutable(true, false)
        }
        return target
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AGYOnline::ServerWakeLock").apply {
                setReferenceCounted(false)
                acquire(24 * 60 * 60 * 1000L) // 24 hours max
            }
        }
    }

    private fun stopServer() {
        isRunning.set(false)
        try {
            serverProcess?.destroy()
        } catch (e: Exception) {
            Log.e(TAG, "Error destroying process", e)
        }
        serverProcess = null
    }

    override fun onDestroy() {
        stopServer()
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
        super.onDestroy()
    }
}
```

---

## 4. Boot Receiver Implementation (`BootReceiver.kt`)

The broadcast receiver activates the service when the device boots, ensuring zero-touch service startup:

```kotlin
package com.huacheng.agyonline.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.huacheng.agyonline.service.AGYServerService

class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
    }

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        Log.i(TAG, "Received broadcast action: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                Log.i(TAG, "Initiating AGY Online Foreground Service on boot...")
                AGYServerService.start(context)
            }
        }
    }
}
```

### Action Receiver (`ServiceActionReceiver.kt`)

Handles actions from notification action buttons:

```kotlin
package com.huacheng.agyonline.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.huacheng.agyonline.service.AGYServerService

class ServiceActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action == AGYServerService.ACTION_STOP) {
            AGYServerService.stop(context)
        }
    }
}
```

---

## 5. Execution Strategy on Android 10+ (W^X & `noexec`)

Starting with Android 10 (API level 29), executing binaries from the application writable data directory (`/data/data/<pkg>/files/`) is blocked by SELinux and `noexec` mounts for apps targeting `targetSdkVersion >= 29` (W^X violation).

To guarantee seamless execution on modern Android devices:

### Recommended Approach: JNI Library Packaging (`libagyserver.so`)
1. Cross-compile the Go executable:
   ```bash
   CGO_ENABLED=0 GOOS=android GOARCH=arm64 go build -ldflags="-s -w" -o libagyserver.so ./cmd/ai-cli-online
   ```
2. Place the binary inside the APK native library folder:
   `app/src/main/jniLibs/arm64-v8a/libagyserver.so`
3. With `android:extractNativeLibs="true"` in `AndroidManifest.xml`, Android package manager extracts this file into:
   `/data/app/<pkg-uuid>/lib/arm64/libagyserver.so`
   This directory has executable permissions (`+x`) and complies with all SELinux policies on Android 10 through Android 15+.
4. `AGYServerService` invokes `File(applicationInfo.nativeLibraryDir, "libagyserver.so")` directly.

---

## 6. Toolchain & Runtime Strategy

In standalone mode (without Termux installed), AGY Online requires shell execution, node runtime, and `agy`:

### 1. Shell Execution & Direct PTY
- In standard Termux, AGY Online spawns `tmux` or `login` shell (`$SHELL` or `/data/data/com.termux/files/usr/bin/bash`).
- In standalone APK mode:
  - **Direct PTY Mode**: Utilizes `creack/pty` to spawn `/system/bin/sh` directly if `tmux` is absent.
  - **Bundled Shell**: Bundle static `toybox` or `busybox` into `files/bin` to provide core utilities (`ls`, `cat`, `grep`, `git`, `mkdir`).

### 2. Node.js & `agy` Runtime Deployment
- **Option 1: Minimal Hermetic Node Bundle**
  - Download or bundle a precompiled static Node.js binary for `android-arm64`.
  - Extract to `/data/data/com.huacheng.agyonline/files/node/bin/node`.
  - Install Google Antigravity CLI via standard npm or bundled tarball:
    `npm install -g @google/antigravity-cli` or bundled single-file wrapper.
- **Option 2: Termux Bridge / Coexistence**
  - If Termux is present on the device, the companion APK can detect `com.termux` and symlink `/data/data/com.termux/files/usr/bin` into its `$PATH`.

---

## 7. Build & Cross-Compilation Verification

The companion script `scripts/build-android-arm64.sh` builds the embedded Web UI and produces the standalone Android ARM64 ELF binary:

```bash
bash scripts/build-android-arm64.sh
```

Binary properties:
- **Architecture**: `ELF 64-bit LSB executable, ARM aarch64`
- **Linkage**: Static Go runtime, 0 CGO dependencies (`modernc.org/sqlite`)
- **Embedded Assets**: Full React + xterm.js bundle embedded via `assets.go` (`embed.FS`)
- **Size**: ~14MB stripped binary (executable + web UI combined)

---

## 8. Summary & Next Steps

| Component | Status | Implementation File |
|---|---|---|
| ARM64 Cross-Compile Script | **Complete** | [`scripts/build-android-arm64.sh`](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/brain/2fde4f6a-a1aa-40a8-a5cc-388d8dbef7b1/.system_generated/worktrees/subagent-Executor-Plan-004-self-19e71a54/scripts/build-android-arm64.sh) |
| Architecture & Kotlin Specs | **Complete** | [`docs/spikes/STANDALONE_ANDROID_SERVICE.md`](file:///data/data/com.termux/files/home/.gemini/antigravity-cli/brain/2fde4f6a-a1aa-40a8-a5cc-388d8dbef7b1/.system_generated/worktrees/subagent-Executor-Plan-004-self-19e71a54/docs/spikes/STANDALONE_ANDROID_SERVICE.md) |
| Android Gradle Project Spike | Optional Follow-up | `android/companion-apk/` |
