plugins {
	id("com.android.application")
	id("org.jetbrains.kotlin.android")
}

android {
	namespace = "com.tsunamiredalerts.app"
	compileSdk = 34

	defaultConfig {
		applicationId = "com.tsunamiredalerts.app"
		minSdk = 24
		targetSdk = 34
		versionCode = 1
		versionName = "1.0.0"
	}

	signingConfigs {
		val keystore = rootProject.file("keystore/release.jks")
		if (keystore.exists()) {
			create("release") {
				storeFile = keystore
				storePassword = System.getenv("TSUNAMI_STORE_PASSWORD") ?: ""
				keyAlias = System.getenv("TSUNAMI_KEY_ALIAS") ?: "upload"
				keyPassword = System.getenv("TSUNAMI_KEY_PASSWORD") ?: ""
			}
		}
	}

	buildTypes {
		release {
			isMinifyEnabled = false
			proguardFiles(
				getDefaultProguardFile("proguard-android-optimize.txt"),
				"proguard-rules.pro",
			)
			signingConfigs.findByName("release")?.let { signingConfig = it }
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}

	kotlinOptions {
		jvmTarget = "17"
	}

	buildFeatures {
		buildConfig = true
	}

	packaging {
		resources {
			excludes += "/META-INF/{AL2.0,LGPL2.1}"
		}
	}
}

dependencies {
	implementation("androidx.appcompat:appcompat:1.7.0")
	implementation("androidx.webkit:webkit:1.12.1")
}
