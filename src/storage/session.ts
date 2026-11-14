import type { LayoutShape } from "../domain/layout";
import type { KitchenSketch } from "../domain/schema";

/**
 * Conversation state machine, persisted per chat in Workers KV (functions are stateless):
 *
 *   idle ──photo──▶ analyzing ──ok──▶ plan_review ──confirm──▶ layout_review ──finish──▶ done
 *                       │                  │  ▲ text edits /         │  ▲
 *                       └──error──▶ idle   └──┘ re-analysis          └──┘ change shape
 */
export type Stage = "idle" | "analyzing" | "plan_review" | "layout_review" | "done";

export interface Session {
  stage: Stage;
  fileId?: string;
  sketch?: KitchenSketch;
  shape?: LayoutShape;
  updatedAt: number;
}

const DEFAULT_TTL = 7 * 24 * 3600;

export class SessionStore {
  constructor(
    private readonly kv: KVNamespace,
    private readonly ttlSeconds = DEFAULT_TTL,
  ) {}

  async get(chatId: number): Promise<Session> {
    return (await this.kv.get<Session>(`session:${chatId}`, "json")) ?? { stage: "idle", updatedAt: Date.now() };
  }

  async put(chatId: number, session: Session): Promise<void> {
    session.updatedAt = Date.now();
    await this.kv.put(`session:${chatId}`, JSON.stringify(session), { expirationTtl: this.ttlSeconds });
  }

  async reset(chatId: number): Promise<void> {
    await this.kv.delete(`session:${chatId}`);
  }

  /** Stores a rendered drawing and returns its public id (served at GET /view/:id). */
  async putDrawing(svg: string): Promise<string> {
    const id = crypto.randomUUID().replace(/-/g, "");
    await this.kv.put(`drawing:${id}`, svg, { expirationTtl: this.ttlSeconds });
    return id;
  }

  getDrawing(id: string): Promise<string | null> {
    return this.kv.get(`drawing:${id}`, "text");
  }
}
