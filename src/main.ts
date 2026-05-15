import Phaser from "phaser";
import "./styles.css";
import { cars, getCar } from "./data/cars";
import { tracks } from "./data/tracks";
import { RaceScene } from "./scenes/RaceScene";
import type { LeaderboardEntry, PlayerConfig, RaceResult, RaceSetup, RaceSnapshot, RaceViewportCar } from "./types";
import { createRaceSeed, Rng } from "./gameplay/rng";
import {
  createRoomCode,
  getClientId,
  roomBackendLabel,
  roomStore,
  sortRoomPlayers,
  type MultiplayerRoom,
  type RoomPlayer
} from "./multiplayer";

type Screen = "title" | "setup" | "room-list" | "lobby" | "race" | "results";

interface DraftState {
  screen: Screen;
  players: PlayerConfig[];
  lastSetup?: RaceSetup;
  room?: MultiplayerRoom;
  isRoomHost?: boolean;
}

const uiRootElement = document.querySelector<HTMLDivElement>("#ui-root");
const phaserRootElement = document.querySelector<HTMLDivElement>("#phaser-root");

if (!uiRootElement || !phaserRootElement) {
  throw new Error("Game root elements are missing.");
}

const uiRoot = uiRootElement;
const phaserRoot = phaserRootElement;

const state: DraftState = {
  screen: "title",
  players: createDefaultPlayers(4)
};

let latestSnapshot: RaceSnapshot | undefined;
let latestResults: RaceResult[] = [];
const clientId = getClientId();
let unsubscribeRoom: (() => void) | undefined;
let roomRaceSignature = "";
let roomCompleteSignature = "";
let lobbyRenderSignature = "";
let pendingLobbyRoom: MultiplayerRoom | undefined;
let nameUpdateTimer: number | undefined;
let nameUpdatePromise: Promise<void> | undefined;
let resultRenderSignature = "";
let resultRenderTimer: number | undefined;

const game = new Phaser.Game({
  type: Phaser.CANVAS,
  parent: "phaser-root",
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#111820",
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: "arcade"
  },
  scene: []
});

game.scene.add("RaceScene", RaceScene, false);
phaserRoot.classList.add("is-hidden");

renderTitle();
bindGlobalEvents();

function createDefaultPlayers(count: number): PlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `드라이버 ${index + 1}`,
    carId: cars[index % cars.length].id
  }));
}

function bindGlobalEvents(): void {
  uiRoot.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "start-title") {
      clearRoomSession();
      renderSetup();
    }
    if (action === "create-room") void createRoom();
    if (action === "show-room-list") void renderRoomList();
    if (action === "refresh-rooms") void renderRoomList();
    if (action === "join-room") {
      const code = target.closest<HTMLElement>("[data-room-code]")?.dataset.roomCode;
      if (code) void joinRoom(code);
    }
    if (action === "join-room-code") {
      const input = document.querySelector<HTMLInputElement>("#join-code-input");
      if (input?.value) void joinRoom(input.value);
    }
    if (action === "leave-room") void leaveRoom();
    if (action === "toggle-ready") void toggleReady();
    if (action === "start-room-race") void startRoomRace();
    if (action === "count-minus") setPlayerCount(Math.max(2, state.players.length - 1));
    if (action === "count-plus") setPlayerCount(Math.min(8, state.players.length + 1));
    if (action === "randomize-cars") randomizeCars();
    if (action === "start-race") startRace();
    if (action === "back-title") {
      clearRoomSession();
      renderTitle();
    }
    if (action === "rematch") startRace(state.lastSetup?.trackId);
    if (action === "new-setup") renderSetup();
  });

  uiRoot.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.dataset.roomPlayerName) {
      scheduleRoomNameUpdate(input.value);
      return;
    }
    const index = Number(input.dataset.playerName);
    if (Number.isInteger(index) && state.players[index]) {
      state.players[index].name = input.value;
    }
  });

  uiRoot.addEventListener("change", (event) => {
    const select = event.target as HTMLSelectElement;
    if (select.dataset.roomCarSelect) {
      void updateLocalRoomPlayer({ carId: select.value, ready: false });
      if (state.room) renderLobby(state.room, { preserveScroll: true });
      return;
    }
    const index = Number(select.dataset.carSelect);
    if (Number.isInteger(index) && state.players[index]) {
      state.players[index].carId = select.value;
      renderSetup();
    }
  });

  uiRoot.addEventListener("focusout", () => {
    void flushRoomNameUpdate().finally(() => {
      window.setTimeout(flushPendingLobbyRender, 80);
    });
  });

  window.addEventListener("jdm:race-update", (event) => {
    latestSnapshot = (event as CustomEvent<RaceSnapshot>).detail;
    updateRaceHud(latestSnapshot);
  });

  window.addEventListener("jdm:race-complete", (event) => {
    latestResults = (event as CustomEvent<RaceResult[]>).detail;
    if (state.room?.status === "racing") {
      if (state.isRoomHost) void publishRoomResults(latestResults);
      return;
    }
    scheduleRenderResults(latestResults);
  });
}

