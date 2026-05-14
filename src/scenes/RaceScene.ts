import Phaser from "phaser";
import type { CarSpec, ItemType, RaceSetup, RaceSnapshot } from "../types";
import { cars } from "../data/cars";
import { lookupPath } from "../gameplay/path";
import { RaceEngine, type CarRuntime, type RaceEngineEvent } from "../gameplay/raceEngine";
import { Rng } from "../gameplay/rng";

interface SmokeParticle {
  x: number;
  y: number;
  radius: number;
  ttl: number;
  maxTtl: number;
}

type FacingDirection = 1 | -1;

const CAR_INITIAL_SCALE = 0.98;
const CAR_RUNNING_SCALE = 1.03;
const CAR_TURBO_SCALE = 1.13;
const CAR_INGAME_SIZE_SCALE = 0.7;
const CAR_DIRECTION_DEAD_ZONE = 0.08;
const CAR_MAX_VISUAL_TILT = 0.38;
const CAR_SHADOW_OFFSET_X = 5;
const CAR_SHADOW_OFFSET_Y = 6;
const FIXED_SIMULATION_STEP = 1 / 30;
const MAX_FRAME_DELTA = 0.25;
const MAX_SIMULATION_STEPS_PER_FRAME = 10;

export class RaceScene extends Phaser.Scene {
  private setup!: RaceSetup;
  private engine!: RaceEngine;
  private carSprites = new Map<string, Phaser.GameObjects.Image>();
  private carBaseScales = new Map<string, number>();
  private carFacingDirections = new Map<string, FacingDirection>();
  private shadowSprites = new Map<string, Phaser.GameObjects.Ellipse>();
  private nameLabels = new Map<string, Phaser.GameObjects.Text>();
  private hazardLabels = new Map<string, Phaser.GameObjects.Text>();
  private smokeParticles: SmokeParticle[] = [];
  private trackGraphics!: Phaser.GameObjects.Graphics;
  private hazardGraphics!: Phaser.GameObjects.Graphics;
  private trafficGraphics!: Phaser.GameObjects.Graphics;
  private smokeGraphics!: Phaser.GameObjects.Graphics;
  private speedGraphics!: Phaser.GameObjects.Graphics;
  private focusCarId?: string;
  private focusTimer = 0;
  private cameraSwitchCooldown = 0;
  private simulationAccumulator = 0;
  private uiTimer = 0;
  private smokeTimer = 0;
  private completeDispatched = false;

  constructor() {
    super("RaceScene");
  }

  init(data: RaceSetup): void {
    this.setup = data;
  }

  preload(): void {
    for (const car of cars) {
      const textureKey = getCarTextureKey(car);
      if (!this.textures.exists(textureKey)) {
        this.load.image(textureKey, car.sprite);
      }
    }
  }

  create(): void {
    this.engine = new RaceEngine(this.setup);
    this.completeDispatched = false;
    this.focusCarId = undefined;
    this.focusTimer = 0;
    this.cameraSwitchCooldown = 0;
    this.simulationAccumulator = 0;
    this.uiTimer = 0;
    this.smokeTimer = 0;
    this.smokeParticles = [];
    this.carSprites.clear();
    this.carBaseScales.clear();
    this.carFacingDirections.clear();
    this.shadowSprites.clear();
    this.nameLabels.clear();
    this.hazardLabels.clear();

    this.cameras.main.setBackgroundColor(this.engine.track.theme.sky);
    this.cameras.main.setBounds(0, 0, this.engine.track.world.width, this.engine.track.world.height);
    this.physics.world.setBounds(0, 0, this.engine.track.world.width, this.engine.track.world.height);

    this.drawTrack();
    this.trafficGraphics = this.add.graphics().setDepth(6);
    this.updateTrafficGraphics();
    this.createCars();

    this.hazardGraphics = this.add.graphics();
    this.smokeGraphics = this.add.graphics();
    this.speedGraphics = this.add.graphics().setScrollFactor(0).setDepth(100);

    window.dispatchEvent(new CustomEvent("jdm:race-update", { detail: this.getUiSnapshot() }));
  }

