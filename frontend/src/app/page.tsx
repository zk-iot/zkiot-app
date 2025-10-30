// app/page.tsx
"use client";
import { useEffect, useState } from "react";
import { Stepper } from "@/components/Stepper";
import Step1Login from "@/components/steps/Step1Login";
import Step2Sensor from "@/components/steps/Step2Sensor";
import Step3Template from "@/components/steps/Step3Template";
import Step4Dashboard from "@/components/steps/Step4Dashboard";
import Step5Disclosure from "@/components/steps/Step5Disclosure";
import Step6ZKProof from "@/components/steps/Step6ZKProof";
import Step7SubmitReward from "@/components/steps/Step7SubmitReward";

export default function Page() {
  const [step, setStep] = useState(0);
  const [template, setTemplate] = useState("voc");

  const LAST = 6;
  const next = () => setStep((s) => Math.min(LAST, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));
  const goTo = (i: number) => setStep(() => Math.max(0, Math.min(LAST, i)));

  // ← / → キーでナビゲート
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* ステップタブ（枠外） */}
        <Stepper current={step} onNavigate={(i) => goTo(i)} />

        {/* 青い枠（中身） */}
        <div className="rounded-xl border-2 border-blue-500/60 bg-black/40 p-6 shadow-[inset_0_0_0_4px_rgba(59,130,246,0.12)]">
          {step === 0 && <Step1Login onNext={next} />}
          {step === 1 && <Step2Sensor onNext={next} onPrev={prev} />}
          {step === 2 && (
            <Step3Template onNext={next} onPrev={prev} onSelect={(id) => setTemplate(id)} />
          )}
          {step === 3 && <Step4Dashboard onNext={next} onPrev={prev} />}
          {step === 4 && <Step5Disclosure onContinue={next} onBack={prev} />}
          {step === 5 && <Step6ZKProof onNext={next} onPrev={prev} />}
          {step === 6 && <Step7SubmitReward onPrev={prev} />}
        </div>

        {/* Template 表示（枠の下） */}
        <div className="text-xs text-white/60">
          Template: <span className="text-white/80">{template}</span>
        </div>
      </div>
    </div>
  );
}