function setPlayerCount(count: number): void {
  const next = [...state.players];
  while (next.length < count) {
    const index = next.length;
    next.push({
      id: `player-${index + 1}`,
      name: `드라이버 ${index + 1}`,
      carId: cars[index % cars.length].id
    });
  }
  state.players = next.slice(0, count);
  renderSetup();
}

function randomizeCars(): void {
  const seed = createRaceSeed(state.players.map((player) => player.name));
  const rng = new Rng(seed);
  state.players = state.players.map((player) => ({
    ...player,
    carId: cars[rng.int(0, cars.length - 1)].id
  }));
  renderSetup();
}

function renderTitle(): void {
  state.screen = "title";
  game.scene.stop("RaceScene");
  phaserRoot.classList.add("is-hidden");
  latestSnapshot = undefined;

  uiRoot.innerHTML = `
    <main class="screen screen--title">
      <section class="title-stage">
        <div class="title-panel">
          <p class="eyebrow">AI DRIFT BROADCAST · COFFEE BET</p>
          <h1><span>JDM</span> Coffee Drift</h1>
          <p class="title-copy">팀원 이름과 차량만 고르면 AI가 산길 공도에서 알아서 드리프트 배틀을 펼칩니다. 꼴찌는 커피 담당.</p>
          <div class="title-actions">
            <button class="primary-button" data-action="create-room">레이스 개설</button>
            <button class="secondary-button" data-action="show-room-list">레이스 참가</button>
            <button class="ghost-button" data-action="start-title">로컬 게임</button>
          </div>
        </div>
        <div class="title-race-card" aria-hidden="true">
          <div class="title-race-card__skyline"></div>
          <div class="title-race-card__track">
            <i class="title-pixel-car title-pixel-car--lead"></i>
            <i class="title-pixel-car title-pixel-car--chase"></i>
            <i class="title-pixel-car title-pixel-car--tail"></i>
          </div>
          <div class="title-race-card__hud">
            <span>LAP 5/5</span>
            <strong>COFFEE MOMENT</strong>
          </div>
        </div>
      </section>
      <section class="title-strip" aria-label="race mood">
        <span>TOUGE</span>
        <span>HAIRPIN</span>
        <span>SP TURBO</span>
        <span>BROADCAST CAM</span>
      </section>
    </main>
  `;
}

async function createRoom(): Promise<void> {
  clearRoomSession();
  const code = createRoomCode();
  const now = Date.now();
  const host: RoomPlayer = {
    id: clientId,
    name: normalizeName(state.players[0]?.name ?? "", 0),
    carId: state.players[0]?.carId ?? cars[0].id,
    ready: false,
    joinedAt: now
  };
  const room: MultiplayerRoom = {
    code,
    hostId: clientId,
    status: "lobby",
    players: { [clientId]: host },
    createdAt: now,
    updatedAt: now
  };

  await roomStore.createRoom(room);
  state.room = room;
  state.isRoomHost = true;
  subscribeToRoom(code);
  renderLobby(room);
}

async function renderRoomList(): Promise<void> {
  clearRoomSession();
  state.screen = "room-list";
  phaserRoot.classList.add("is-hidden");
  game.scene.stop("RaceScene");

  const rooms = await roomStore.listRooms();
  uiRoot.innerHTML = `
    <main class="screen screen--setup">
      <header class="setup-header">
        <div>
          <p class="eyebrow">MULTIPLAYER · ${roomBackendLabel}</p>
          <h1>레이스 참가</h1>
        </div>
        <button class="ghost-button" data-action="back-title">타이틀</button>
      </header>
      <section class="room-panel">
        <div class="join-code-row">
          <input id="join-code-input" maxlength="8" placeholder="방 코드 입력" aria-label="방 코드 입력" />
          <button class="primary-button" data-action="join-room-code">코드로 참가</button>
          <button class="secondary-button" data-action="refresh-rooms">새로고침</button>
        </div>
      </section>
      <section class="room-list">
        ${rooms.length > 0 ? rooms.map(renderRoomListItem).join("") : `<article class="room-card"><strong>열린 방이 없습니다.</strong><p>방장이 레이스를 개설하면 여기에 표시됩니다. Firebase 설정 전에는 같은 브라우저의 로컬 테스트 방만 보입니다.</p></article>`}
      </section>
    </main>
  `;
}

