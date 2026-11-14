import type { KitchenSketch } from "../domain/schema";

export interface VisionInput {
  image: Uint8Array;
  mime: string;
  /** Previous extraction, when the user asks for a correction. */
  previous?: KitchenSketch;
  /** Free-text correction from the user. */
  correction?: string;
}

export interface VisionProvider {
  readonly name: string;
  /** Returns the raw JSON produced by the model; validate with normalizeSketch(). */
  extract(input: VisionInput): Promise<unknown>;
}
