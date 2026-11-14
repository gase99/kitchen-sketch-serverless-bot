import sample from "../examples/sample-sketch.json";
import { normalizeSketch, type KitchenSketch } from "../src/domain/schema";

export const sampleSketch = (): KitchenSketch => normalizeSketch(structuredClone(sample));

/** In-memory stand-in for a Workers KV namespace (only the methods the bot uses). */
export class FakeKV {
  store = new Map<string, string>();
  async get(key: string, type?: "text" | "json") {
    const v = this.store.get(key);
    if (v === undefined) return null;
    return type === "json" ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.store.set(key, value);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
}