function renderRoomListItem(room: MultiplayerRoom): string {
  const players = sortRoomPlayers(room);
  const readyCount = players.filter((player) => player.ready).length;
  return `
    <article class="room-card" data-room-code="${room.code}">
      <div>
        <p class="eyebrow">ROOM ${room.code}</p>
        <strong>${players.length}/8 참가 · ${readyCount} ready</strong>
        <p>${players.map((player) => escapeHtml(player.name)).join(", ")}</p>
      </div>
      <button class="primary-button" data-action="join-room">입장</button>
    </article>
  `;
}

async function joinRoom(rawCode: string): Promise<void> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const room = await roomStore.getRoom(code);
  if (!room || room.status !== "lobby") {
    window.alert("입장 가능한 방을 찾지 못했습니다.");
    return;
  }

  const players = sortRoomPlayers(room);
  const existing = room.players[clientId];
  if (!existing && players.length >= 8) {
    window.alert("방이 가득 찼습니다.");
    return;
  }

  const joinedAt = existing?.joinedAt ?? Date.now();
  const player: RoomPlayer = {
    id: clientId,
    name: existing?.name ?? normalizeName(state.players[0]?.name ?? "", players.length),
    carId: existing?.carId ?? cars[players.length % cars.length].id,
    ready: existing?.ready ?? false,
    joinedAt
  };

  await roomStore.updatePlayer(code, clientId, player);
  const nextRoom = await roomStore.getRoom(code);
  if (!nextRoom) return;
  state.room = nextRoom;
  state.isRoomHost = nextRoom.hostId === clientId;
  subscribeToRoom(code);
  renderLobby(nextRoom);
}

function subscribeToRoom(code: string): void {
  unsubscribeRoom?.();
  roomRaceSignature = "";
  roomCompleteSignature = "";
  lobbyRenderSignature = "";
  pendingLobbyRoom = undefined;
  unsubscribeRoom = roomStore.subscribe(code, (room) => {
    if (!room) {
      clearRoomSession(false);
      renderTitle();
      return;
    }
    state.room = room;
    state.isRoomHost = room.hostId === clientId;
    if (room.status === "complete" && room.results?.length) {
      const signature = `${room.code}:${room.completedAt ?? room.updatedAt}:${getResultsSignature(room.results)}`;
      if (signature !== roomCompleteSignature) {
        roomCompleteSignature = signature;
        scheduleRenderResults(room.results);
        unsubscribeRoom?.();
        unsubscribeRoom = undefined;
      }
      return;
    }
    if (room.status === "racing" && room.trackId && room.seed) {
      const signature = `${room.code}:${room.seed}:${room.trackId}:${room.startedAt ?? 0}`;
      if (signature !== roomRaceSignature) {
        roomRaceSignature = signature;
        const players = sortRoomPlayers(room).map(({ ready: _ready, joinedAt: _joinedAt, ...player }) => player);
        startRace(room.trackId, players, room.seed);
      }
      return;
    }
    if (state.screen === "lobby") scheduleLobbyRender(room);
  });
}

function scheduleLobbyRender(room: MultiplayerRoom): void {
  const nextSignature = getLobbyRenderSignature(room);
  if (nextSignature === lobbyRenderSignature) return;
  if (isEditingLobbyControl()) {
    pendingLobbyRoom = room;
    return;
  }
  renderLobby(room, { preserveScroll: true });
}

function flushPendingLobbyRender(): void {
  if (!pendingLobbyRoom || isEditingLobbyControl() || state.screen !== "lobby") return;
  const room = pendingLobbyRoom;
  pendingLobbyRoom = undefined;
  renderLobby(room, { preserveScroll: true });
}

function getLobbyRenderSignature(room: MultiplayerRoom): string {
  const players = sortRoomPlayers(room).map((player) => ({
    id: player.id,
    name: player.name,
    carId: player.carId,
    ready: player.ready,
    joinedAt: player.joinedAt
  }));
  return JSON.stringify({
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    players
  });
}

