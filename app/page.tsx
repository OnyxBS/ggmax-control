"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Ad, AdOption, Batch, Product, Sale } from "@/lib/types";
import { brl, dateBR, downloadText, normalize, pct, toCsv, today } from "@/lib/utils";
import { Badge, Button, Card, DangerButton, GhostButton, Input, Label, Select, Textarea } from "@/components/ui";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Archive, BarChart3, Boxes, Bot, Download, FileJson, FileText, LogOut, Package, Pencil, Plus, Search, ShoppingCart, Sparkles, Trash2, TrendingUp, Upload } from "lucide-react";

type View = "dashboard" | "produtos" | "lotes" | "anuncios" | "vendas" | "financeiro" | "backup" | "importador";

function parseMoney(text: string) {
  const match = text.match(/R\$\s*([\d.]+,\d{2})/i);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, "").replace(",", "."));
}

function parseManual(text: string) {
  const lines = text.split(/\n/).map(x => x.trim()).filter(Boolean);
  const items: any[] = [];

  for (const line of lines) {
    const value = parseMoney(line);
    if (!value) continue;

    const qMatch = line.match(/(^|\s)(\d+)\s*x\b/i);
    const quantity = qMatch ? Number(qMatch[2]) : 1;

    const name = line
      .replace(/R\$\s*[\d.]+,\d{2}/gi, "")
      .replace(/(^|\s)\d+\s*x\b/i, " ")
      .replace(/\s+/g, " ")
      .trim();

    items.push({ line, name, quantity, revenue: value });
  }

  return items;
}

function findOption(item: any, options: AdOption[], ads: Ad[], products: Product[]) {
  const target = normalize(item.name);
  let best: any = null;
  let bestScore = -1;

  for (const option of options) {
    if (option.multiplier !== item.quantity) continue;

    const ad = ads.find(a => a.id === option.ad_id);
    const product = products.find(p => p.id === option.product_id);

    const adTitle = normalize(ad?.title || "");
    const productName = normalize(product?.name || "");
    const label = normalize(option.label || "");

    let score = 0;
    if (adTitle && target.includes(adTitle)) score += 55;
    if (productName && target.includes(productName)) score += 45;
    if (label && target.includes(label)) score += 15;
    if (Number(option.price) === Number(item.revenue)) score += 30;

    for (const word of adTitle.split(" ")) {
      if (word.length >= 4 && target.includes(word)) score += 4;
    }
    for (const word of productName.split(" ")) {
      if (word.length >= 4 && target.includes(word)) score += 4;
    }

    if (score > bestScore) {
      bestScore = score;
      best = option;
    }
  }

  return bestScore >= 10 ? best : null;
}

async function consumeFifo(productId: string, quantity: number, batches: Batch[]) {
  let need = quantity;
  let cost = 0;

  const lots = batches
    .filter(b => b.product_id === productId && b.remaining > 0)
    .sort((a, b) => new Date(a.bought_at).getTime() - new Date(b.bought_at).getTime());

  const available = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < quantity) throw new Error("Estoque insuficiente.");

  for (const lot of lots) {
    if (need <= 0) break;
    const take = Math.min(need, lot.remaining);
    cost += take * lot.unit_cost;

    const { error } = await supabase
      .from("batches")
      .update({ remaining: lot.remaining - take })
      .eq("id", lot.id);

    if (error) throw new Error(error.message);
    need -= take;
  }

  return cost;
}

