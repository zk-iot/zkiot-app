#include <M5Core2.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Adafruit_BME680.h>
#include "certs.h"

Adafruit_BME680 bme;   // I2C

// ==== WiFi / AWS設定（自分の値に）====
const char* ssid        = "pr500k-b58382-1";
const char* password    = "96d4e4b79c93a";
const char* awsEndpoint = "a2uyylclhlg2f7-ats.iot.ap-northeast-1.amazonaws.com";
const int   awsPort     = 8883;
const char* thingName   = "test_0914";
// 送信トピック（M5→AWS）
const char* pubTopic    = "devices/test_0914/telemetry";
// 受信トピック（AWS→M5）
const char* subTopic    = "test/topic";
// =====================================

WiFiClientSecure net;
PubSubClient client(net);

// ---- 時刻同期（TLS検証のため必須）----
void syncClock() {
  configTime(9 * 3600, 0, "ntp.nict.jp", "time.google.com", "pool.ntp.org"); // JST
  M5.Lcd.print("Sync time");
  time_t now = 0;
  int retry = 0;
  while (now < 1700000000 && retry++ < 50) { // 適当な閾値
    delay(200);
    now = time(nullptr);
    M5.Lcd.print(".");
  }
  M5.Lcd.println();
}

// ---- 受信時コールバック ----
void messageHandler(char* topic, byte* payload, unsigned int length) {
  String msg; msg.reserve(length);
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.setCursor(10, 60);
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(WHITE, BLACK);
  M5.Lcd.println("Topic: " + String(topic));

  M5.Lcd.setCursor(10, 100);
  M5.Lcd.println("Message: " + msg);
}

// ---- AWS IoT 接続 ----
void connectAWS() {
  net.setCACert(AWS_CERT_CA);
  net.setCertificate(AWS_CERT_CRT);
  net.setPrivateKey(AWS_CERT_PRIVATE);

  client.setServer(awsEndpoint, awsPort);
  client.setCallback(messageHandler);

  M5.Lcd.print("MQTT connecting");
  while (!client.connected()) {
    if (client.connect(thingName)) {
      client.subscribe(subTopic);
      break;
    }
    M5.Lcd.print(".");
    delay(1000);
  }
  M5.Lcd.println("\nMQTT connected");
}

void setup() {
  M5.begin();
  M5.Lcd.setTextSize(2);
  M5.Lcd.setTextColor(WHITE, BLACK);
  M5.Lcd.fillScreen(BLACK);
  M5.Lcd.println("WiFi connecting...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) { delay(300); M5.Lcd.print("."); }
  M5.Lcd.println("\nWiFi OK");

  syncClock();         // ★必須
  connectAWS();

  // BME688初期化
  Wire.begin(32, 33);                     // M5Core2 Grove I2C
  if (!bme.begin(0x76)) {
    M5.Lcd.println("BME688 0x76 NG, try 0x77");
    if (!bme.begin(0x77)) {
      M5.Lcd.println("BME688 Not found"); while (1) delay(1000);
    }
  }
  bme.setTemperatureOversampling(BME680_OS_2X);
  bme.setHumidityOversampling(BME680_OS_2X);
  bme.setPressureOversampling(BME680_OS_2X);
  bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
  bme.setGasHeater(320, 150);
}

unsigned long lastSent = 0;

void loop() {
  if (!client.connected()) connectAWS();
  client.loop();

  if (!bme.performReading()) return;

  float t = bme.temperature;         // °C
  float h = bme.humidity;            // %RH
  float p = bme.pressure / 100.0f;   // hPa
  float g = bme.gas_resistance;      // ohm

  // 画面表示
  M5.Lcd.setCursor(0, 30);
  M5.Lcd.printf("T: %.2f C\nH: %.1f %%\nP: %.1f hPa\nG: %.0f ohm\n", t, h, p, g);

  // 1秒ごとにPublish
  if (millis() - lastSent > 1000) {
    lastSent = millis();
    char payload[256];
    snprintf(payload, sizeof(payload),
      "{\"deviceId\":\"%s\",\"deviceTs\":%lu,\"t\":%.2f,\"h\":%.1f,\"p\":%.1f,\"g\":%.0f}",
      thingName, (unsigned long)time(nullptr), t, h, p, g);

    client.publish(pubTopic, payload);
  }
}