function isEditingLobbyControl(): boolean {
  const active = document.activeElement as HTMLElement | null;
  return Boolean(active?.matches("[data-room-player-name], [data-room-car-select]"));
}

function renderLobby(room: MultiplayerRoom, options: { preserveScroll?: boolean } = {}): void {
  state.screen = "lobby";
  phaserRoot.classList.add("is-hidden");
  game.scene.stop("RaceScene");
  const previousScrollTop = options.preserveScroll
    ? document.querySelector<HTMLElement>(".screen")?.scrollTop ?? window.scrollY
    : 0;
  const players = sortRoomPlayers(room);
  const currentPlayer = room.players[clientId];
  const allReady = players.length >= 2 && players.every((player) => player.ready);
  const canStart = state.isRoomHost && allReady;

  uiRoot.innerHTML = `
    <main class="screen screen--setup">
      <header class="setup-header">
        <div>
          <p class="eyebrow">ROOM ${room.code} · ${roomBackendLabel}</p>
          <h1>레이스 대기실</h1>
        </div>
        <div class="room-code-card">
          <span>ROOM CODE</span>
          <strong>${room.code}</strong>
        </div>
      </header>
      <section class="room-panel">
        <p>${state.isRoomHost ? "방장입니다. 모든 참가자가 준비하면 레이스를 시작할 수 있습니다." : "이름과 차량을 고른 뒤 준비 버튼을 눌러주세요."}</p>
        <div class="lobby-actions">
          <button class="ghost-button" data-action="leave-room">나가기</button>
          ${state.isRoomHost ? `<button class="primary-button" data-action="start-room-race" ${canStart ? "" : "disabled"}>레이스 시작</button>` : ""}
        </div>
      </section>
      <section class="setup-grid lobby-grid">
        ${players.map((player, index) => renderLobbyPlayer(player, index, player.id === clientId, room.hostId === player.id)).join("")}
      </section>
      ${currentPlayer ? `<footer class="setup-footer"><button class="${currentPlayer.ready ? "secondary-button" : "primary-button"}" data-action="toggle-ready">${currentPlayer.ready ? "준비 취소" : "준비 완료"}</button></footer>` : ""}
    </main>
  `;
  lobbyRenderSignature = getLobbyRenderSignature(room);
  pendingLobbyRoom = undefined;
  if (options.preserveScroll) {
    const screen = document.querySelector<HTMLElement>(".screen");
    if (screen) screen.scrollTop = previousScrollTop;
    window.scrollTo({ top: previousScrollTop });
  }
}

function renderLobbyPlayer(player: RoomPlayer, index: number, editable: boolean, isHost: boolean): string {
  const car = getCar(player.carId);
  return `
    <article class="entrant-card lobby-card ${player.ready ? "is-ready" : ""}">
      <div class="entrant-card__top">
        <span class="entrant-number">${index + 1}</span>
        ${editable ? `<input data-room-player-name="true" value="${escapeHtml(player.name)}" maxlength="14" aria-label="내 이름" />` : `<strong>${escapeHtml(player.name)}</strong>`}
      </div>
      <div class="car-preview car-preview--${car.bodyType}">
        <img src="${car.sprite}" alt="${escapeHtml(car.name)}" loading="lazy" />
      </div>
      ${editable ? `
        <label class="select-label">
          <span>차량</span>
          <select data-room-car-select="true">
            ${cars.map((candidate) => `<option value="${candidate.id}" ${candidate.id === car.id ? "selected" : ""}>${candidate.name}</option>`).join("")}
          </select>
        </label>
      ` : `
        <div class="select-label select-label--readonly">
          <span>차량</span>
          <strong>${escapeHtml(car.name)}</strong>
        </div>
      `}
      ${renderVehicleDetails(car)}
      <p class="ready-badge">${isHost ? "HOST" : "GUEST"} · ${player.ready ? "READY" : "WAIT"}</p>
    </article>
  `;
}

function scheduleRoomNameUpdate(name: string): void {
  if (nameUpdateTimer !== undefined) window.clearTimeout(nameUpdateTimer);
  if (state.room?.players[clientId]) {
    state.room = {
      ...state.room,
      players: {
        ...state.room.players,
        [clientId]: {
          ...state.room.players[clientId],
          name,
          ready: false
        }
      }
    };
  }
  nameUpdateTimer = window.setTimeout(() => {
    nameUpdateTimer = undefined;
    void trackNameUpdate(updateLocalRoomPlayer({ name, ready: false }));
  }, 450);
}

