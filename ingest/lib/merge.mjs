// seen: "id:মিনিট(base36) id:মিনিট ..." — এক স্ট্রিং, যাতে Firestore ইনডেক্স এন্ট্রি না বাড়ে
export function parseSeen(str) {
  const m = new Map();
  for (const part of String(str || "").split(" ")) {
    if (!part) continue;
    const [id, t] = part.split(":");
    const min = parseInt(t, 36);
    if (id && !Number.isNaN(min)) m.set(id, min * 60000);
  }
  return m;
}

export function serializeSeen(map, cap = 15000) {
  let entries = [...map];
  if (entries.length > cap) entries = entries.sort((a, b) => b[1] - a[1]).slice(0, cap);
  return entries.map(([id, ms]) => `${id}:${Math.floor(ms / 60000).toString(36)}`).join(" ");
}

export function pruneSeen(map, cutoffMs) {
  let n = 0;
  for (const [id, ms] of map) {
    if (ms < cutoffMs) { map.delete(id); n++; }
  }
  return n;
}

// existing: আগে থেকে সেভ থাকা (publishedAt অনুযায়ী নতুন→পুরনো), incoming: নতুন আইটেম
export function mergeSnapshot(existing, incoming, { cap, cutoffMs }) {
  const byId = new Map();
  for (const it of existing) byId.set(it.id, it);
  for (const it of incoming) if (!byId.has(it.id)) byId.set(it.id, it);
  const items = [...byId.values()]
    .filter((i) => i.publishedAt >= cutoffMs)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, cap);
  const same = items.length === existing.length && items.every((it, i) => it.id === existing[i].id);
  return { items, changed: !same };
}
