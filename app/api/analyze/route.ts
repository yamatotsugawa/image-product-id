// app/api/analyze/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mockLookup } from "@/lib/mockDb";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

/** 画像→基本項目 抽出 */
const VisionSchema = z.object({
  name: z.string().optional(),
  model: z.string().optional(),
  jan: z.string().optional(),
  upc: z.string().optional(),
  release_date: z.string().optional(),
  msrp_currency: z.string().optional(),
  msrp: z.number().optional(),
  confidence: z.number().optional(),
  notes: z.string().optional(),
});
type Vision = z.infer<typeof VisionSchema>;

/** 追加リサーチ：文章2項目（円表記統一） */
const EnrichSchema = z.object({
  detail_description: z.string().optional(), // 詳細説明（定価も円で含める）
  market_overview: z.string().optional(),    // 市場での流通価格（中古・中古相場）
  official_release: z.string().optional(),   // YYYY / YYYY-MM / YYYY-MM-DD
  official_msrp_jpy: z.number().optional(),  // 円（数値）
});
type Enriched = z.infer<typeof EnrichSchema>;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    // 複数: images / 単体互換: image
    let files = form.getAll("images") as File[];
    const single = form.get("image") as File | null;
    if (files.length === 0 && single) files = [single];
    if (files.length === 0) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }

    const b64s = await Promise.all(
      files.slice(0, 5).map(async (f) => Buffer.from(await f.arrayBuffer()).toString("base64"))
    );

    // ---- Step 1: 画像 → 基本情報抽出（構造化JSON） ----
    const visionPrompt = `以下のJSONだけを返してください（余計な文字は一切出力しない）:
{
  "name": string, "model": string,
  "jan": string,  "upc": string,
  "release_date": string,
  "msrp_currency": string, "msrp": number,
  "confidence": number, "notes": string
}
制約: jan/upc は数字のみ。release_date は YYYY / YYYY-MM / YYYY-MM-DD。不明は空文字または0。`;

    let vision: Vision = {};
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: visionPrompt },
              ...b64s.map((b64) => ({
                type: "image_url" as const,
                image_url: { url: `data:image/jpeg;base64,${b64}` },
              })),
            ],
          },
        ],
        temperature: 0.2,
      });
      const text = resp.choices[0]?.message?.content ?? "{}";
      const parsed = VisionSchema.safeParse(JSON.parse(text));
      if (parsed.success) vision = parsed.data;
    } catch {
      // 失敗しても続行
    }

    // ---- Step 2: 追加リサーチ（文章2項目・円表記統一） ----
    let extra: Enriched | null = null;
    const query = vision.name || vision.jan || vision.upc || vision.model;
    if (query) {
      const enrichPrompt = `あなたは日本語で出力する商品リサーチャーです。次の対象について、
「詳細説明」と「市場での流通価格（中古・中古相場）」の2項目だけを含むJSONを返してください。
金額は必ず円（JPY）のみ、3桁区切り+「円」表記（例: 35,200円）で書いてください。定価は必ず含めてください。
schema:
{
  "detail_description": string, // アルコール度数・容量・初出発売年・定価（円）を含めた200字以内の説明（日本語）
  "market_overview": string,    // メルカリ/ヤフオク/通販などの流通相場を文章で（すべて円表記）
  "official_release": string,   // 例: "1992" or "1992-10"
  "official_msrp_jpy": number   // 定価（円, 数値）不明なら0
}
対象: ${query}`;

      try {
        const enrichRes = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "出力は必ず上記schemaのJSONのみ。金額は円のみ。" },
            { role: "user", content: enrichPrompt },
          ],
          temperature: 0.4,
        });
        const eText = enrichRes.choices[0]?.message?.content ?? "{}";
        const eParsed = EnrichSchema.safeParse(JSON.parse(eText));
        if (eParsed.success) extra = eParsed.data;
      } catch {
        // 失敗しても続行
      }
    }

    // ---- Step 3: モックDBとマージ ----
    const mock = mockLookup({
      jan: vision.jan || "",
      upc: vision.upc || "",
      name: vision.name || "",
      model: vision.model || "",
    });

    // 中古相場の簡易フォールバック（使わない場合もあるが用意）
    const fallbackUsed = estimateUsedPrice({
      msrp:
        extra?.official_msrp_jpy ||
        mock?.official_msrp ||
        vision.msrp ||
        0,
    });

    // 返却
    return NextResponse.json({
      // 基本抽出
      ...vision,
      msrp_currency: "JPY", // 表示側は円を前提
      // 文章2項目＋補助情報
      enriched: {
        title: mock?.title,
        official_release: extra?.official_release || mock?.official_release || vision.release_date,
        official_msrp: extra?.official_msrp_jpy || mock?.official_msrp || vision.msrp,
        currency: "JPY",
        description: extra?.detail_description, // ← 詳細説明
        // 文章の市場概観（中古・中古相場）
        market_overview: extra?.market_overview,
        // 参考：フォールバックで使うときのざっくり相場帯
        used_hint_min: fallbackUsed?.min,
        used_hint_max: fallbackUsed?.max,
      },
      // 旧フィールド（UIで使わないなら無視される）
      used_price_min: fallbackUsed?.min,
      used_price_max: fallbackUsed?.max,
      used_price_currency: "JPY",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "internal error" }, { status: 500 });
  }
}

function estimateUsedPrice({ msrp }: { msrp: number }) {
  if (!msrp || msrp <= 0) return null;
  const min = Math.round(msrp * 0.35);
  const max = Math.round(msrp * 0.7);
  return { min, max };
}

// Next.js 14 推奨の方法でリクエストサイズ制限を設定
export const sizeLimit = "10mb";