async function flushRoomNameUpdate(): Promise<void> {
  if (nameUpdateTimer === undefined) {
    if (nameUpdatePromise) await nameUpdatePromise;
    return;
  }
  const input = document.querySelector<HTMLInputElement>("[data-room-player-name]");
  if (!input) {
    window.clearTimeout(nameUpdateTimer);
    nameUpdateTimer = undefined;
    if (nameUpdatePromise) await nameUpdatePromise;
    return;
  }
  window.clearTimeout(nameUpdateTimer);
  nameUpdateTimer = undefined;
  await trackNameUpdate(updateLocalRoomPlayer({ name: input.value, ready: false }));
}

function trackNameUpdate(promise: Promise<void>): Promise<void> {
  let tracked: Promise<void>;
  tracked = promise.finally(() => {
    if (nameUpdatePromise === tracked) nameUpdatePromise = undefined;
  });
  nameUpdatePromise = tracked;
  return tracked;
}

async function updateLocalRoomPlayer(patch: Partial<RoomPlayer>): Promise<void> {
  if (!state.room) return;
  const currentPlayer = state.room.players[clientId] ?? {
    id: clientId,
    name: normalizeName("", 0),
    carId: cars[0].id,
    ready: false,
    joinedAt: Date.now()
  };
  const nextPlayer: RoomPlayer = {
    ...currentPlayer,
    ...patch,
    id: clientId,
    joinedAt: currentPlayer?.joinedAt ?? Date.now()
  };
  state.room = {
    ...state.room,
    players: {
      ...state.room.players,
      [clientId]: nextPlayer
    }
  };
  await roomStore.updatePlayer(state.room.code, clientId, nextPlayer);
}

async function toggleReady(): Promise<void> {
  if (!state.room) return;
  await flushRoomNameUpdate();
  const player = state.room.players[clientId];
  if (!player) return;
  await updateLocalRoomPlayer({ ready: !player.ready });
}

async function startRoomRace(): Promise<void> {
  await flushRoomNameUpdate();
  const room = state.room ? await roomStore.getRoom(state.room.code) : undefined;
  if (!room || room.hostId !== clientId) return;
  const players = sortRoomPlayers(room);
  if (players.length < 2 || !players.every((player) => player.ready)) return;

  const racePlayers = players.map((player, index) => ({
    id: player.id,
    name: normalizeName(player.name, index),
    carId: player.carId
  }));
  const seed = createRaceSeed([...racePlayers.map((player) => player.name), room.code]);
  const rng = new Rng(seed);
  const trackId = tracks[rng.int(0, tracks.length - 1)].id;
  const normalizedPlayers = Object.fromEntries(
    players.map((player, index) => [
      player.id,
      {
        ...player,
        name: racePlayers[index].name
      }
    ])
  );

  await roomStore.updateRoom(room.code, {
    status: "racing",
    seed,
    trackId,
    startedAt: Date.now(),
    players: normalizedPlayers
  });
}

async function publishRoomResults(results: RaceResult[]): Promise<void> {
  if (!state.room || !state.isRoomHost) return;
  await roomStore.updateRoom(state.room.code, {
    status: "complete",
    completedAt: Date.now(),
    results
  });
  scheduleRenderResults(results);
}

async function leaveRoom(): Promise<void> {
  await flushRoomNameUpdate();
  if (state.room) {
    await roomStore.removePlayer(state.room.code, clientId);
  }
  clearRoomSession();
  renderTitle();
}

function clearRoomSession(unsubscribe = true): void {
  if (nameUpdateTimer !== undefined) {
    window.clearTimeout(nameUpdateTimer);
    nameUpdateTimer = undefined;
  }
  nameUpdatePromise = undefined;
  if (unsubscribe) {
    unsubscribeRoom?.();
    unsubscribeRoom = undefined;
  }
  state.room = undefined;
  state.isRoomHost = undefined;
  roomRaceSignature = "";
  roomCompleteSignature = "";
  lobbyRenderSignature = "";
  pendingLobbyRoom = undefined;
}