async function registerSale(option: AdOption, quantity: number, revenue: number, batches: Batch[]) {
  const cost = await consumeFifo(option.product_id, quantity, batches);

  const { error } = await supabase.from("sales").insert({
    user_id: option.user_id,
    ad_id: option.ad_id,
    option_id: option.id,
    product_id: option.product_id,
    quantity,
    revenue,
    cost,
    profit: revenue - cost
  });

  if (error) throw new Error(error.message);
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [options, setOptions] = useState<AdOption[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  async function refresh() {
    if (!user) return;

    const [p, b, a, o, s] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("batches").select("*").order("bought_at", { ascending: true }),
      supabase.from("ads").select("*").order("created_at", { ascending: false }),
      supabase.from("ad_options").select("*").order("created_at", { ascending: false }),
      supabase.from("sales").select("*").order("sold_at", { ascending: false })
    ]);

    if (p.data) setProducts(p.data as Product[]);
    if (b.data) setBatches((b.data as any[]).map(x => ({ ...x, quantity: Number(x.quantity), remaining: Number(x.remaining), unit_cost: Number(x.unit_cost) })));
    if (a.data) setAds(a.data as Ad[]);
    if (o.data) setOptions((o.data as any[]).map(x => ({ ...x, multiplier: Number(x.multiplier), price: Number(x.price) })));
    if (s.data) setSales((s.data as any[]).map(x => ({ ...x, quantity: Number(x.quantity), revenue: Number(x.revenue), cost: Number(x.cost), profit: Number(x.profit) })));
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    refresh();
  }, [user]);

  const stats = useMemo(() => {
    const revenue = sales.reduce((sum, sale) => sum + sale.revenue, 0);
    const cost = sales.reduce((sum, sale) => sum + sale.cost, 0);
    const profit = sales.reduce((sum, sale) => sum + sale.profit, 0);
    const invested = batches.reduce((sum, batch) => sum + batch.remaining * batch.unit_cost, 0);
    const margin = revenue ? (profit / revenue) * 100 : 0;
    const lowStock = products.filter(p => batches.filter(b => b.product_id === p.id).reduce((s, b) => s + b.remaining, 0) <= 5).length;
    return { revenue, cost, profit, invested, margin, lowStock };
  }, [sales, batches, products]);

  if (loading) return <main className="p-8">Carregando...</main>;
  if (!user) return <Auth />;

  const nav = [
    ["dashboard", "Dashboard", BarChart3],
    ["produtos", "Produtos", Package],
    ["lotes", "Lotes FIFO", Boxes],
    ["anuncios", "Anúncios", Sparkles],
    ["vendas", "Vendas", ShoppingCart],
    ["financeiro", "Financeiro", TrendingUp],
    ["backup", "Backup", Archive],
    ["importador", "Importador", Bot]
  ] as const;

  return (
    <main className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-blue-900/60 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-xl font-black"><span className="text-cyanx">GGMAX</span> Control Blue</h1>
            <p className="text-xs text-blue-200/60">FULL corrigido · {user.email}</p>
          </div>
          <GhostButton onClick={() => supabase.auth.signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</GhostButton>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[240px_1fr]">
        <aside className="no-print space-y-2">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setView(id as View)}
              className={`flex w-full items-center rounded-xl px-4 py-3 text-left font-semibold ${
                view === id ? "bg-brand text-white" : "border border-blue-900/70 bg-panel/60 text-blue-100 hover:bg-blue-500/10"
              }`}
            >
              <Icon className="mr-3 h-4 w-4" /> {label}
            </button>
          ))}
        </aside>

        <section className="space-y-5">
          {msg && (
            <Card className="no-print flex items-center justify-between border-cyan-400/50 text-cyan-200">
              <span>{msg}</span>
              <button onClick={() => setMsg("")}>×</button>
            </Card>
          )}

          {view === "dashboard" && <Dashboard stats={stats} products={products} batches={batches} ads={ads} options={options} sales={sales} />}
          {view === "produtos" && <Products user={user} products={products} batches={batches} options={options} sales={sales} refresh={refresh} setMsg={setMsg} />}
          {view === "lotes" && <Batches user={user} products={products} batches={batches} refresh={refresh} setMsg={setMsg} />}
          {view === "anuncios" && <Ads user={user} products={products} ads={ads} options={options} sales={sales} refresh={refresh} setMsg={setMsg} />}
          {view === "vendas" && <Sales user={user} products={products} batches={batches} ads={ads} options={options} sales={sales} refresh={refresh} setMsg={setMsg} />}
          {view === "financeiro" && <Finance stats={stats} products={products} ads={ads} sales={sales} />}
          {view === "backup" && <Backup stats={stats} products={products} batches={batches} ads={ads} options={options} sales={sales} />}
          {view === "importador" && <Importer user={user} products={products} batches={batches} ads={ads} options={options} refresh={refresh} setMsg={setMsg} />}
        </section>
      </div>
    </main>
  );
}

