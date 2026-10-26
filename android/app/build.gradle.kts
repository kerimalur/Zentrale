plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ch.kerim.fokus"
    compileSdk = 34

    defaultConfig {
        applicationId = "ch.kerim.fokus"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    // Fester Schlüssel, damit spätere Versionen über die installierte App drüber installiert werden können.
    signingConfigs {
        create("fokus") {
            storeFile = file("../fokus.keystore")
            storePassword = "fokus-zentrale"
            keyAlias = "fokus"
            keyPassword = "fokus-zentrale"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("fokus")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