function renderSetup(): void {
  state.screen = "setup";
  game.scene.stop("RaceScene");
  phaserRoot.classList.add("is-hidden");

  uiRoot.innerHTML = `
    <main class="screen screen--setup">
      <header class="setup-header">
        <div>
          <p class="eyebrow">ENTRY SETUP</p>
          <h1>참가자와 차량 선택</h1>
        </div>
        <div class="count-control" aria-label="participant count">
          <button class="icon-button" data-action="count-minus" aria-label="참가자 감소">−</button>
          <strong>${state.players.length}</strong>
          <button class="icon-button" data-action="count-plus" aria-label="참가자 증가">+</button>
        </div>
      </header>

      <section class="setup-grid">
        ${state.players.map((player, index) => renderPlayerCard(player, index)).join("")}
      </section>

      <footer class="setup-footer">
        <button class="ghost-button" data-action="back-title">타이틀</button>
        <button class="secondary-button" data-action="randomize-cars">차량 랜덤</button>
        <button class="primary-button" data-action="start-race">레이스 시작</button>
      </footer>
    </main>
  `;
}

function renderPlayerCard(player: PlayerConfig, index: number): string {
  const car = getCar(player.carId);
  return `
    <article class="entrant-card">
      <div class="entrant-card__top">
        <span class="entrant-number">${index + 1}</span>
        <input data-player-name="${index}" value="${escapeHtml(player.name)}" maxlength="14" aria-label="참가자 이름 ${index + 1}" />
      </div>
      <div class="car-preview car-preview--${car.bodyType}">
        <img src="${car.sprite}" alt="${escapeHtml(car.name)}" loading="lazy" />
      </div>
      <label class="select-label">
        <span>차량</span>
        <select data-car-select="${index}">
          ${cars.map((candidate) => `<option value="${candidate.id}" ${candidate.id === car.id ? "selected" : ""}>${candidate.name}</option>`).join("")}
        </select>
      </label>
      ${renderVehicleDetails(car)}
    </article>
  `;
}

function renderVehicleDetails(car: ReturnType<typeof getCar>): string {
  return `
    <p class="car-role">${escapeHtml(car.role)}</p>
    <p class="car-reference">${renderReferencePerformance(car)}</p>
    <p class="car-description">${escapeHtml(car.description)}</p>
    <div class="stat-grid">
      ${renderStat("최고속", car.topSpeed)}
      ${renderStat("가속", car.accel)}
      ${renderStat("그립", car.grip)}
      ${renderStat("드리프트", car.drift)}
      ${renderStat("SP", car.spGain)}
      ${renderStat("중량", car.weight)}
    </div>
  `;
}

function renderStat(label: string, value: number): string {
  return `
    <div class="stat">
      <span>${label}</span>
      <i style="--stat:${value * 10}%"></i>
    </div>
  `;
}

function renderReferencePerformance(car: ReturnType<typeof getCar>): string {
  const reference = car.reference;
  const zeroToHundred = reference.zeroToHundredSec >= 90 ? "측정 불가" : `${reference.zeroToHundredSec.toFixed(1)}s`;
  return `
    <strong>${escapeHtml(reference.model)}</strong>
    <span>${reference.powerHp}hp · 0-100 ${zeroToHundred} · ${reference.topSpeedKmh}km/h · ${reference.weightKg}kg</span>
    <em>${getRuleClassLabel(car.ruleClass)}</em>
  `;
}

function getRuleClassLabel(ruleClass: string): string {
  if (ruleClass === "sportsRisk") return "고성능 스포츠카 · 추월금지 위반 리스크";
  if (ruleClass === "microExempt") return "소형 예외 차량 · 신호/경찰 제외 + 샛길 가능";
  return "일반 차량 · 신호/추월금지 규칙 적용";
}

function startRace(forceTrackId?: string, forcedPlayers?: PlayerConfig[], forcedSeed?: number): void {
  const sourcePlayers = forcedPlayers ?? state.players;
  const players = sourcePlayers.map((player, index) => ({
    ...player,
    name: normalizeName(player.name, index)
  }));
  state.players = players;

  const seed = forcedSeed ?? createRaceSeed(players.map((player) => player.name));
  const rng = new Rng(seed);
  const trackId = forceTrackId ?? tracks[rng.int(0, tracks.length - 1)].id;
  const setup: RaceSetup = { players, trackId, seed };
  state.lastSetup = setup;
  state.screen = "race";
  latestSnapshot = undefined;
  latestResults = [];
  resultRenderSignature = "";
  if (resultRenderTimer !== undefined) {
    window.clearTimeout(resultRenderTimer);
    resultRenderTimer = undefined;
  }

  phaserRoot.classList.remove("is-hidden");
  uiRoot.innerHTML = `
    <main class="race-shell">
      <section class="race-topbar">
        <div class="track-card race-panel">
          <p class="eyebrow">LIVE TOUGE BROADCAST</p>
          <h1 id="hud-track">랜덤 코스 로딩 중</h1>
          <p id="hud-track-desc">AI 드라이버들이 출발선에 정렬하고 있습니다.</p>
        </div>
        <div class="timer-card race-panel">
          <span>TIME</span>
          <strong id="hud-time">00:00</strong>
        </div>
      </section>
      <section class="race-progress race-panel" id="hud-race-progress"></section>
      <section class="race-side">
        <div class="leaderboard race-panel" id="hud-leaderboard"></div>
        <div class="ticker race-panel" id="hud-ticker"></div>
      </section>
    </main>
  `;

  game.scene.stop("RaceScene");
  game.scene.start("RaceScene", setup);
}

