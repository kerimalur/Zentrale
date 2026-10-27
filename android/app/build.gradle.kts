plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ch.kerim.fokus"
    compileSdk = 34

    defaultConfig {
        applicationId = "ch.kerim.zentrale.fokus"
        minSdk = 26
        targetSdk = 34
        versionCode = 3
        versionName = "1.2"
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
