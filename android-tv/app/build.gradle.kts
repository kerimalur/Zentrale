plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ch.kerim.zentrale.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "ch.kerim.zentrale.tv"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        // Adresse der Zentrale (Tailscale muss auf der Box laufen).
        buildConfigField("String", "START_URL", "\"https://homelabkerim.taila4b96b.ts.net:8443/tv/\"")
    }

    buildFeatures { buildConfig = true }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