function updateRaceHud(snapshot: RaceSnapshot): void {
  const track = document.querySelector<HTMLElement>("#hud-track");
  const desc = document.querySelector<HTMLElement>("#hud-track-desc");
  const time = document.querySelector<HTMLElement>("#hud-time");
  const progress = document.querySelector<HTMLElement>("#hud-race-progress");
  const leaderboard = document.querySelector<HTMLElement>("#hud-leaderboard");
  const ticker = document.querySelector<HTMLElement>("#hud-ticker");

  if (!track || !desc || !time || !progress || !leaderboard || !ticker) return;

  track.textContent = snapshot.trackName;
  desc.textContent = snapshot.trackDescription;
  time.textContent = formatTime(snapshot.elapsed);
  progress.innerHTML = renderRaceProgress(snapshot);
  leaderboard.innerHTML = snapshot.leaderboard.map(renderLeaderboardEntry).join("");
  ticker.innerHTML = snapshot.eventLog.map((message) => `<p>${escapeHtml(message)}</p>`).join("");
  updateRacePanelOverlap(snapshot);
}

function updateRacePanelOverlap(snapshot: RaceSnapshot): void {
  const cars = snapshot.viewportCars?.filter((car) => !car.finished) ?? [];
  const panels = document.querySelectorAll<HTMLElement>(".race-panel");

  for (const panel of panels) {
    if (cars.length === 0) {
      panel.classList.remove("is-over-car");
      continue;
    }

    const rect = panel.getBoundingClientRect();
    const overlap = cars.some((car) => circleIntersectsRect(car, rect));
    panel.classList.toggle("is-over-car", overlap);
  }
}

function circleIntersectsRect(car: RaceViewportCar, rect: DOMRect): boolean {
  const padding = 10;
  const closestX = clamp(car.x, rect.left - padding, rect.right + padding);
  const closestY = clamp(car.y, rect.top - padding, rect.bottom + padding);
  const dx = car.x - closestX;
  const dy = car.y - closestY;
  const radius = car.radius + padding;
  return dx * dx + dy * dy <= radius * radius;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function renderLeaderboardEntry(entry: LeaderboardEntry): string {
  const car = findCarByName(entry.carName);
  const carColor = toCssColor(car?.colors.primary ?? 0xf7b267);
  const trimColor = toCssColor(car?.colors.trim ?? 0xffffff);
  const speedKmh = Math.round(entry.speed * 0.72);
  const speedPercent = clamp(speedKmh / 320 * 100, 4, 100);
  const needleAngle = -132 + speedPercent * 2.64;

  return `
    <article class="leader-row ${entry.isDrifting ? "is-drifting" : ""}">
      <div class="leader-row__rank">${entry.rank}</div>
      <div class="leader-row__name">
        <strong>${escapeHtml(entry.name)}</strong>
        <span>${escapeHtml(entry.carName)}</span>
      </div>
      <div class="speed-dial" style="--speed:${speedPercent}%; --needle:${needleAngle}deg">
        <i></i>
        <strong>${speedKmh}</strong>
        <span>km/h</span>
      </div>
      <div class="leader-car" style="--car-color:${carColor}; --trim-color:${trimColor}">
        <span class="leader-car__body">
          <i class="leader-car__tail leader-car__tail--left"></i>
          <i class="leader-car__tail leader-car__tail--right"></i>
        </span>
      </div>
      <div class="sp-strip" title="SP ${Math.round(entry.sp)}% · ${entry.itemUses} items" aria-label="SP ${Math.round(entry.sp)}%">
        <i style="--sp:${Math.round(entry.sp)}%"></i>
        <span>${Math.round(entry.sp)}</span>
      </div>
    </article>
  `;
}

function renderRaceProgress(snapshot: RaceSnapshot): string {
  const entries = snapshot.leaderboard;
  const lapLabel = `1위 LAP ${snapshot.lap.current}/${snapshot.lap.total}`;
  const markers = [...entries]
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => {
      const car = findCarByName(entry.carName);
      const carColor = toCssColor(car?.colors.primary ?? 0xf7b267);
      const markerProgress = clamp(entry.progressPercent, 2, 98);
      const markerOffset = ((entry.rank - 1) % 4 - 1.5) * 9;
      const badge = formatHudBadge(entry.name);
      const title = `${entry.rank}위 ${entry.name} · ${entry.carName}`;

      return `
        <span
          class="race-progress__marker ${entry.isDrifting ? "is-drifting" : ""} ${entry.finished ? "is-finished" : ""}"
          style="--progress:${markerProgress}%; --car-color:${carColor}; --marker-offset:${markerOffset}px"
          title="${escapeHtml(title)}"
        >
          <i>${entry.rank}</i>
          <b>${escapeHtml(badge)}</b>
        </span>
      `;
    })
    .join("");

  return `
    <div class="race-progress__labels">
      <span>START</span>
      <strong>
        RACE POSITION
        <em class="race-progress__lap" title="${escapeHtml(snapshot.lap.leaderName)}">${lapLabel}</em>
      </strong>
      <span>FINISH</span>
    </div>
    <div class="race-progress__bar">
      <i></i>
      ${markers}
    </div>
  `;
}