function Auth() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit() {
    const { error } = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

    setMessage(error ? error.message : mode === "register" ? "Conta criada. Confira seu e-mail se pedir confirmação." : "Entrando...");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-3xl font-black"><span className="text-cyanx">GGMAX</span> Control Blue</h1>
        <p className="mt-2 text-blue-200/70">Login Supabase com dados isolados por usuário.</p>
        <div className="mt-6 space-y-3">
          <div><Label>Email</Label><Input value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><Label>Senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
          {message && <p className="text-sm text-cyan-200">{message}</p>}
          <Button className="w-full" onClick={submit}>{mode === "login" ? "Entrar" : "Cadastrar"}</Button>
          <GhostButton className="w-full" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Criar conta" : "Já tenho conta"}
          </GhostButton>
        </div>
      </Card>
    </main>
  );
}

function Dashboard({ stats, products, batches, ads, options, sales }: any) {
  const chart = sales.slice().reverse().map((s: Sale) => ({
    data: dateBR(s.sold_at),
    faturamento: s.revenue,
    lucro: s.profit
  }));

  const top = products
    .map((p: Product) => {
      const rows = sales.filter((s: Sale) => s.product_id === p.id);
      return { name: p.name, lucro: rows.reduce((a: number, s: Sale) => a + s.profit, 0) };
    })
    .sort((a: any, b: any) => b.lucro - a.lucro)
    .slice(0, 5);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-5">
        <Stat title="Faturamento" value={brl(stats.revenue)} />
        <Stat title="Lucro" value={brl(stats.profit)} />
        <Stat title="Margem" value={pct(stats.margin)} />
        <Stat title="Investido" value={brl(stats.invested)} />
        <Stat title="Estoque baixo" value={stats.lowStock} warn={stats.lowStock > 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Vendas e lucro</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="data" />
                <YAxis />
                <Tooltip />
                <Area dataKey="faturamento" fill="#3b82f655" stroke="#3b82f6" />
                <Area dataKey="lucro" fill="#06b6d455" stroke="#06b6d4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">Top produtos</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="lucro" fill="#06b6d4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Produtos" value={products.length} />
        <Stat title="Lotes" value={batches.length} />
        <Stat title="Anúncios" value={ads.length} />
        <Stat title="Opções" value={options.length} />
      </div>
    </>
  );
}

function Stat({ title, value, warn }: { title: string; value: any; warn?: boolean }) {
  return (
    <Card className={warn ? "border-yellow-500/50" : ""}>
      <p className="text-sm text-blue-200/60">{title}</p>
      <strong className={`mt-2 block text-2xl ${warn ? "text-yellow-200" : ""}`}>{value}</strong>
    </Card>
  );
}