  update(_time: number, delta: number): void {
    if (!this.engine || this.completeDispatched) return;

    const frameDt = Math.min(MAX_FRAME_DELTA, delta / 1000);
    this.simulationAccumulator += frameDt;

    let simulationSteps = 0;
    while (
      this.simulationAccumulator >= FIXED_SIMULATION_STEP &&
      !this.engine.complete &&
      simulationSteps < MAX_SIMULATION_STEPS_PER_FRAME
    ) {
      this.engine.update(FIXED_SIMULATION_STEP);
      this.handleEvents(this.engine.events);
      this.simulationAccumulator -= FIXED_SIMULATION_STEP;
      simulationSteps += 1;
    }
    if (simulationSteps >= MAX_SIMULATION_STEPS_PER_FRAME) {
      this.simulationAccumulator = Math.min(this.simulationAccumulator, FIXED_SIMULATION_STEP * 2);
    }

    this.updateCarSprites(frameDt);
    this.updateHazards();
    this.updateTrafficGraphics();
    this.updateSmoke(frameDt);
    this.updateCamera(frameDt);
    this.updateSpeedLines();

    this.uiTimer += frameDt;
    if (this.uiTimer >= 0.24) {
      this.uiTimer = 0;
      window.dispatchEvent(new CustomEvent("jdm:race-update", { detail: this.getUiSnapshot() }));
    }

    if (this.engine.complete) {
      this.completeDispatched = true;
      window.dispatchEvent(new CustomEvent("jdm:race-complete", { detail: this.engine.getResults() }));
    }
  }

  private drawTrack(): void {
    const { track, runtime } = this.engine;
    const rng = new Rng(track.seed);

    this.trackGraphics = this.add.graphics();
    this.trackGraphics.fillStyle(track.theme.ground, 1);
    this.trackGraphics.fillRect(0, 0, track.world.width, track.world.height);

    this.drawPixelGround(rng);
    this.drawDecorations(rng);

    const points = runtime.samples.map((sample) => sample.point);
    this.trackGraphics.lineStyle(track.roadWidth + 36, track.theme.roadEdge, 1);
    this.strokeClosedPath(points);
    this.trackGraphics.lineStyle(track.roadWidth + 18, 0x17191d, 0.42);
    this.strokeClosedPath(points);
    this.trackGraphics.lineStyle(track.roadWidth, track.theme.road, 1);
    this.strokeClosedPath(points);

    this.drawPixelRoadDetails(rng);

    this.drawLaneMarkings();

    this.trackGraphics.lineStyle(8, track.theme.accent, 0.72);
    for (const zone of runtime.driftZones) {
      const zoneLength = zone.end >= zone.start ? zone.end - zone.start : runtime.totalLength - zone.start + zone.end;
      for (let offset = 10; offset < zoneLength; offset += 76) {
        const distance = (zone.start + offset) % runtime.totalLength;
        const inner = lookupPath(runtime, distance, -track.roadWidth * 0.48);
        const outer = lookupPath(runtime, distance + 18, -track.roadWidth * 0.28);
        this.trackGraphics.beginPath();
        this.trackGraphics.moveTo(inner.point.x, inner.point.y);
        this.trackGraphics.lineTo(outer.point.x, outer.point.y);
        this.trackGraphics.strokePath();
      }
    }

    const start = lookupPath(runtime, 0);
    this.trackGraphics.lineStyle(9, 0xffffff, 0.92);
    this.trackGraphics.beginPath();
    this.trackGraphics.moveTo(start.point.x - start.normal.x * track.roadWidth * 0.42, start.point.y - start.normal.y * track.roadWidth * 0.42);
    this.trackGraphics.lineTo(start.point.x + start.normal.x * track.roadWidth * 0.42, start.point.y + start.normal.y * track.roadWidth * 0.42);
    this.trackGraphics.strokePath();

    this.add.text(start.point.x + 24, start.point.y + 18, "START", {
      fontFamily: "Arial, sans-serif",
      fontSize: "26px",
      fontStyle: "900",
      color: "#ffffff",
      stroke: "#101317",
      strokeThickness: 6
    }).setAngle(Phaser.Math.RadToDeg(start.angle)).setDepth(3);
  }

