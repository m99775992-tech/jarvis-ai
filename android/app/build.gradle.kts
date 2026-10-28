import java.io.File

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Single source of truth for the version: VERSION in app/js/app.js (the web app).
val webDir = File(rootDir, "../app")
val webVersion: String = Regex("VERSION = '([0-9]+\\.[0-9]+\\.[0-9]+)'")
    .find(File(webDir, "js/app.js").readText())?.groupValues?.get(1) ?: "0.0.0"
val (vMaj, vMin, vPat) = webVersion.split(".").map { it.toInt() }

android {
    namespace = "com.mizan.jarvis"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.mizan.jarvis"
        minSdk = 24
        targetSdk = 34
        versionCode = vMaj * 10000 + vMin * 100 + vPat
        versionName = webVersion
    }

    signingConfigs {
        // Release key comes from GitHub Actions secrets. Same key every build, so updates install over
        // the old app without losing data. Without the secrets (local build) the debug key is used.
        val ks = System.getenv("JARVIS_KEYSTORE_FILE")
        if (ks != null && File(ks).exists()) {
            create("release") {
                storeFile = File(ks)
                storePassword = System.getenv("JARVIS_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("JARVIS_KEY_ALIAS")
                keyPassword = System.getenv("JARVIS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    // The web app (../app) is packaged as-is into the APK's assets: one codebase for web and Android.
    sourceSets["main"].assets.srcDirs(File(buildDir, "generated/jarvis-web"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures { buildConfig = true }
}

val copyWebApp by tasks.registering(Copy::class) {
    from(webDir) { exclude("sw.js") }
    into(File(buildDir, "generated/jarvis-web/www"))
}
tasks.named("preBuild") { dependsOn(copyWebApp) }

dependencies {
    implementation("androidx.webkit:webkit:1.11.0")
}
