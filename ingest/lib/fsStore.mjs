// খবরের ডেটা ফাইল হিসেবে রাখে: <dir>/meta.json এবং <dir>/feeds/<id>.json
// GitHub Actions এ <dir> হলো `data` ব্রাঞ্চের চেকআউট; শেষে ওয়ার্কফ্লো সেটি পুশ করে।
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export function createFsStore(dir) {
  const feedsDir = path.join(dir, "feeds");

  async function readJson(file) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT" || e instanceof SyntaxError) return null; // নেই বা নষ্ট ফাইল = শুরু থেকে
      throw e;
    }
  }

  return {
    async loadMeta() {
      return (await readJson(path.join(dir, "meta.json"))) ?? {};
    },
    async saveMeta(meta) {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
    },
    // ids → Map(id → items[])
    async loadSnapshots(ids) {
      const out = new Map();
      for (const id of ids) {
        const d = await readJson(path.join(feedsDir, `${id}.json`));
        out.set(id, Array.isArray(d?.items) ? d.items : []);
      }
      return out;
    },
    // Map(id → { items, updatedAt })
    async saveSnapshots(map) {
      await mkdir(feedsDir, { recursive: true });
      for (const [id, data] of map) await writeFile(path.join(feedsDir, `${id}.json`), JSON.stringify(data));
    },
    // সব স্ন্যাপশট মোছে; মোছা ফাইলের সংখ্যা ফেরত দেয়
    async wipe() {
      let n = 0;
      try {
        for (const f of await readdir(feedsDir)) {
          await rm(path.join(feedsDir, f));
          n++;
        }
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      return n;
    },
  };
}