  private drawPixelGround(rng: Rng): void {
    const { track } = this.engine;
    const tile = 24;
    const columns = Math.ceil(track.world.width / tile);
    const rows = Math.ceil(track.world.height / tile);

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        if (!rng.chance(0.36)) continue;
        const px = x * tile;
        const py = y * tile;
        const color = rng.chance(0.52) ? lighten(track.theme.ground, 0.06) : darken(track.theme.ground, 0.08);
        this.trackGraphics.fillStyle(color, rng.range(0.16, 0.34));
        this.trackGraphics.fillRect(px, py, tile, tile);

        if (rng.chance(0.18)) {
          this.trackGraphics.fillStyle(track.theme.foliage, rng.range(0.12, 0.24));
          this.trackGraphics.fillRect(px + rng.int(0, 12), py + rng.int(0, 12), rng.pick([4, 8, 12]), rng.pick([4, 8, 12]));
        }
      }
    }

    for (let index = 0; index < 280; index += 1) {
      const x = Math.floor(rng.range(0, track.world.width) / 8) * 8;
      const y = Math.floor(rng.range(0, track.world.height) / 8) * 8;
      const size = rng.pick([4, 6, 8]);
      this.trackGraphics.fillStyle(rng.chance(0.5) ? 0xffffff : 0x000000, rng.range(0.035, 0.08));
      this.trackGraphics.fillRect(x, y, size, size);
    }
  }

  private drawPixelRoadDetails(rng: Rng): void {
    const { track, runtime } = this.engine;

    for (let distance = 0; distance < runtime.totalLength; distance += 34) {
      if (rng.chance(0.62)) {
        const point = lookupPath(runtime, distance, rng.range(-track.roadWidth * 0.36, track.roadWidth * 0.36)).point;
        this.trackGraphics.fillStyle(rng.chance(0.55) ? 0x202329 : 0x4b515b, rng.range(0.12, 0.26));
        this.trackGraphics.fillRect(Math.round(point.x / 4) * 4, Math.round(point.y / 4) * 4, rng.pick([4, 8, 12]), rng.pick([4, 8]));
      }

      if (rng.chance(0.86)) {
        const left = lookupPath(runtime, distance, -track.roadWidth * 0.55).point;
        const right = lookupPath(runtime, distance, track.roadWidth * 0.55).point;
        this.trackGraphics.fillStyle(track.theme.roadEdge, 0.85);
        this.trackGraphics.fillRect(Math.round(left.x / 6) * 6 - 5, Math.round(left.y / 6) * 6 - 5, 10, 10);
        this.trackGraphics.fillRect(Math.round(right.x / 6) * 6 - 5, Math.round(right.y / 6) * 6 - 5, 10, 10);
      }
    }

    for (let distance = 0; distance < runtime.totalLength; distance += 180) {
      const railA = lookupPath(runtime, distance, -track.roadWidth * 0.66).point;
      const railB = lookupPath(runtime, distance + 82, -track.roadWidth * 0.66).point;
      const railC = lookupPath(runtime, distance, track.roadWidth * 0.66).point;
      const railD = lookupPath(runtime, distance + 82, track.roadWidth * 0.66).point;
      this.trackGraphics.lineStyle(6, darken(track.theme.roadEdge, 0.22), 0.72);
      this.trackGraphics.beginPath();
      this.trackGraphics.moveTo(railA.x, railA.y);
      this.trackGraphics.lineTo(railB.x, railB.y);
      this.trackGraphics.moveTo(railC.x, railC.y);
      this.trackGraphics.lineTo(railD.x, railD.y);
      this.trackGraphics.strokePath();
    }
  }

  private drawLaneMarkings(): void {
    const { track, runtime } = this.engine;

    this.trackGraphics.lineStyle(5, 0xf8fafc, 0.74);
    for (let d = 0; d < runtime.totalLength; d += 72) {
      if (this.engine.getRoadRule(d) === "noPassing") continue;
      const start = lookupPath(runtime, d);
      const end = lookupPath(runtime, d + 32);
      this.trackGraphics.beginPath();
      this.trackGraphics.moveTo(start.point.x, start.point.y);
      this.trackGraphics.lineTo(end.point.x, end.point.y);
      this.trackGraphics.strokePath();
    }

    this.trackGraphics.lineStyle(4, 0xffd166, 0.92);
    for (const zone of this.engine.getTrafficPlan().noPassingZones) {
      const length = getWrappedZoneLength(zone.start, zone.end, runtime.totalLength);
      for (let offset = 0; offset < length; offset += 38) {
        const distance = normalizeLapDistance(zone.start + offset, runtime.totalLength);
        for (const laneOffset of [-6, 6]) {
          const start = lookupPath(runtime, distance, laneOffset);
          const end = lookupPath(runtime, distance + 28, laneOffset);
          this.trackGraphics.beginPath();
          this.trackGraphics.moveTo(start.point.x, start.point.y);
          this.trackGraphics.lineTo(end.point.x, end.point.y);
          this.trackGraphics.strokePath();
        }
      }

      for (let offset = 0; offset < length; offset += 112) {
        const warning = lookupPath(runtime, normalizeLapDistance(zone.start + offset, runtime.totalLength), -track.roadWidth * 0.44).point;
        this.trackGraphics.fillStyle(0xffd166, 0.7);
        this.trackGraphics.fillRect(Math.round(warning.x / 4) * 4 - 6, Math.round(warning.y / 4) * 4 - 6, 12, 12);
      }
    }
  }

  private updateTrafficGraphics(): void {
    if (!this.trafficGraphics) return;
    const { track, runtime } = this.engine;
    const plan = this.engine.getTrafficPlan();
    this.trafficGraphics.clear();

    for (const shortcut of plan.shortcuts) {
      const length = getWrappedZoneLength(shortcut.start, shortcut.end, runtime.totalLength);
      this.trafficGraphics.lineStyle(5, 0x7ee081, 0.58);
      for (let offset = 0; offset < length; offset += 56) {
        const start = lookupPath(runtime, normalizeLapDistance(shortcut.start + offset, runtime.totalLength), shortcut.offsetSign * track.roadWidth * 0.82);
        const end = lookupPath(runtime, normalizeLapDistance(shortcut.start + offset + 30, runtime.totalLength), shortcut.offsetSign * track.roadWidth * 0.92);
        this.trafficGraphics.beginPath();
        this.trafficGraphics.moveTo(start.point.x, start.point.y);
        this.trafficGraphics.lineTo(end.point.x, end.point.y);
        this.trafficGraphics.strokePath();
      }
    }

    for (const light of plan.trafficLights) {
      const isRed = this.engine.isTrafficLightRed(light);
      const base = lookupPath(runtime, light.progress, track.roadWidth * 0.64);
      const x = base.point.x;
      const y = base.point.y;
      this.trafficGraphics.lineStyle(4, 0x101317, 0.9);
      this.trafficGraphics.beginPath();
      this.trafficGraphics.moveTo(x - base.normal.x * 22, y - base.normal.y * 22);
      this.trafficGraphics.lineTo(x + base.normal.x * 10, y + base.normal.y * 10);
      this.trafficGraphics.strokePath();
      this.trafficGraphics.fillStyle(0x101317, 0.95);
      this.trafficGraphics.fillRoundedRect(x - 12, y - 22, 24, 44, 3);
      this.trafficGraphics.fillStyle(isRed ? 0xff2f4f : 0x4b5563, 1);
      this.trafficGraphics.fillCircle(x, y - 10, 7);
      this.trafficGraphics.fillStyle(isRed ? 0x4b5563 : 0x7ee081, 1);
      this.trafficGraphics.fillCircle(x, y + 10, 7);
    }

    for (const trap of plan.policeTraps) {
      const base = lookupPath(runtime, trap.progress, -track.roadWidth * 0.68);
      const x = base.point.x;
      const y = base.point.y;
      this.trafficGraphics.fillStyle(0x101317, 0.82);
      this.trafficGraphics.fillRect(x - 18, y - 14, 36, 28);
      this.trafficGraphics.fillStyle(0x4cc9f0, 0.95);
      this.trafficGraphics.fillRect(x - 14, y - 10, 12, 20);
      this.trafficGraphics.fillStyle(0xff2f4f, 0.95);
      this.trafficGraphics.fillRect(x + 2, y - 10, 12, 20);
      this.trafficGraphics.lineStyle(3, 0xffffff, 0.42);
      this.trafficGraphics.strokeCircle(x, y, 24);
    }
  }

  private strokeClosedPath(points: Array<{ x: number; y: number }>): void {
    const [first] = points;
    this.trackGraphics.beginPath();
    this.trackGraphics.moveTo(first.x, first.y);
    for (let index = 1; index < points.length; index += 1) {
      this.trackGraphics.lineTo(points[index].x, points[index].y);
    }
    this.trackGraphics.closePath();
    this.trackGraphics.strokePath();
  }

  private drawDecorations(rng: Rng): void {
    const { track, runtime } = this.engine;
    const decorationCount = track.category === "city" ? 190 : 250;

    for (let index = 0; index < decorationCount; index += 1) {
      const x = Math.floor(rng.range(60, track.world.width - 60) / 8) * 8;
      const y = Math.floor(rng.range(60, track.world.height - 60) / 8) * 8;
      if (this.isNearRoad(x, y, track.roadWidth + 54)) continue;

      if (track.category === "city") {
        const width = rng.pick([32, 48, 64, 80, 96]);
        const height = rng.pick([32, 48, 64, 88, 112]);
        const color = rng.chance(0.72) ? 0x263241 : track.theme.accent;
        this.trackGraphics.fillStyle(color, rng.chance(0.72) ? 0.68 : 0.42);
        this.trackGraphics.fillRect(x, y, width, height);
        this.trackGraphics.fillStyle(0x080b10, 0.25);
        this.trackGraphics.fillRect(x + 4, y + height - 8, width - 8, 4);
        for (let wx = x + 8; wx < x + width - 6; wx += 14) {
          for (let wy = y + 8; wy < y + height - 8; wy += 16) {
            if (!rng.chance(0.34)) continue;
            this.trackGraphics.fillStyle(rng.chance(0.5) ? 0xfff3b0 : track.theme.accent, 0.76);
            this.trackGraphics.fillRect(wx, wy, 6, 4);
          }
        }
      } else if (track.category === "coast" && rng.chance(0.35)) {
        this.trackGraphics.fillStyle(0x78c6d9, 0.38);
        for (let wave = 0; wave < rng.int(2, 5); wave += 1) {
          this.trackGraphics.fillRect(x + wave * 14, y + rng.int(-8, 8), rng.pick([12, 20, 28]), 5);
        }
      } else {
        const trunk = darken(track.theme.foliage, 0.34);
        this.trackGraphics.fillStyle(trunk, 0.8);
        this.trackGraphics.fillRect(x + 6, y + 10, 6, 12);
        this.trackGraphics.fillStyle(track.theme.foliage, rng.range(0.62, 0.95));
        this.trackGraphics.fillRect(x, y + 4, 20, 12);
        this.trackGraphics.fillRect(x + 4, y, 12, 20);
        this.trackGraphics.fillStyle(lighten(track.theme.foliage, 0.12), 0.42);
        this.trackGraphics.fillRect(x + 4, y + 4, 8, 8);
      }
    }

    for (let d = 0; d < runtime.totalLength; d += 260) {
      if (!rng.chance(track.category === "city" ? 0.8 : 0.45)) continue;
      const lamp = lookupPath(runtime, d, track.roadWidth * (rng.chance(0.5) ? 0.72 : -0.72));
      this.trackGraphics.lineStyle(3, 0x20242a, 0.85);
      this.trackGraphics.strokeCircle(lamp.point.x, lamp.point.y, 10);
      this.trackGraphics.fillStyle(track.theme.accent, track.category === "city" ? 0.85 : 0.5);
      this.trackGraphics.fillCircle(lamp.point.x, lamp.point.y, 5);
    }
  }

  private isNearRoad(x: number, y: number, threshold: number): boolean {
    const samples = this.engine.runtime.samples;
    for (let index = 0; index < samples.length; index += 8) {
      const sample = samples[index].point;
      if (Math.hypot(sample.x - x, sample.y - y) < threshold) return true;
    }
    return false;
  }

  private createCars(): void {
    for (const car of this.engine.cars) {
      const shadow = this.add
        .ellipse(
          car.position.x + CAR_SHADOW_OFFSET_X,
          car.position.y + CAR_SHADOW_OFFSET_Y,
          getShadowWidth(car.car),
          getShadowHeight(car.car),
          0x000000,
          0.28
        )
        .setDepth(7);
      const sprite = this.add.image(car.position.x, car.position.y, getCarTextureKey(car.car)).setDepth(10 + car.rank);
      const baseScale = getRaceSpriteWidth(car.car) / Math.max(1, sprite.width);
      const nameLabel = this.add.text(car.position.x, car.position.y + getNameOffsetY(car.car), formatDriverBadge(car.name), {
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        fontStyle: "900",
        color: "#111820",
        backgroundColor: "#fff7ed",
        padding: { x: 5, y: 2 }
      }).setOrigin(0.5).setDepth(64);
      const facingDirection = getFacingDirection(car.angle);
      sprite.setFlipX(facingDirection === -1);
      sprite.setRotation(getSideViewTilt(car.visualAngle, facingDirection));
      sprite.setScale(baseScale * CAR_INITIAL_SCALE);
      this.shadowSprites.set(car.id, shadow);
      this.carSprites.set(car.id, sprite);
      this.carBaseScales.set(car.id, baseScale);
      this.carFacingDirections.set(car.id, facingDirection);
      this.nameLabels.set(car.id, nameLabel);
    }
  }

  private updateCarSprites(dt: number): void {
    this.smokeTimer += dt;
    for (const car of this.engine.cars) {
      const sprite = this.carSprites.get(car.id);
      const shadow = this.shadowSprites.get(car.id);
      const nameLabel = this.nameLabels.get(car.id);
      if (!sprite || !shadow || !nameLabel) continue;

      const baseScale = this.carBaseScales.get(car.id) ?? 1;
      const facingDirection = getFacingDirection(car.angle, this.carFacingDirections.get(car.id) ?? 1);
      this.carFacingDirections.set(car.id, facingDirection);
      sprite.setPosition(car.position.x, car.position.y);
      sprite.setFlipX(facingDirection === -1);
      sprite.setRotation(getSideViewTilt(car.visualAngle, facingDirection));
      sprite.setDepth(15 + (this.engine.cars.length - car.rank));
      sprite.setAlpha(car.finished ? 0.72 : 1);
      sprite.setScale(baseScale * (car.turboTime > 0 ? CAR_TURBO_SCALE : CAR_RUNNING_SCALE));
      shadow.setPosition(car.position.x + CAR_SHADOW_OFFSET_X, car.position.y + CAR_SHADOW_OFFSET_Y);
      shadow.setAlpha(car.finished ? 0.12 : 0.28);
      nameLabel.setPosition(car.position.x, car.position.y + getNameOffsetY(car.car));
      nameLabel.setDepth(66 + (this.engine.cars.length - car.rank));
      nameLabel.setAlpha(car.finished ? 0.55 : 0.96);

      if (car.isDrifting && this.engine.elapsed > 1.5 && this.smokeTimer > 0.06) {
        this.addSmoke(car);
      }
    }
    if (this.smokeTimer > 0.06) this.smokeTimer = 0;
  }

  private addSmoke(car: CarRuntime): void {
    const backX = car.position.x - Math.cos(car.angle) * 30;
    const backY = car.position.y - Math.sin(car.angle) * 30;
    this.smokeParticles.push({
      x: backX + Phaser.Math.Between(-8, 8),
      y: backY + Phaser.Math.Between(-8, 8),
      radius: 10 + car.driftIntensity * 18,
      ttl: 0.75,
      maxTtl: 0.75
    });
  }

  private updateHazards(): void {
    this.hazardGraphics.clear();
    const activeIds = new Set<string>();

    for (const hazard of this.engine.getHazards()) {
      const lookup = lookupPath(this.engine.runtime, hazard.progress);
      activeIds.add(hazard.id);

      if (hazard.type === "banana") {
        this.hazardGraphics.fillStyle(0x111820, 0.72);
        this.hazardGraphics.fillCircle(lookup.point.x, lookup.point.y, 26);
        this.hazardGraphics.fillStyle(0xffd166, 0.98);
        this.hazardGraphics.fillTriangle(lookup.point.x - 14, lookup.point.y + 12, lookup.point.x + 20, lookup.point.y, lookup.point.x - 5, lookup.point.y - 18);
        this.hazardGraphics.lineStyle(4, 0x6b3f00, 0.9);
        this.hazardGraphics.strokeCircle(lookup.point.x, lookup.point.y, 22);
        this.updateHazardLabel(hazard.id, "BANANA", lookup.point.x, lookup.point.y - 36, "#ffd166");
      } else {
        for (let offset = 0; offset < 210; offset += 42) {
          const point = lookupPath(this.engine.runtime, hazard.progress + offset, Phaser.Math.Between(-25, 25)).point;
          this.hazardGraphics.fillStyle(0xdbeafe, 0.26);
          this.hazardGraphics.fillCircle(point.x, point.y, 52);
          this.hazardGraphics.lineStyle(3, 0x38bdf8, 0.24);
          this.hazardGraphics.strokeCircle(point.x, point.y, 54);
        }
        this.updateHazardLabel(hazard.id, "SMOKE", lookup.point.x, lookup.point.y - 44, "#7dd3fc");
      }
    }

    for (const [id, label] of this.hazardLabels) {
      if (!activeIds.has(id)) {
        label.destroy();
        this.hazardLabels.delete(id);
      }
    }
  }

  private updateHazardLabel(id: string, text: string, x: number, y: number, color: string): void {
    let label = this.hazardLabels.get(id);
    if (!label) {
      label = this.add.text(x, y, text, {
        fontFamily: "Arial, sans-serif",
        fontSize: "15px",
        fontStyle: "900",
        color,
        backgroundColor: "#101317",
        padding: { x: 7, y: 3 }
      }).setOrigin(0.5).setDepth(62);
      this.hazardLabels.set(id, label);
    }

    label.setPosition(x, y);
  }

  private updateSmoke(dt: number): void {
    this.smokeGraphics.clear();
    this.smokeParticles = this.smokeParticles
      .map((particle) => ({ ...particle, ttl: particle.ttl - dt, radius: particle.radius + 18 * dt }))
      .filter((particle) => particle.ttl > 0)
      .slice(-150);

    for (const particle of this.smokeParticles) {
      const alpha = Math.max(0, particle.ttl / particle.maxTtl) * 0.34;
      this.smokeGraphics.fillStyle(0xf2f4f3, alpha);
      this.smokeGraphics.fillCircle(particle.x, particle.y, particle.radius);
    }
  }

  private handleEvents(events: RaceEngineEvent[]): void {
    for (const event of events) {
      if (event.type === "item" || event.type === "traffic" || event.type === "shortcut") {
        this.cameras.main.shake(120, 0.004 * event.intensity);
        this.spawnItemCallout(event);
      }

      const focusCandidate = this.getEventFocusCandidate(event);
      if (!focusCandidate || this.cameraSwitchCooldown > 0) continue;

      const backPackRank = Math.max(2, this.engine.cars.length - 2);
      const isBackPack = focusCandidate.rank >= backPackRank;
      const isMajorMoment = event.type === "item" || event.type === "traffic" || event.type === "shortcut";
      const isWorthCuttingTo = isMajorMoment || (isBackPack && event.type === "overtake") || (isBackPack && event.type === "drift" && event.intensity > 1.05);

      if (!isWorthCuttingTo || event.type === "finish") continue;

      this.focusCarId = focusCandidate.id;
      this.focusTimer = isMajorMoment ? 3.8 : 2.8;
      this.cameraSwitchCooldown = isMajorMoment ? 5.2 : 6.4;
    }
  }

  private getEventFocusCandidate(event: RaceEngineEvent): CarRuntime | undefined {
    if (event.type === "finish") return undefined;

    const preferredId = event.targetId ?? event.carId;
    const preferred = this.engine.cars.find((car) => car.id === preferredId && !car.finished);
    if (preferred) return preferred;

    return this.engine.cars.find((car) => car.id === event.carId && !car.finished);
  }

  private spawnItemCallout(event: RaceEngineEvent): void {
    const car = this.engine.cars.find((candidate) => candidate.id === event.carId);
    if (!car) return;

    const item = event.item ?? "turbo";
    const labelText = event.label ?? getItemLabel(item);
    const color = event.type === "traffic" ? "#ff5a5f" : event.type === "shortcut" ? "#7ee081" : getItemColor(item);
    const label = this.add.text(car.position.x, car.position.y - 78, labelText, {
      fontFamily: "Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "900",
      color,
      backgroundColor: "#101317",
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5).setDepth(88);

    this.tweens.add({
      targets: label,
      y: label.y - 46,
      alpha: 0,
      scale: 1.2,
      duration: 1050,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy()
    });
  }

  private updateCamera(dt: number): void {
    this.focusTimer = Math.max(0, this.focusTimer - dt);
    this.cameraSwitchCooldown = Math.max(0, this.cameraSwitchCooldown - dt);
    const focusCar = this.getFocusCar();
    if (!focusCar) return;

    const camera = this.cameras.main;
    const zoom = this.getCameraZoom();
    camera.setZoom(Phaser.Math.Linear(camera.zoom, zoom, 0.018));

    const targetX = focusCar.position.x - camera.width / (2 * camera.zoom);
    const targetY = focusCar.position.y - camera.height / (2 * camera.zoom);
    camera.scrollX = Phaser.Math.Linear(camera.scrollX, targetX, 0.035);
    camera.scrollY = Phaser.Math.Linear(camera.scrollY, targetY, 0.035);
  }

  private getFocusCar(): CarRuntime | undefined {
    if (this.focusTimer > 0 && this.focusCarId) {
      const focused = this.engine.cars.find((car) => car.id === this.focusCarId && !car.finished);
      if (focused) return focused;
      this.focusCarId = undefined;
      this.focusTimer = 0;
    }

    const active = this.engine.cars.filter((car) => !car.finished);
    if (active.length === 0) return undefined;

    const backPack = active
      .slice()
      .sort((a, b) => b.rank - a.rank);
    const lastActive = backPack[0];
    const challengerAhead = backPack.find((car) => car.id !== lastActive.id && car.progress - lastActive.progress < 165);

    return challengerAhead ?? lastActive;
  }

  private getCameraZoom(): number {
    const width = this.scale.width;
    if (width < 720) return 0.72;
    if (this.focusTimer > 0) return 0.94;
    return 0.78;
  }

  private updateSpeedLines(): void {
    const activeCars = this.engine.cars.filter((car) => !car.finished);
    const speedCars = activeCars.length > 0 ? activeCars : this.engine.cars;
    const leader = speedCars.reduce((fastest, car) => (car.speed > fastest.speed ? car : fastest), speedCars[0]);
    const alpha = Math.max(0, Math.min(0.48, (leader.speed - 150) / 210));
    const width = this.scale.width;
    const height = this.scale.height;
    this.speedGraphics.clear();
    if (alpha <= 0.02) return;

    this.speedGraphics.lineStyle(2, 0xffffff, alpha);
    for (let x = -120; x < width + 160; x += 128) {
      const offset = (this.engine.elapsed * 760) % 128;
      this.speedGraphics.beginPath();
      this.speedGraphics.moveTo(x + offset, 0);
      this.speedGraphics.lineTo(x - 230 + offset, height);
      this.speedGraphics.strokePath();
    }
  }

  private getUiSnapshot(): RaceSnapshot {
    const camera = this.cameras.main;
    return {
      ...this.engine.getSnapshot(),
      viewportCars: this.engine.cars.map((car) => ({
        id: car.id,
        x: (car.position.x - camera.scrollX) * camera.zoom,
        y: (car.position.y - camera.scrollY) * camera.zoom,
        radius: car.finished ? 16 : 26,
        finished: car.finished
      }))
    };
  }
}

