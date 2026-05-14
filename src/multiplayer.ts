import type { PlayerConfig } from "./types";

export type RoomStatus = "lobby" | "racing" | "complete";

export interface RoomPlayer extends PlayerConfig {
  ready: boolean;
  joinedAt: number;
}

export interface MultiplayerRoom {
  code: string;
  hostId: string;
  status: RoomStatus;
  players: Record<string, RoomPlayer>;
  createdAt: number;
  updatedAt: number;
  trackId?: string;
  seed?: number;
  startedAt?: number;
}

type RoomPatch = Partial<Omit<MultiplayerRoom, "code">>;
type PlayerPatch = Partial<RoomPlayer>;

interface RoomStore {
  readonly online: boolean;
  createRoom(room: MultiplayerRoom): Promise<void>;
  getRoom(code: string): Promise<MultiplayerRoom | undefined>;
  listRooms(): Promise<MultiplayerRoom[]>;
  updateRoom(code: string, patch: RoomPatch): Promise<void>;
  updatePlayer(code: string, playerId: string, patch: PlayerPatch): Promise<void>;
  removePlayer(code: string, playerId: string): Promise<void>;
  subscribe(code: string, onRoom: (room: MultiplayerRoom | undefined) => void): () => void;
}

const firebaseDatabaseUrl = (import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined)?.replace(/\/$/, "");
const localStorageKey = "jdm-coffee-drift.rooms";

export function getClientId(): string {
  const key = "jdm-coffee-drift.client-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export function createRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function sortRoomPlayers(room: MultiplayerRoom): RoomPlayer[] {
  return Object.values(room.players ?? {}).sort((a, b) => a.joinedAt - b.joinedAt);
}

class FirebaseRoomStore implements RoomStore {
  readonly online = true;

  constructor(private readonly databaseUrl: string) {}

  async createRoom(room: MultiplayerRoom): Promise<void> {
    await this.request(`rooms/${room.code}`, {
      method: "PUT",
      body: JSON.stringify(room)
    });
  }

  async getRoom(code: string): Promise<MultiplayerRoom | undefined> {
    return ((await this.request(`rooms/${normalizeRoomCode(code)}`)) as MultiplayerRoom | null) ?? undefined;
  }

  async listRooms(): Promise<MultiplayerRoom[]> {
    const data = (await this.request("rooms")) as Record<string, MultiplayerRoom> | null;
    return Object.values(data ?? {})
      .filter((room) => room.status === "lobby")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  }

  async updateRoom(code: string, patch: RoomPatch): Promise<void> {
    await this.request(`rooms/${normalizeRoomCode(code)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, updatedAt: Date.now() })
    });
  }

  async updatePlayer(code: string, playerId: string, patch: PlayerPatch): Promise<void> {
    await this.request(`rooms/${normalizeRoomCode(code)}/players/${playerId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    await this.updateRoom(code, {});
  }

  async removePlayer(code: string, playerId: string): Promise<void> {
    await this.request(`rooms/${normalizeRoomCode(code)}/players/${playerId}`, {
      method: "DELETE"
    });
    await this.updateRoom(code, {});
  }

  subscribe(code: string, onRoom: (room: MultiplayerRoom | undefined) => void): () => void {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        onRoom(await this.getRoom(code));
      } catch (error) {
        console.error(error);
      }
    };
    void poll();
    const interval = window.setInterval(poll, 1200);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.databaseUrl}/${path}.json`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers
      }
    });
    if (!response.ok) {
      throw new Error(`Room store request failed: ${response.status}`);
    }
    return response.status === 204 ? undefined : response.json();
  }
}

class LocalRoomStore implements RoomStore {
  readonly online = false;

  async createRoom(room: MultiplayerRoom): Promise<void> {
    this.write({ ...this.read(), [room.code]: room });
  }

  async getRoom(code: string): Promise<MultiplayerRoom | undefined> {
    return this.read()[normalizeRoomCode(code)];
  }

  async listRooms(): Promise<MultiplayerRoom[]> {
    return Object.values(this.read())
      .filter((room) => room.status === "lobby")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);
  }

  async updateRoom(code: string, patch: RoomPatch): Promise<void> {
    const rooms = this.read();
    const room = rooms[normalizeRoomCode(code)];
    if (!room) return;
    rooms[room.code] = { ...room, ...patch, updatedAt: Date.now() };
    this.write(rooms);
  }

  async updatePlayer(code: string, playerId: string, patch: PlayerPatch): Promise<void> {
    const rooms = this.read();
    const room = rooms[normalizeRoomCode(code)];
    if (!room) return;
    rooms[room.code] = {
      ...room,
      updatedAt: Date.now(),
      players: {
        ...room.players,
        [playerId]: {
          ...room.players[playerId],
          ...patch
        }
      }
    };
    this.write(rooms);
  }

  async removePlayer(code: string, playerId: string): Promise<void> {
    const rooms = this.read();
    const room = rooms[normalizeRoomCode(code)];
    if (!room) return;
    const players = { ...room.players };
    delete players[playerId];
    rooms[room.code] = { ...room, players, updatedAt: Date.now() };
    this.write(rooms);
  }

  subscribe(code: string, onRoom: (room: MultiplayerRoom | undefined) => void): () => void {
    let active = true;
    const poll = async () => {
      if (active) onRoom(await this.getRoom(code));
    };
    void poll();
    const interval = window.setInterval(poll, 700);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }

  private read(): Record<string, MultiplayerRoom> {
    const raw = window.localStorage.getItem(localStorageKey);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, MultiplayerRoom>;
    } catch {
      return {};
    }
  }

  private write(rooms: Record<string, MultiplayerRoom>): void {
    window.localStorage.setItem(localStorageKey, JSON.stringify(rooms));
  }
}

function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export const roomStore: RoomStore = firebaseDatabaseUrl ? new FirebaseRoomStore(firebaseDatabaseUrl) : new LocalRoomStore();
export const roomBackendLabel = roomStore.online ? "ONLINE" : "LOCAL TEST";