function findCarByName(carName: string) {
  return cars.find((candidate) => candidate.name === carName);
}

function toCssColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function formatHudBadge(name: string): string {
  const letters = Array.from(name.trim());
  if (letters.length <= 2) return name.trim() || "AI";
  return letters.slice(0, 2).join("");
}

function scheduleRenderResults(results: RaceResult[], delay = 900): void {
  const signature = getResultsSignature(results);
  if (state.screen === "results" && signature === resultRenderSignature) return;
  resultRenderSignature = signature;
  latestResults = results;
  if (resultRenderTimer !== undefined) window.clearTimeout(resultRenderTimer);
  resultRenderTimer = window.setTimeout(() => {
    resultRenderTimer = undefined;
    renderResults(results);
  }, delay);
}

function getResultsSignature(results: RaceResult[]): string {
  return results
    .map((result) => [
      result.id,
      result.rank,
      result.finishTime.toFixed(3),
      Math.round(result.maxSpeed * 100),
      result.itemUses,
      result.coffeeBuyer ? 1 : 0
    ].join(":"))
    .join("|");
}

function renderResults(results: RaceResult[]): void {
  state.screen = "results";
  phaserRoot.classList.add("is-hidden");
  game.scene.stop("RaceScene");
  const buyer = results.find((result) => result.coffeeBuyer) ?? results[results.length - 1];
  const winner = results[0];

  uiRoot.innerHTML = `
    <main class="screen screen--results">
      <header class="results-hero">
        <p class="eyebrow">RACE RESULT</p>
        <h1>${escapeHtml(buyer.name)} 커피 당첨</h1>
        <p>우승은 ${escapeHtml(winner.name)}. 오늘의 커피는 ${escapeHtml(buyer.carName)}를 탄 ${escapeHtml(buyer.name)}가 삽니다.</p>
      </header>
      <section class="results-grid">
        ${results.map(renderResultRow).join("")}
      </section>
      <footer class="setup-footer">
        <button class="secondary-button" data-action="rematch">같은 설정 재경기</button>
        <button class="primary-button" data-action="new-setup">참가자 다시 선택</button>
      </footer>
    </main>
  `;
}

function renderResultRow(result: RaceResult): string {
  return `
    <article class="result-row ${result.coffeeBuyer ? "is-coffee" : ""}">
      <span class="result-rank">${result.rank}</span>
      <div>
        <strong>${escapeHtml(result.name)}</strong>
        <p>${escapeHtml(result.carName)} · ${escapeHtml(result.highlight)}</p>
      </div>
      <dl>
        <div><dt>기록</dt><dd>${formatTime(result.finishTime)}</dd></div>
        <div><dt>드리프트</dt><dd>${result.driftSeconds.toFixed(1)}s</dd></div>
        <div><dt>아이템</dt><dd>${result.itemUses}</dd></div>
        <div><dt>최고속</dt><dd>${Math.round(result.maxSpeed * 0.72)} km/h</dd></div>
      </dl>
    </article>
  `;
}

function normalizeName(value: string, index: number): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 14) : `드라이버 ${index + 1}`;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
