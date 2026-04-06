plugins {
    java
    application
}

application {
    mainClass.set("dejavu.DejaVuWorker")
    applicationName = "worker"
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("io.temporal:temporal-sdk:1.27.0")
    implementation("com.google.gson:gson:2.11.0")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}
