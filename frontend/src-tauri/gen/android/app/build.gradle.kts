import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val releaseProperties = Properties().apply {
    file("release.properties").inputStream().use { load(it) }
}

// Debug builds use Android's development keystore. Private release signing is
// loaded only when present and validated only when a release task executes.
val signingFile = rootProject.file("keystore.properties")
val releaseSigning = Properties().apply {
    if (signingFile.exists()) signingFile.inputStream().use { load(it) }
}
val releaseStoreFile = releaseSigning.getProperty("storeFile")
    ?.takeIf { it.isNotBlank() }?.let { rootProject.file(it) }
val releaseKeyPassword = releaseSigning.getProperty("keyPassword")
    ?: releaseSigning.getProperty("password")
val releaseStorePassword = releaseSigning.getProperty("storePassword")
    ?: releaseSigning.getProperty("password")

val checkReleaseSigning = tasks.register("checkReleaseSigning") {
    group = "verification"
    description = "Validate private signing inputs for release builds"
    inputs.property("signingFilePresent", signingFile.isFile)
    inputs.property("signingComplete", !releaseSigning.getProperty("keyAlias").isNullOrBlank()
        && !releaseKeyPassword.isNullOrBlank()
        && !releaseStorePassword.isNullOrBlank()
        && releaseStoreFile?.isFile == true)
    doLast {
        require(inputs.properties["signingFilePresent"] == true) {
            "Release signing requires keystore.properties; use a Debug build without private keys. See docs/android.md."
        }
        require(inputs.properties["signingComplete"] == true) {
            "Incomplete release signing: configure keyAlias, storeFile and key/store passwords in keystore.properties. See docs/android.md."
        }
    }
}

tasks.configureEach {
    if (name.startsWith("pre") && name.endsWith("ReleaseBuild")) {
        dependsOn(checkReleaseSigning)
    }
}

android {
    compileSdk = 37
    namespace = "cn.synaxis.client"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        applicationId = "cn.synaxis.client"
        minSdk = 24
        targetSdk = 37
        versionCode = releaseProperties.getProperty("versionCode").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            keyAlias = releaseSigning.getProperty("keyAlias")
            keyPassword = releaseKeyPassword
            storeFile = releaseStoreFile
            storePassword = releaseStorePassword
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
    packaging {
        jniLibs.useLegacyPackaging = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))