function Products({ user, products, batches, options, sales, refresh, setMsg }: any) {
  const blank = { name: "", category: "", supplier: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Product | null>(null);
  const [q, setQ] = useState("");

  const rows = products.filter((p: Product) => p.name.toLowerCase().includes(q.toLowerCase()));

  function stock(p: Product) {
    return batches.filter((b: Batch) => b.product_id === p.id).reduce((s: number, b: Batch) => s + b.remaining, 0);
  }

  function invested(p: Product) {
    return batches.filter((b: Batch) => b.product_id === p.id).reduce((s: number, b: Batch) => s + b.remaining * b.unit_cost, 0);
  }

  async function save() {
    if (!form.name.trim()) return;
    const payload = { name: form.name, category: form.category, supplier: form.supplier, notes: form.notes };

    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert({ ...payload, user_id: user.id });

    setMsg(error ? error.message : editing ? "Produto atualizado." : "Produto criado.");
    setForm(blank);
    setEditing(null);
    await refresh();
  }

  async function remove(p: Product) {
    if (sales.some((s: Sale) => s.product_id === p.id) || options.some((o: AdOption) => o.product_id === p.id)) {
      setMsg("Produto possui vínculo e não pode ser excluído.");
      return;
    }
    if (!confirm(`Excluir ${p.name}?`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    setMsg(error ? error.message : "Produto excluído.");
    await refresh();
  }

  return (
    <>
      <Card>
        <h2 className="mb-4 text-lg font-bold">{editing ? "Editar produto" : "Novo produto"}</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Nome" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input placeholder="Categoria" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
          <Input placeholder="Fornecedor" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
          <Input placeholder="Observação" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save}><Plus className="mr-2 h-4 w-4" />Salvar</Button>
          {editing && <GhostButton onClick={() => { setEditing(null); setForm(blank); }}>Cancelar</GhostButton>}
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex gap-2">
          <Search className="h-4 w-4 text-blue-200/60" />
          <Input placeholder="Buscar produto" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Table headers={["Produto", "Categoria", "Fornecedor", "Estoque", "Investido", "Ações"]} rows={rows.map((p: Product) => [
          p.name,
          p.category || "-",
          p.supplier || "-",
          stock(p),
          brl(invested(p)),
          <Actions key={p.id} onEdit={() => { setEditing(p); setForm({ name: p.name, category: p.category || "", supplier: p.supplier || "", notes: p.notes || "" }); }} onDelete={() => remove(p)} />
        ])} />
      </Card>
    </>
  );
}

function Batches({ user, products, batches, refresh, setMsg }: any) {
  const blank = { product_id: "", quantity: "", remaining: "", unit_cost: "", bought_at: today() };
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<Batch | null>(null);

  async function save() {
    if (!form.product_id || !form.quantity || !form.unit_cost) return;

    const quantity = Number(form.quantity);
    const remaining = form.remaining === "" ? quantity : Number(form.remaining);

    if (remaining > quantity) {
      setMsg("Restante não pode ser maior que quantidade.");
      return;
    }

    const payload = {
      product_id: form.product_id,
      quantity,
      remaining,
      unit_cost: Number(form.unit_cost),
      bought_at: form.bought_at
    };

    const { error } = editing
      ? await supabase.from("batches").update(payload).eq("id", editing.id)
      : await supabase.from("batches").insert({ ...payload, user_id: user.id });

    setMsg(error ? error.message : editing ? "Lote atualizado." : "Lote criado.");
    setForm(blank);
    setEditing(null);
    await refresh();
  }

  async function remove(b: Batch) {
    if (b.remaining !== b.quantity) {
      setMsg("Só é seguro excluir lote que ainda não foi consumido.");
      return;
    }
    if (!confirm("Excluir lote?")) return;
    const { error } = await supabase.from("batches").delete().eq("id", b.id);
    setMsg(error ? error.message : "Lote excluído.");
    await refresh();
  }

  return (
    <>
      <Card>
        <h2 className="mb-4 text-lg font-bold">{editing ? "Editar lote" : "Novo lote FIFO"}</h2>
        <div className="grid gap-3 md:grid-cols-5">
          <Select value={form.product_id} onChange={e => setForm({ ...form, product_id: e.target.value })}>
            <option value="">Produto</option>
            {products.map((p: Product) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Input type="number" placeholder="Quantidade" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
          <Input type="number" placeholder="Restante" value={form.remaining} onChange={e => setForm({ ...form, remaining: e.target.value })} />
          <Input type="number" step="0.01" placeholder="Custo un." value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} />
          <Input type="date" value={form.bought_at} onChange={e => setForm({ ...form, bought_at: e.target.value })} />
        </div>
        <div className="mt-4 flex gap-2">
          <Button onClick={save}>Salvar</Button>
          {editing && <GhostButton onClick={() => { setEditing(null); setForm(blank); }}>Cancelar</GhostButton>}
        </div>
      </Card>

      <Card>
        <Table headers={["Produto", "Qtd", "Restante", "Custo", "Data", "Status", "Ações"]} rows={batches.map((b: Batch) => [
          products.find((p: Product) => p.id === b.product_id)?.name || "-",
          b.quantity,
          b.remaining,
          brl(b.unit_cost),
          dateBR(b.bought_at),
          b.remaining <= 5 ? <Badge key="w" tone="warn">baixo</Badge> : <Badge key="g" tone="good">ok</Badge>,
          <Actions key={b.id} onEdit={() => { setEditing(b); setForm({ product_id: b.product_id, quantity: String(b.quantity), remaining: String(b.remaining), unit_cost: String(b.unit_cost), bought_at: b.bought_at }); }} onDelete={() => remove(b)} />
        ])} />
      </Card>
    </>
  );
}

function Ads({ user, products, ads, options, sales, refresh, setMsg }: any) {
  const [ad, setAd] = useState({ title: "", ggmax_id: "", status: "ativo" });
  const [editingAd, setEditingAd] = useState<Ad | null>(null);
  const [opt, setOpt] = useState({ ad_id: "", product_id: "", label: "1x", multiplier: "1", price: "" });
  const [editingOpt, setEditingOpt] = useState<AdOption | null>(null);

  async function saveAd() {
    if (!ad.title.trim()) return;
    const payload = { title: ad.title, ggmax_id: ad.ggmax_id, status: ad.status };

    const { error } = editingAd
      ? await supabase.from("ads").update(payload).eq("id", editingAd.id)
      : await supabase.from("ads").insert({ ...payload, user_id: user.id });

    setMsg(error ? error.message : editingAd ? "Anúncio atualizado." : "Anúncio criado.");
    setAd({ title: "", ggmax_id: "", status: "ativo" });
    setEditingAd(null);
    await refresh();
  }

  async function saveOpt() {
    if (!opt.ad_id || !opt.product_id) {
      setMsg("Selecione anúncio e produto.");
      return;
    }

    const payload = {
      ad_id: opt.ad_id,
      product_id: opt.product_id,
      label: opt.label,
      multiplier: Number(opt.multiplier),
      price: Number(opt.price)
    };

    const { error } = editingOpt
      ? await supabase.from("ad_options").update(payload).eq("id", editingOpt.id)
      : await supabase.from("ad_options").insert({ ...payload, user_id: user.id });

    setMsg(error ? error.message : editingOpt ? "Opção atualizada." : "Opção criada.");
    setOpt({ ad_id: "", product_id: "", label: "1x", multiplier: "1", price: "" });
    setEditingOpt(null);
    await refresh();
  }

  async function removeAd(a: Ad) {
    if (options.some((o: AdOption) => o.ad_id === a.id) || sales.some((s: Sale) => s.ad_id === a.id)) {
      setMsg("Anúncio possui vínculo.");
      return;
    }
    if (!confirm("Excluir anúncio?")) return;
    const { error } = await supabase.from("ads").delete().eq("id", a.id);
    setMsg(error ? error.message : "Anúncio excluído.");
    await refresh();
  }

  async function removeOpt(o: AdOption) {
    if (sales.some((s: Sale) => s.option_id === o.id)) {
      setMsg("Opção possui venda.");
      return;
    }
    if (!confirm("Excluir opção?")) return;
    const { error } = await supabase.from("ad_options").delete().eq("id", o.id);
    setMsg(error ? error.message : "Opção excluída.");
    await refresh();
  }

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold">{editingAd ? "Editar anúncio" : "Novo anúncio"}</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <Input placeholder="Título" value={ad.title} onChange={e => setAd({ ...ad, title: e.target.value })} />
            <Input placeholder="ID GGMAX" value={ad.ggmax_id} onChange={e => setAd({ ...ad, ggmax_id: e.target.value })} />
            <Select value={ad.status} onChange={e => setAd({ ...ad, status: e.target.value })}>
              <option value="ativo">Ativo</option>
              <option value="pausado">Pausado</option>
            </Select>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveAd}>Salvar anúncio</Button>
            {editingAd && <GhostButton onClick={() => { setEditingAd(null); setAd({ title: "", ggmax_id: "", status: "ativo" }); }}>Cancelar</GhostButton>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">{editingOpt ? "Editar opção" : "Nova opção"}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={opt.ad_id} onChange={e => setOpt({ ...opt, ad_id: e.target.value })}>
              <option value="">Anúncio</option>
              {ads.map((a: Ad) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </Select>
            <Select value={opt.product_id} onChange={e => setOpt({ ...opt, product_id: e.target.value })}>
              <option value="">Produto</option>
              {products.map((p: Product) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            <Input value={opt.label} onChange={e => setOpt({ ...opt, label: e.target.value })} placeholder="1x, 4x, 10x" />
            <Input type="number" value={opt.multiplier} onChange={e => setOpt({ ...opt, multiplier: e.target.value })} placeholder="Multiplicador" />
            <Input className="md:col-span-2" type="number" step="0.01" placeholder="Preço R$" value={opt.price} onChange={e => setOpt({ ...opt, price: e.target.value })} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={saveOpt}>Salvar opção</Button>
            {editingOpt && <GhostButton onClick={() => { setEditingOpt(null); setOpt({ ad_id: "", product_id: "", label: "1x", multiplier: "1", price: "" }); }}>Cancelar</GhostButton>}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-bold">Anúncios</h2>
        <Table headers={["Título", "ID", "Status", "Ações"]} rows={ads.map((a: Ad) => [
          a.title,
          a.ggmax_id || "-",
          <Badge key={a.id} tone={a.status === "ativo" ? "good" : "warn"}>{a.status || "ativo"}</Badge>,
          <Actions key={a.id} onEdit={() => { setEditingAd(a); setAd({ title: a.title, ggmax_id: a.ggmax_id || "", status: a.status || "ativo" }); }} onDelete={() => removeAd(a)} />
        ])} />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-bold">Opções</h2>
        <Table headers={["Anúncio", "Opção", "Produto", "Multiplicador", "Preço", "Ações"]} rows={options.map((o: AdOption) => [
          ads.find((a: Ad) => a.id === o.ad_id)?.title || "-",
          o.label,
          products.find((p: Product) => p.id === o.product_id)?.name || "-",
          `${o.multiplier} un.`,
          brl(o.price),
          <Actions key={o.id} onEdit={() => { setEditingOpt(o); setOpt({ ad_id: o.ad_id, product_id: o.product_id, label: o.label, multiplier: String(o.multiplier), price: String(o.price) }); }} onDelete={() => removeOpt(o)} />
        ])} />
      </Card>
    </>
  );
}

function Sales({ user, products, batches, ads, options, sales, refresh, setMsg }: any) {
  const [optionId, setOptionId] = useState("");

  async function makeSale() {
    const option = options.find((o: AdOption) => o.id === optionId);
    if (!option) return;

    try {
      await registerSale(option, option.multiplier, option.price, batches);
      setMsg("Venda registrada com FIFO.");
      await refresh();
    } catch (err: any) {
      setMsg(err.message);
    }
  }

  async function remove(sale: Sale) {
    if (!confirm("Excluir venda e reverter estoque?")) return;

    let qty = sale.quantity;
    const lots = batches
      .filter((b: Batch) => b.product_id === sale.product_id)
      .sort((a: Batch, b: Batch) => new Date(a.bought_at).getTime() - new Date(b.bought_at).getTime());

    for (const lot of lots) {
      if (qty <= 0) break;
      const capacity = lot.quantity - lot.remaining;
      const back = Math.min(qty, capacity);
      if (back > 0) {
        await supabase.from("batches").update({ remaining: lot.remaining + back }).eq("id", lot.id);
        qty -= back;
      }
    }

    const { error } = await supabase.from("sales").delete().eq("id", sale.id);
    setMsg(error ? error.message : "Venda revertida.");
    await refresh();
  }

  return (
    <>
      <Card>
        <h2 className="mb-4 text-lg font-bold">Registrar venda</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Select value={optionId} onChange={e => setOptionId(e.target.value)}>
            <option value="">Selecione a opção</option>
            {options.map((o: AdOption) => (
              <option key={o.id} value={o.id}>
                {ads.find((a: Ad) => a.id === o.ad_id)?.title} — {o.label} — {o.multiplier} un. — {brl(o.price)}
              </option>
            ))}
          </Select>
          <Button onClick={makeSale}>Registrar</Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-bold">Histórico</h2>
        <Table headers={["Data", "Produto", "Qtd", "Receita", "Custo", "Lucro", "Ações"]} rows={sales.map((s: Sale) => [
          dateBR(s.sold_at),
          products.find((p: Product) => p.id === s.product_id)?.name || "-",
          s.quantity,
          brl(s.revenue),
          brl(s.cost),
          <span key={s.id} className={s.profit >= 0 ? "text-cyan-200" : "text-red-300"}>{brl(s.profit)}</span>,
          <DangerButton key={s.id} onClick={() => remove(s)}><Trash2 className="h-4 w-4" /></DangerButton>
        ])} />
      </Card>
    </>
  );
}

function Finance({ stats, products, ads, sales }: any) {
  const byProduct = products.map((p: Product) => {
    const rows = sales.filter((s: Sale) => s.product_id === p.id);
    return {
      name: p.name,
      vendas: rows.length,
      receita: rows.reduce((a: number, s: Sale) => a + s.revenue, 0),
      lucro: rows.reduce((a: number, s: Sale) => a + s.profit, 0)
    };
  }).sort((a: any, b: any) => b.lucro - a.lucro);

  const byAd = ads.map((a: Ad) => {
    const rows = sales.filter((s: Sale) => s.ad_id === a.id);
    return {
      name: a.title,
      vendas: rows.length,
      receita: rows.reduce((x: number, s: Sale) => x + s.revenue, 0),
      lucro: rows.reduce((x: number, s: Sale) => x + s.profit, 0)
    };
  }).sort((a: any, b: any) => b.lucro - a.lucro);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Receita" value={brl(stats.revenue)} />
        <Stat title="Custo vendido" value={brl(stats.cost)} />
        <Stat title="Lucro" value={brl(stats.profit)} />
        <Stat title="Margem" value={pct(stats.margin)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Por produto</h2>
          <Table headers={["Produto", "Vendas", "Receita", "Lucro"]} rows={byProduct.map((p: any) => [p.name, p.vendas, brl(p.receita), brl(p.lucro)])} />
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-bold">Por anúncio</h2>
          <Table headers={["Anúncio", "Vendas", "Receita", "Lucro"]} rows={byAd.map((a: any) => [a.name, a.vendas, brl(a.receita), brl(a.lucro)])} />
        </Card>
      </div>
    </>
  );
}

function Backup({ stats, products, batches, ads, options, sales }: any) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const date = today();
  const names = {
    p: Object.fromEntries(products.map((p: Product) => [p.id, p.name])),
    a: Object.fromEntries(ads.map((a: Ad) => [a.id, a.title]))
  };

  function csvProducts() {
    downloadText(
      `produtos-${date}.csv`,
      toCsv(
        products.map((p: Product) => ({
          id: p.id,
          nome: p.name,
          categoria: p.category || "",
          fornecedor: p.supplier || "",
          obs: p.notes || ""
        }))
      ),
      "text/csv;charset=utf-8"
    );
  }

  function csvBatches() {
    downloadText(
      `lotes-${date}.csv`,
      toCsv(
        batches.map((b: Batch) => ({
          produto: names.p[b.product_id] || b.product_id,
          quantidade: b.quantity,
          restante: b.remaining,
          custo_unitario: b.unit_cost,
          data: b.bought_at
        }))
      ),
      "text/csv;charset=utf-8"
    );
  }

  function csvAds() {
    downloadText(
      `anuncios-opcoes-${date}.csv`,
      toCsv(
        options.map((o: AdOption) => ({
          anuncio: names.a[o.ad_id] || o.ad_id,
          produto: names.p[o.product_id] || o.product_id,
          opcao: o.label,
          multiplicador: o.multiplier,
          preco: o.price
        }))
      ),
      "text/csv;charset=utf-8"
    );
  }

  function csvSales() {
    downloadText(
      `vendas-${date}.csv`,
      toCsv(
        sales.map((s: Sale) => ({
          data: s.sold_at,
          produto: names.p[s.product_id || ""] || "",
          anuncio: names.a[s.ad_id || ""] || "",
          quantidade: s.quantity,
          receita: s.revenue,
          custo: s.cost,
          lucro: s.profit
        }))
      ),
      "text/csv;charset=utf-8"
    );
  }

  function jsonBackup() {
    downloadText(
      `backup-ggmax-${date}.json`,
      JSON.stringify({ products, batches, ads, options, sales }, null, 2),
      "application/json;charset=utf-8"
    );
  }

  return (
    <>
      <Card>
        <h2 className="text-2xl font-black">Backup e Exportação</h2>
        <p className="mt-2 text-blue-200/70">CSV, JSON e relatório PDF via impressão.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ExportCard title="Produtos CSV" onClick={csvProducts} />
        <ExportCard title="Lotes CSV" onClick={csvBatches} />
        <ExportCard title="Anúncios CSV" onClick={csvAds} />
        <ExportCard title="Vendas CSV" onClick={csvSales} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><h3 className="font-bold">Backup JSON</h3><p className="my-3 text-sm text-blue-200/60">Cópia completa.</p><Button onClick={jsonBackup}><FileJson className="mr-2 h-4 w-4" />Baixar</Button></Card>
        <Card><h3 className="font-bold">Restaurar JSON</h3><p className="my-3 text-sm text-blue-200/60">Use como arquivo de segurança.</p><input ref={fileRef} type="file" className="hidden" /><GhostButton onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Selecionar</GhostButton></Card>
        <Card><h3 className="font-bold">Relatório PDF</h3><p className="my-3 text-sm text-blue-200/60">Imprimir → salvar PDF.</p><Button onClick={() => window.print()}><FileText className="mr-2 h-4 w-4" />Imprimir</Button></Card>
      </div>

      <Card>
        <h2 className="mb-4 text-lg font-bold">Relatório</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Stat title="Receita" value={brl(stats.revenue)} />
          <Stat title="Custo" value={brl(stats.cost)} />
          <Stat title="Lucro" value={brl(stats.profit)} />
          <Stat title="Margem" value={pct(stats.margin)} />
        </div>
      </Card>
    </>
  );
}

function ExportCard({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <Card>
      <h3 className="font-bold">{title}</h3>
      <p className="my-3 text-sm text-blue-200/60">Baixar arquivo.</p>
      <Button onClick={onClick}><Download className="mr-2 h-4 w-4" />Baixar</Button>
    </Card>
  );
}

function Importer({ user, products, batches, ads, options, refresh, setMsg }: any) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<any[]>([]);

  function analyze() {
    const parsed = parseManual(text).map((item: any) => ({
      ...item,
      option: findOption(item, options, ads, products)
    }));
    setItems(parsed);
  }

  async function importAll() {
    let ok = 0;

    for (const item of items.filter((x: any) => x.option)) {
      try {
        await registerSale(item.option, item.quantity, item.revenue, batches);
        ok++;
      } catch (err: any) {
        setMsg(err.message);
        await refresh();
        return;
      }
    }

    setMsg(`${ok} venda(s) importada(s).`);
    setItems([]);
    setText("");
    await refresh();
  }

  return (
    <>
      <Card>
        <h2 className="text-2xl font-black">Importador GGMAX</h2>
        <p className="mt-2 text-blue-200/70">Cole linhas de vendas. O sistema detecta primeiro 1x/4x/10x como quantidade e ignora 1500x do nome.</p>
      </Card>

      <Card>
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Ex: 4x Trait Reroll - 1500x LINEAGE PIECE | R$ 8,00"
        />
        <div className="mt-4 flex gap-2">
          <Button onClick={analyze}>Analisar</Button>
          <Button onClick={importAll}>Importar compatíveis</Button>
          <GhostButton onClick={() => { setText(""); setItems([]); }}>Limpar</GhostButton>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-bold">Prévia</h2>
        <Table headers={["Texto", "Qtd", "Valor", "Opção encontrada"]} rows={items.map((item: any) => [
          item.name,
          item.quantity,
          brl(item.revenue),
          item.option ? `${ads.find((a: Ad) => a.id === item.option.ad_id)?.title} / ${item.option.label}` : <Badge key="x" tone="bad">Sem opção</Badge>
        ])} />
      </Card>
    </>
  );
}

function Actions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <GhostButton onClick={onEdit}><Pencil className="h-4 w-4" /></GhostButton>
      <DangerButton onClick={onDelete}><Trash2 className="h-4 w-4" /></DangerButton>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-blue-900/70 text-left text-blue-200/70">
            {headers.map(h => <th key={h} className="p-3 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, i) => (
            <tr key={i} className="border-b border-blue-900/40 hover:bg-blue-500/[.04]">
              {row.map((cell, j) => <td key={j} className="p-3 align-middle">{cell}</td>)}
            </tr>
          )) : (
            <tr><td className="p-5 text-blue-200/50" colSpan={headers.length}>Nada cadastrado ainda.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