function formatDriverBadge(name: string): string {
  const letters = Array.from(name.trim());
  if (letters.length <= 2) return name.trim() || "AI";
  return letters.slice(0, 2).join("");
}

function getCarTextureKey(car: CarSpec): string {
  return `car-sprite-${car.id}`;
}

function getFacingDirection(angle: number, previous: FacingDirection = 1): FacingDirection {
  const horizontalMotion = Math.cos(angle);
  if (Math.abs(horizontalMotion) < CAR_DIRECTION_DEAD_ZONE) return previous;
  return horizontalMotion >= 0 ? 1 : -1;
}

function getSideViewTilt(angle: number, direction: FacingDirection): number {
  const baseAngle = direction === 1 ? 0 : Math.PI;
  const tilt = Phaser.Math.Angle.Wrap(angle - baseAngle);
  return Phaser.Math.Clamp(tilt, -CAR_MAX_VISUAL_TILT, CAR_MAX_VISUAL_TILT);
}

function getRaceSpriteWidth(car: CarSpec): number {
  return car.raceSpriteWidth * CAR_INGAME_SIZE_SCALE;
}

function getShadowWidth(car: CarSpec): number {
  if (car.bodyType === "scooter") return 26;
  if (car.bodyType === "rickshaw") return 46;
  return Math.max(42, getRaceSpriteWidth(car) * 0.72);
}

