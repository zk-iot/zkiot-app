"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Papa, { ParseError, ParseResult } from "papaparse";
import { motion } from "framer-motion";
import { Check, Upload, X } from "lucide-react";

// ──────────────────────────────────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────────────────────────────────

type Operator = "eq" | "gte" | "gt" | "lte" | "lt" | "between";

type FieldKind = "number" | "date" | "text";

export type ColumnRule = {
  column: string;
  mode: "reveal" | "prove" | "hide"; // Valueを公開 / 条件のみ証明 / 完全非公開
  operator?: Operator; // mode === "prove" のときだけ使う
  value?: string; // 閾Valueや比較対象（between の場合は "min,max"）
};

export type CsvDisclosureResult = {
  rows: string[][]; // 解析済みデータ（ヘッダ行は含まない）
  headers: string[];
  rules: ColumnRule[]; // LLM/zk 回路への入力にそのまま渡せる形
};

export default function CsvDisclosureStep({
  onBack,
  onContinue,
  sampleCsvText,
  title = "STEP • CSV Intake & Disclosure Policy",
}: {
  onBack?: () => void;
  onContinue: (result: CsvDisclosureResult) => void;
  /** 任意: サンプルCSVTextを渡すと「サンプル読み込み」ボタンが表示されます */
  sampleCsvText?: string;
  title?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [rules, setRules] = useState<ColumnRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);

  // 列ごとの型推定
  const fieldKinds: Record<string, FieldKind> = useMemo(() => {
    const kinds: Record<string, FieldKind> = {};
    headers.forEach((h, idx) => {
      const sample = (rows.find((r) => r[idx] && r[idx].trim() !== "")?.[idx] || "").trim();
      if (!sample) return (kinds[h] = "text");
      if (!Number.isNaN(Number(sample.replace(/,/g, "")))) {
        kinds[h] = "number";
      } else if (!isNaN(Date.parse(sample))) {
        kinds[h] = "date";
      } else {
        kinds[h] = "text";
      }
    });
    return kinds;
  }, [headers, rows]);

  const parseCsvText = useCallback((text: string) => {
    setError(null);
    Papa.parse<string[]>(text, {
      skipEmptyLines: true,
      complete: (result: ParseResult<string[]>) => {
        // Text入力のときは result.errors で検知する
        if (result.errors && result.errors.length > 0) {
          setError(result.errors[0].message || "Failed to parse CSV");
          return;
        }
        const data = result.data as string[][];
        if (!data.length) {
          setError("No rows found in the CSV");
          return;
        }
        const [h, ...body] = data;
        setHeaders(h);
        setRows(body);
        setRules(
          h.map((name) => ({
            column: name,
            mode: "prove",
            operator: defaultOperatorFor(name, body, h),
            value: defaultValueFor(name, body, h),
          }))
        );
      },
    });
  }, []);

  const onFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => parseCsvText(String(reader.result ?? ""));
      reader.onerror = () => setError("Failed to read the file");
      reader.readAsText(file);
    },
    [parseCsvText]
  );

  // /public/sample.csv を fetch して読み込む（ダウンロードはしない）
  const loadSampleFromPublic = useCallback(async () => {
    try {
      setLoadingSample(true);
      setError(null);
      const res = await fetch("/sample.csv", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to load /sample.csv (${res.status})`);
      }
      const text = await res.text();
      // デモっぽく少しディレイ演出（任意）
      await new Promise((r) => setTimeout(r, 350));
      parseCsvText(text);
    } catch (e: any) {
      setError(e?.message || "Failed to load sample CSV");
    } finally {
      setLoadingSample(false);
    }
  }, [parseCsvText]);

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
  };

  const updateRule = (col: string, patch: Partial<ColumnRule>) => {
    setRules((prev) => prev.map((r) => (r.column === col ? { ...r, ...patch } : r)));
  };

  const canContinue = headers.length > 0 && rules.length === headers.length;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-white/70">
        Upload a CSV or load the sample below, then choose what to reveal, prove, or hide per column.
      </p>

      {/* アクション：サンプル読み込み（/public） */}
      <div className="flex flex-wrap items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.98 }}
          disabled={loadingSample}
          onClick={loadSampleFromPublic}
          className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingSample ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              Loading sample from /public…
            </span>
          ) : (
            "Load sample from /public"
          )}
        </motion.button>

        {/* 既存の props 経由サンプルも残す（任意で使える） */}
        {sampleCsvText ? (
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={(e) => {
              e.stopPropagation();
              parseCsvText(sampleCsvText);
            }}
            className="rounded-xl bg-white/10 px-4 py-2 text-white hover:bg-blue-600 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            Load sample (from props)
          </motion.button>
        ) : null}
      </div>

      {/* アップローダ（ドラッグ＆ドロップ or クリック） */}
      <div
        {...dropHandlers}
        className={[
          "rounded-2xl border border-white/15 p-6 text-center cursor-pointer",
          dragOver ? "bg-white/10" : "bg-white/5",
        ].join(" ")}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <div className="flex items-center justify-center gap-2">
          <Upload className="h-5 w-5" />
          <span>Drag & drop a CSV here, or click to select</span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">{error}</div>
      )}

      {/* 解析結果 */}
      {headers.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
          {/* プレビュー（先頭10行） */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-white/5">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-white/80">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="odd:bg-white/0 even:bg-white/[0.03]">
                    {headers.map((h, idx) => (
                      <td key={h + idx} className="px-3 py-2 whitespace-nowrap text-white/80">
                        {r[idx]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-column disclosure policy設定 */}
          <div className="space-y-3">
            <h3 className="font-semibold">Column-by-Column Disclosure Policy</h3>
            <div className="grid gap-3">
              {headers.map((h, i) => (
                <div key={h + i} className="rounded-2xl border border-white/15 bg-white/5 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                    <div className="min-w-[180px] font-medium">{h}</div>

                    {/* モード選択 */}
                    <select
  className="rounded-xl bg-neutral-900 text-white border border-white/15 px-3 py-2 outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-blue-400"
  value={rules.find((r) => r.column === h)?.mode ?? "prove"}
  onChange={(e) => updateRule(h, { mode: e.target.value as ColumnRule["mode"] })}
>
  <option value="prove">Prove condition only (hide value)</option>
  <option value="hide">Hide completely</option>
  <option value="reveal">Reveal value</option>
</select>

                    {/* operator / value（prove のときのみ） */}
                    {rules.find((r) => r.column === h)?.mode === "prove" && (
                      <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
                        <OperatorSelect
                          kind={fieldKinds[h]}
                          value={
                            rules.find((r) => r.column === h)?.operator ??
                            defaultOperatorFor(h, rows, headers)
                          }
                          onChange={(op) => updateRule(h, { operator: op })}
                        />
                        <ValueInput
                          kind={fieldKinds[h]}
                          operator={rules.find((r) => r.column === h)?.operator ?? "eq"}
                          value={rules.find((r) => r.column === h)?.value ?? ""}
                          onChange={(val) => updateRule(h, { value: val })}
                        />
                      </div>
                    )}

                    <div className="ml-auto flex items-center gap-2 text-xs text-white/60">
                      <Check className="h-4 w-4" /> prove with ZK
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            {onBack ? (
              <button className="rounded-xl bg-white/10 px-4 py-2 hover:bg-white/15" onClick={onBack}>
                Back
              </button>
            ) : (
              <span />
            )}
            <button
              disabled={!canContinue}
              onClick={() => onContinue({ headers, rows, rules })}
              className="rounded-xl bg-white px-5 py-2 font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next (generate ZK circuit with LLM)
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/60 border-t-transparent align-[-2px]" />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// サブコンポーネント
// ──────────────────────────────────────────────────────────────────────────────

function OperatorSelect({
  kind,
  value,
  onChange,
}: {
  kind: FieldKind;
  value: Operator;
  onChange: (op: Operator) => void;
}) {
  const options: { v: Operator; label: string }[] = useMemo(() => {
    const common = [{ v: "eq" as Operator, label: "equals" }];
    const comp = [
      { v: "gte" as Operator, label: "greater than or equal to" },
      { v: "gt" as Operator, label: "greater than" },
      { v: "lte" as Operator, label: "less than or equal to" },
      { v: "lt" as Operator, label: "less than" },
      { v: "between" as Operator, label: "between" },
    ];
    if (kind === "text") return common; // テキストは eq のみ
    return [...common, ...comp];
  }, [kind]);

  return (
    <select
    className="min-w-[160px] rounded-xl bg-neutral-900 text-white border border-white/15 px-3 py-2 outline-none hover:border-white/25 focus-visible:ring-2 focus-visible:ring-blue-400"
    value={value}
    onChange={(e) => onChange(e.target.value as Operator)}
  >
    {options.map((o) => (
      <option key={o.v} value={o.v}>
        {o.label}
      </option>
    ))}
  </select>
  );
}

function ValueInput({
  kind,
  operator,
  value,
  onChange,
}: {
  kind: FieldKind;
  operator: Operator;
  value?: string;
  onChange: (v: string) => void;
}) {
  if (operator === "between") {
    return (
      <div className="flex items-center gap-2">
        <input
          type={kind === "date" ? "date" : "number"}
          placeholder={kind === "date" ? "Min date" : "Min value"}
          className="w-40 rounded-xl bg-white/10 px-3 py-2 outline-none"
          value={value?.split(",")[0] ?? ""}
          onChange={(e) => onChange(`${e.target.value},${value?.split(",")[1] ?? ""}`)}
        />
        <span className="text-white/60">〜</span>
        <input
          type={kind === "date" ? "date" : "number"}
          placeholder={kind === "date" ? "Max date" : "Max value"}
          className="w-40 rounded-xl bg-white/10 px-3 py-2 outline-none"
          value={value?.split(",")[1] ?? ""}
          onChange={(e) => onChange(`${value?.split(",")[0] ?? ""},${e.target.value}`)}
        />
      </div>
    );
  }

  return (
    <input
      type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
      placeholder={kind === "date" ? "Date" : kind === "number" ? "Value" : "Text"}
      className="w-60 rounded-xl bg-white/10 px-3 py-2 outline-none"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 初期Valueユーティリティ
// ──────────────────────────────────────────────────────────────────────────────

function defaultOperatorFor(column: string, body: string[][], headers: string[]): Operator {
  // 数Value/Dateは gte を初期Value、テキストは eq
  const colIdx = headers.indexOf(column);
  const sample = (body.find((r) => r[colIdx])?.[colIdx] ?? "").trim();
  if (!sample) return "eq";
  if (!Number.isNaN(Number(sample.replace(/,/g, ""))) || !isNaN(Date.parse(sample))) return "gte";
  return "eq";
}

function defaultValueFor(column: string, body: string[][], headers: string[]): string | undefined {
  const colIdx = headers.indexOf(column);
  const sample = (body.find((r) => r[colIdx])?.[colIdx] ?? "").trim();
  if (!sample) return "";
  // 数ValueはサンプルValue、DateはサンプルDate、テキストは空
  if (!Number.isNaN(Number(sample.replace(/,/g, ""))) || !isNaN(Date.parse(sample))) return sample;
  return "";
}
