import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, serviceKey);

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(payload: any): string {
  const out: string[] = [];

  function walk(value: any) {
    if (value == null) return;
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  }

  walk(payload);
  return out.join("\n");
}

function parseMoney(text: string) {
  const match = text.match(/R\$\s*([\d.]+,\d{2})/i);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

function parseSale(payload: any) {
  const text = extractText(payload);
  const quantityMatch = text.match(/(^|\s)(\d+)\s*x\b/i);
  const quantity = quantityMatch ? Number(quantityMatch[2]) : 1;
  const revenue = parseMoney(text);

  const lines = text.split(/\n|\\n/).map(x => x.trim()).filter(Boolean);
  let itemName =
    lines.find(line => /\d+\s*x/i.test(line) && /R\$/i.test(line)) ||
    lines.find(line => /\d+\s*x/i.test(line)) ||
    lines[0] ||
    "";

  itemName = itemName
    .replace(/R\$\s*[\d.]+,\d{2}/gi, "")
    .replace(/(^|\s)\d+\s*x\b/i, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { text, itemName, quantity, revenue };
}

async function findOption(itemName: string, quantity: number, revenue: number) {
  const { data, error } = await supabase
    .from("ad_options")
    .select("*, ads(title), products(name)")
    .eq("multiplier", quantity);

  if (error) throw new Error(error.message);

  const target = normalize(itemName);
  let best: any = null;
  let bestScore = -1;

  for (const option of data || []) {
    const adTitle = normalize(option.ads?.title || "");
    const productName = normalize(option.products?.name || "");
    const label = normalize(option.label || "");

    let score = 0;
    if (adTitle && target.includes(adTitle)) score += 55;
    if (productName && target.includes(productName)) score += 45;
    if (label && target.includes(label)) score += 15;
    if (Number(option.price) === Number(revenue)) score += 30;

    for (const word of adTitle.split(" ")) {
      if (word.length >= 4 && target.includes(word)) score += 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }

  return bestScore >= 10 ? best : null;
}

async function consumeFifo(productId: string, quantity: number) {
  const { data: batches, error } = await supabase
    .from("batches")
    .select("*")
    .eq("product_id", productId)
    .gt("remaining", 0)
    .order("bought_at", { ascending: true });

  if (error) throw new Error(error.message);

  const available = (batches || []).reduce((sum: number, batch: any) => sum + Number(batch.remaining), 0);
  if (available < quantity) throw new Error("Estoque insuficiente.");

  let need = quantity;
  let cost = 0;

  for (const batch of batches || []) {
    if (need <= 0) break;

    const remaining = Number(batch.remaining);
    const take = Math.min(need, remaining);

    cost += take * Number(batch.unit_cost);

    const { error: updateError } = await supabase
      .from("batches")
      .update({ remaining: remaining - take })
      .eq("id", batch.id);

    if (updateError) throw new Error(updateError.message);

    need -= take;
  }

  return cost;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/ggmax/webhook",
    message: "Webhook GGMAX ativo."
  });
}

export async function POST(req: NextRequest) {
  let payload: any;

  try {
    payload = await req.json();
  } catch {
    payload = { text: await req.text() };
  }

  const parsed = parseSale(payload);

  try {
    if (!parsed.revenue) throw new Error("Valor da venda não detectado.");

    const option = await findOption(parsed.itemName, parsed.quantity, parsed.revenue);

    if (!option) {
      await supabase.from("webhook_logs").insert({
        status: "unmatched",
        raw_payload: payload,
        parsed,
        error: "Nenhuma opção compatível encontrada."
      });

      return NextResponse.json({ ok: false, status: "unmatched", parsed });
    }

    const cost = await consumeFifo(option.product_id, parsed.quantity);

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        user_id: option.user_id,
        ad_id: option.ad_id,
        option_id: option.id,
        product_id: option.product_id,
        quantity: parsed.quantity,
        revenue: parsed.revenue,
        cost,
        profit: parsed.revenue - cost
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    await supabase.from("webhook_logs").insert({
      user_id: option.user_id,
      status: "imported",
      raw_payload: payload,
      parsed: { ...parsed, option_id: option.id, sale_id: sale.id }
    });

    return NextResponse.json({ ok: true, status: "imported", sale, parsed });
  } catch (err: any) {
    await supabase.from("webhook_logs").insert({
      status: "error",
      raw_payload: payload,
      parsed,
      error: err.message
    });

    return NextResponse.json({ ok: false, error: err.message, parsed }, { status: 400 });
  }
}
