'use client';

import React, { useRef, useState } from 'react';
import { z } from 'zod';

/** APIの返却スキーマ */
const ResultSchema = z.object({
  name: z.string().optional(),
  model: z.string().optional(),
  jan: z.string().optional(),
  upc: z.string().optional(),
  release_date: z.string().optional(),
  msrp_currency: z.string().optional(),
  msrp: z.number().optional(),
  confidence: z.number().optional(),
  used_price_min: z.number().optional(),
  used_price_max: z.number().optional(),
  used_price_currency: z.string().optional(),
  notes: z.string().optional(),
  enriched: z
    .object({
      title: z.string().optional(),
      official_release: z.string().optional(),
      official_msrp: z.number().optional(),
      currency: z.string().optional(),
      description: z.string().optional(),       // 詳細説明
      market_overview: z.string().optional(),   // 市場での流通価格（中古・中古相場）
      used_hint_min: z.number().optional(),
      used_hint_max: z.number().optional(),
    })
    .optional(),
});
type Result = z.infer<typeof ResultSchema>;

export default function Page() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  const multiPickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: File[]) {
    if (!newFiles.length) return;
    const merged = [...files];
    newFiles.forEach((f) => {
      const dup = merged.find((m) => m.name === f.name && m.size === f.size && m.type === f.type);
      if (!dup && merged.length < 5) merged.push(f);
    });
    setFiles(merged);
    setPreviews(merged.map((f) => URL.createObjectURL(f)));
    if (cameraRef.current) cameraRef.current.value = '';
    if (multiPickerRef.current) multiPickerRef.current.value = '';
  }

  function removeAt(idx: number) {
    const next = files.filter((_, i) => i !== idx);
    setFiles(next);
    setPreviews(next.map((f) => URL.createObjectURL(f)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (files.length === 0) return;

    try {
      setLoading(true);
      const form = new FormData();
      files.slice(0, 5).forEach((f) => form.append('images', f));
      const res = await fetch('/api/analyze', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const parsed = ResultSchema.safeParse(data);
      if (!parsed.success) throw new Error('解析結果の形式が不正です');
      setResult(parsed.data);
    } catch (err: any) {
      setError(err.message || '不明なエラー');
    } finally {
      setLoading(false);
    }
  }

  const yen = (v?: number) =>
    typeof v === 'number' && !Number.isNaN(v) && v > 0 ? `${v.toLocaleString()} 円` : '—';

  return (
    <>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>画像から商品情報を取得（MVP）</h1>
      <p className="label" style={{ marginBottom: 16 }}>
        箱・ラベル・型番が写る画像を <b>最大5枚</b> まで追加できます（スマホ推奨）。
      </p>

      <form onSubmit={onSubmit} className="card" encType="multipart/form-data">
        {/* 隠しinput（ライブラリ用） */}
        <input
          ref={multiPickerRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />
        {/* 隠しinput（カメラ用） */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
        />

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <button type="button" className="btn" onClick={() => setPickerOpen((v) => !v)}>
            画像を追加
          </button>
          {pickerOpen && (
            <div
              className="card"
              style={{
                position: 'absolute',
                zIndex: 10,
                marginTop: 8,
                padding: 8,
                width: 240,
              }}
            >
              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginBottom: 8 }}
                onClick={() => {
                  setPickerOpen(false);
                  multiPickerRef.current?.click();
                }}
              >
                フォトライブラリから選ぶ
              </button>
              <button
                type="button"
                className="btn"
                style={{ width: '100%' }}
                onClick={() => {
                  setPickerOpen(false);
                  cameraRef.current?.click();
                }}
              >
                カメラで撮影
              </button>
              <p className="label" style={{ marginTop: 8 }}>
                最大5枚まで追加できます
              </p>
            </div>
          )}
        </div>

        <p className="label">現在 {files.length}/5 枚</p>

        {previews.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              marginTop: 8,
            }}
          >
            {previews.map((src, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <img src={src} alt={`preview-${i}`} />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    borderRadius: 9999,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    padding: '2px 8px',
                    cursor: 'pointer',
                  }}
                  aria-label="remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 12 }} />
        <button className="btn" disabled={files.length === 0 || loading}>
          {loading ? '解析中...' : '解析する'}
        </button>
      </form>

      {error && (
        <div
          className="card"
          style={{ marginTop: 12, border: '1px solid #fee2e2', background: '#fff7f7' }}
        >
          <div className="value">エラー: {error}</div>
        </div>
      )}

      <div className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>結果</h2>
        {/* 概要（数値系） */}
        <div className="grid">
          <div>
            <div className="label">商品名</div>
            <div className="value">{result?.enriched?.title || result?.name || '—'}</div>
          </div>
          <div>
            <div className="label">型番</div>
            <div className="value">{result?.model || '—'}</div>
          </div>
          <div>
            <div className="label">JAN / UPC</div>
            <div className="value">{result?.jan || result?.upc || '—'}</div>
          </div>
          <div>
            <div className="label">発売日</div>
            <div className="value">
              {result?.enriched?.official_release || result?.release_date || '—'}
            </div>
          </div>
          <div>
            <div className="label">定価</div>
            <div className="value">
              {yen(result?.enriched?.official_msrp ?? result?.msrp)}
            </div>
          </div>
          <div>
            <div className="label">中古相場（概算ヒント）</div>
            <div className="value">
              {result?.enriched?.used_hint_min && result?.enriched?.used_hint_max
                ? `${result.enriched.used_hint_min.toLocaleString()}〜${result.enriched.used_hint_max.toLocaleString()} 円`
                : result?.used_price_min && result?.used_price_max
                ? `${result.used_price_min.toLocaleString()}〜${result.used_price_max.toLocaleString()} 円`
                : '—'}
            </div>
          </div>
        </div>

        {/* 詳細説明（必ず円表記を期待） */}
        {result?.enriched?.description && (
          <div style={{ marginTop: 12 }}>
            <div className="label">詳細説明</div>
            <div style={{ marginTop: 6 }}>{result.enriched.description}</div>
          </div>
        )}

        {/* 市場での流通価格（中古・中古相場） */}
        {result?.enriched?.market_overview && (
          <div style={{ marginTop: 12 }}>
            <div className="label">市場での流通価格（中古・中古相場）</div>
            <div style={{ marginTop: 6 }}>{result.enriched.market_overview}</div>
          </div>
        )}

        {result?.notes && <p className="label" style={{ marginTop: 8 }}>補足: {result.notes}</p>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>使い方</h3>
        <ol style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
          <li>バーコード（JAN）や型番が見えるように撮影（反射を避ける）</li>
          <li>解析 → OpenAIで抽出 → 追加リサーチで補完（円表記に統一）</li>
          <li>中古価格は仮。後でAucfan Pro APIに差し替え</li>
        </ol>
      </div>
    </>
  );
}
