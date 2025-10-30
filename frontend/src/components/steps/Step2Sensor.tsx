// components/steps/Step2Sensor.tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/core";

type Sensor = {
  id: string;
  name: string;
  description: string;
  disabled?: boolean; // Demo: BME680 以外は選択不可
};

const SENSORS: Sensor[] = [
  {
    id: "bme680",
    name: "BME680 (Bosch)",
    description:
      "Temp / Humidity / Pressure / Gas (IAQ) — environmental monitoring",
    disabled: false, // ← これだけ選択可能
  },
  // 工場向け7種（ロック）
  { id: "adxl355", name: "ADXL355 Industrial Accelerometer", description: "Vibration monitoring for motors/pumps — condition-based maintenance", disabled: true },
  { id: "pressure-4_20ma", name: "4–20 mA Pressure Transducer (0–10 bar)", description: "Analog process pressure via 4–20 mA to PLC/DAQ", disabled: true },
  { id: "k-type-thermocouple", name: "K-type Thermocouple (w/ MAX31855)", description: "High-temperature process monitoring for furnaces/extruders", disabled: true },
  { id: "ultrasonic-flow", name: "Clamp-on Ultrasonic Flow Meter", description: "Non-invasive flow for water/coolant lines (DN15–DN100)", disabled: true },
  { id: "diff-pressure", name: "Differential Pressure Sensor", description: "Filter/duct pressure drop for HVAC & cleanroom compliance", disabled: true },
  { id: "inductive-prox", name: "Inductive Proximity Sensor (M12, NPN NO)", description: "Discrete position/speed detection on conveyors/actuators", disabled: true },
  { id: "current-ct", name: "Current Sensor (CT/Rogowski)", description: "Motor/line current for load anomalies & energy monitoring", disabled: true },
];

export default function Step2Sensor({
  onNext,
  onPrev,
}: {
  onNext: () => void; // Step3 に進む
  onPrev: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // ゆるい条件：何か選ばれて「Selected」が出ていればOK
  const showNext = !!selected; // ← これだけ

  return (
    <Card className="relative">
      <h2 className="text-xl font-semibold mb-2">STEP 2 • Select Sensor</h2>
      <p className="text-white/70 mb-4">
        Choose the sensor to use.{" "}
        <span className="text-white/50">
          (Demo: Only <span className="text-white">BME680</span> is selectable.)
        </span>
      </p>

      <fieldset className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <legend className="sr-only">Sensor selection</legend>

        {SENSORS.map((s) => {
          const active = selected === s.id;
          const isDisabled = !!s.disabled;
          const inputId = `sensor-${s.id}`;
          return (
            <label
              key={s.id}
              htmlFor={inputId}
              className={cn(
                "block select-none rounded-xl border px-4 py-3 text-left transition",
                active
                  ? "border-blue-500/50 bg-blue-500/10"
                  : "border-white/10 bg-black/20 hover:border-white/30",
                isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
              )}
              onMouseDown={(e) => e.preventDefault()} // モバイル長押し等の選択ズレ対策
            >
              <input
                id={inputId}
                type="radio"
                name="sensor"
                value={s.id}
                className="sr-only"
                disabled={isDisabled}
                checked={active}
                onChange={() => !isDisabled && setSelected(s.id)}
              />
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.name}</div>
                {!isDisabled && active && (
                  <span className="text-xs text-blue-400">Selected</span>
                )}
                {isDisabled && (
                  <span className="text-xs text-white/40">Locked (Demo)</span>
                )}
              </div>
              <div className="mt-1 text-sm text-white/70">{s.description}</div>
            </label>
          );
        })}
      </fieldset>

      {/* Back は任意。残す場合だけ表示 */}
      <div className="mt-6">
        <button
          onClick={onPrev}
          className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-white/15"
        >
          Back
        </button>
      </div>

      {/* ★ Next：選択されたら“必ず”右下に出す（Buttonは使わず素のbuttonで確実に表示） */}
      {showNext && (
        <button
          type="button"
          onClick={onNext}
          className="fixed bottom-6 right-6 z-[9999] rounded-xl bg-blue-500 px-5 py-2 text-sm font-semibold text-black hover:bg-blue-400 shadow-lg"
        >
          Next
        </button>
      )}
    </Card>
  );
}