function getShadowHeight(car: CarSpec): number {
  if (car.bodyType === "scooter") return 10;
  if (car.bodyType === "rickshaw") return 14;
  return 18;
}

function getNameOffsetY(car: CarSpec): number {
  if (car.bodyType === "scooter") return -58;
  if (car.bodyType === "rickshaw" || car.bodyType === "tractor") return -48;
  if (car.bodyType === "suv" || car.bodyType === "truck") return -42;
  return -38;
}

function getItemLabel(item: ItemType): string {
  const labels: Record<ItemType, string> = {
    turbo: "TURBO"
  };
  return labels[item];
}

function getItemColor(item: ItemType): string {
  const colors: Record<ItemType, string> = {
    turbo: "#4cc9f0"
  };
  return colors[item];
}

function normalizeLapDistance(value: number, total: number): number {
  const normalized = value % total;
  return normalized < 0 ? normalized + total : normalized;
}

function getWrappedZoneLength(start: number, end: number, total: number): number {
  return end >= start ? end - start : total - start + end;
}

function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 255) + 255 * amount);
  const g = Math.min(255, ((color >> 8) & 255) + 255 * amount);
  const b = Math.min(255, (color & 255) + 255 * amount);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function darken(color: number, amount: number): number {
  const factor = Math.max(0, 1 - amount);
  const r = ((color >> 16) & 255) * factor;
  const g = ((color >> 8) & 255) * factor;
  const b = (color & 255) * factor;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
