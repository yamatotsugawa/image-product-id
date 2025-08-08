export type MockItem = {
  title: string;
  jan?: string;
  upc?: string;
  model?: string;
  official_release?: string; // YYYY-MM-DD
  official_msrp?: number;    // 税抜/税込は用途に合わせて
  currency?: string;
};

const ITEMS: MockItem[] = [
  {
    title: "Nintendo Switch (有機ELモデル) ホワイト",
    jan: "4902370548495",
    model: "HEG-S-KAAAA",
    official_release: "2021-10-08",
    official_msrp: 37980,
    currency: "JPY",
  },
  {
    title: "PlayStation 5 (CFI-1200A01)",
    jan: "4948872415598",
    model: "CFI-1200A01",
    official_release: "2022-09-15",
    official_msrp: 60478,
    currency: "JPY",
  },
  {
    title: "Apple AirPods Pro (第2世代 USB‑C)",
    jan: "4549995402166",
    model: "A2968",
    official_release: "2023-09-22",
    official_msrp: 39800,
    currency: "JPY",
  },
];

export function mockLookup(q: { jan?: string; upc?: string; name?: string; model?: string }) {
  const norm = (s?: string) => (s || "").replace(/\D/g, "").trim().toLowerCase();
  const byJan = ITEMS.find((it) => norm(it.jan) && norm(it.jan) === norm(q.jan));
  if (byJan) return byJan;
  const byUpc = ITEMS.find((it) => norm(it.upc) && norm(it.upc) === norm(q.upc));
  if (byUpc) return byUpc;
  if (q.model) {
    const m = q.model.toLowerCase();
    const byModel = ITEMS.find((it) => it.model?.toLowerCase() === m);
    if (byModel) return byModel;
  }
  if (q.name) {
    const n = q.name.toLowerCase();
    const byName = ITEMS.find((it) => n.includes(it.title.toLowerCase().split(" ")[0]));
    if (byName) return byName;
  }
  return null;
}
