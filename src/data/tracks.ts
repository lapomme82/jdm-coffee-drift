import type { TrackSpec } from "../types";

export const tracks: TrackSpec[] = [
  {
    id: "hakone-ridge",
    name: "Hakone Ridge Loop",
    category: "mountain",
    description: "연속 헤어핀과 짧은 직선이 이어지는 클래식 산길 코스.",
    seed: 1001,
    roadWidth: 116,
    laps: 5,
    world: { width: 2600, height: 1800 },
    theme: { sky: 0x172027, ground: 0x23382f, foliage: 0x537a5a, road: 0x35383d, roadEdge: 0xa5a58d, line: 0xf6d365, accent: 0xff6b35 },
    points: [
      { x: 290, y: 1120 }, { x: 470, y: 520 }, { x: 900, y: 360 }, { x: 1250, y: 720 },
      { x: 1570, y: 260 }, { x: 2160, y: 420 }, { x: 2020, y: 940 }, { x: 2320, y: 1330 },
      { x: 1690, y: 1500 }, { x: 1320, y: 1110 }, { x: 900, y: 1460 }, { x: 520, y: 1390 }
    ],
    driftCorners: [1, 3, 4, 7, 9, 10],
    cameraAnchors: [{ x: 1250, y: 820 }, { x: 1950, y: 600 }, { x: 760, y: 1200 }]
  },
  {
    id: "iroha-mist",
    name: "Iroha Mist Pass",
    category: "mountain",
    description: "안개 낀 내리막 감성의 타이트한 리듬 코스.",
    seed: 1002,
    roadWidth: 108,
    laps: 5,
    world: { width: 2550, height: 1760 },
    theme: { sky: 0x1f2933, ground: 0x2c3e37, foliage: 0x7d9770, road: 0x384048, roadEdge: 0xb8b8aa, line: 0xe9c46a, accent: 0x9bf6ff },
    points: [
      { x: 360, y: 980 }, { x: 610, y: 410 }, { x: 1060, y: 530 }, { x: 790, y: 860 },
      { x: 1190, y: 1180 }, { x: 1640, y: 900 }, { x: 1320, y: 510 }, { x: 1830, y: 280 },
      { x: 2280, y: 740 }, { x: 2020, y: 1370 }, { x: 1410, y: 1480 }, { x: 840, y: 1320 }
    ],
    driftCorners: [1, 3, 4, 6, 8, 9],
    cameraAnchors: [{ x: 960, y: 820 }, { x: 1900, y: 780 }, { x: 1180, y: 1320 }]
  },
  {
    id: "asahi-switchbacks",
    name: "Asahi Switchbacks",
    category: "mountain",
    description: "S자 헤어핀과 긴 탈출 직선이 섞인 추월형 산길.",
    seed: 1003,
    roadWidth: 112,
    laps: 5,
    world: { width: 2640, height: 1820 },
    theme: { sky: 0x18221f, ground: 0x31462f, foliage: 0x6a994e, road: 0x33363a, roadEdge: 0xd6ccc2, line: 0xffd166, accent: 0xf77f00 },
    points: [
      { x: 260, y: 1320 }, { x: 640, y: 1480 }, { x: 760, y: 870 }, { x: 430, y: 540 },
      { x: 920, y: 270 }, { x: 1390, y: 600 }, { x: 1110, y: 1030 }, { x: 1560, y: 1390 },
      { x: 2190, y: 1280 }, { x: 2260, y: 700 }, { x: 1770, y: 370 }, { x: 2050, y: 1540 }
    ],
    driftCorners: [2, 3, 5, 6, 9, 10],
    cameraAnchors: [{ x: 760, y: 880 }, { x: 1510, y: 1060 }, { x: 2130, y: 850 }]
  },
  {
    id: "tenryu-night",
    name: "Tenryu Night Climb",
    category: "mountain",
    description: "어두운 산길과 가로등 포인트가 번갈아 나오는 야간 다운힐.",
    seed: 1004,
    roadWidth: 110,
    laps: 5,
    world: { width: 2580, height: 1780 },
    theme: { sky: 0x0d1321, ground: 0x1b2a2f, foliage: 0x4f6f52, road: 0x2a2d34, roadEdge: 0x9ca3af, line: 0xffd166, accent: 0x4cc9f0 },
    points: [
      { x: 330, y: 1190 }, { x: 410, y: 610 }, { x: 800, y: 330 }, { x: 1160, y: 720 },
      { x: 900, y: 1220 }, { x: 1390, y: 1500 }, { x: 1850, y: 1160 }, { x: 1550, y: 720 },
      { x: 1890, y: 310 }, { x: 2310, y: 760 }, { x: 2220, y: 1390 }, { x: 1160, y: 1030 }
    ],
    driftCorners: [1, 3, 4, 7, 9, 11],
    cameraAnchors: [{ x: 1040, y: 660 }, { x: 1740, y: 1110 }, { x: 2140, y: 760 }]
  },
  {
    id: "shirahama-coast",
    name: "Shirahama Coast Run",
    category: "coast",
    description: "해안선 고속 구간 뒤에 급격한 방파제 코너가 찾아온다.",
    seed: 2001,
    roadWidth: 124,
    laps: 5,
    world: { width: 2740, height: 1700 },
    theme: { sky: 0x6ec6ff, ground: 0xd8c3a5, foliage: 0x3a7d44, road: 0x3a3d42, roadEdge: 0xf1faee, line: 0xffe066, accent: 0x00b4d8 },
    points: [
      { x: 300, y: 980 }, { x: 610, y: 430 }, { x: 1160, y: 360 }, { x: 1810, y: 470 },
      { x: 2370, y: 360 }, { x: 2490, y: 860 }, { x: 2170, y: 1320 }, { x: 1610, y: 1190 },
      { x: 1080, y: 1420 }, { x: 620, y: 1280 }
    ],
    driftCorners: [1, 5, 6, 8, 9],
    cameraAnchors: [{ x: 1220, y: 420 }, { x: 2300, y: 880 }, { x: 1010, y: 1320 }]
  },
  {
    id: "umineko-bayside",
    name: "Umineko Bayside",
    category: "coast",
    description: "항구 도로와 해안 고가 사이를 오가는 와이드 코너 코스.",
    seed: 2002,
    roadWidth: 126,
    laps: 5,
    world: { width: 2700, height: 1720 },
    theme: { sky: 0x86c5da, ground: 0xc8b99a, foliage: 0x2d6a4f, road: 0x363b40, roadEdge: 0xeae2b7, line: 0xffd166, accent: 0xfcbf49 },
    points: [
      { x: 350, y: 790 }, { x: 820, y: 420 }, { x: 1330, y: 530 }, { x: 1860, y: 330 },
      { x: 2350, y: 690 }, { x: 2300, y: 1230 }, { x: 1740, y: 1380 }, { x: 1270, y: 1110 },
      { x: 780, y: 1430 }, { x: 430, y: 1190 }
    ],
    driftCorners: [1, 3, 4, 5, 8],
    cameraAnchors: [{ x: 1340, y: 520 }, { x: 2210, y: 970 }, { x: 800, y: 1280 }]
  },
  {
    id: "kibune-country",
    name: "Kibune Country Road",
    category: "country",
    description: "논밭 사이를 빠르게 달리다 좁은 마을길 헤어핀을 만난다.",
    seed: 3001,
    roadWidth: 112,
    laps: 5,
    world: { width: 2620, height: 1760 },
    theme: { sky: 0xbde0fe, ground: 0x7fb069, foliage: 0x386641, road: 0x41444a, roadEdge: 0xe9edc9, line: 0xf4d35e, accent: 0xbc6c25 },
    points: [
      { x: 310, y: 910 }, { x: 600, y: 390 }, { x: 1120, y: 460 }, { x: 1540, y: 300 },
      { x: 2200, y: 520 }, { x: 2320, y: 1040 }, { x: 1900, y: 1410 }, { x: 1340, y: 1310 },
      { x: 940, y: 1490 }, { x: 490, y: 1270 }
    ],
    driftCorners: [1, 3, 5, 6, 8, 9],
    cameraAnchors: [{ x: 1110, y: 460 }, { x: 2170, y: 900 }, { x: 870, y: 1330 }]
  },
  {
    id: "inari-farmway",
    name: "Inari Farmway",
    category: "country",
    description: "넓은 농로와 비포장 갓길이 있는 리듬감 좋은 공도.",
    seed: 3002,
    roadWidth: 118,
    laps: 5,
    world: { width: 2660, height: 1760 },
    theme: { sky: 0xa8dadc, ground: 0x90be6d, foliage: 0x31572c, road: 0x3b3f45, roadEdge: 0xfefae0, line: 0xf9c74f, accent: 0xf3722c },
    points: [
      { x: 360, y: 1160 }, { x: 520, y: 560 }, { x: 960, y: 360 }, { x: 1390, y: 720 },
      { x: 1800, y: 420 }, { x: 2330, y: 760 }, { x: 2180, y: 1340 }, { x: 1570, y: 1450 },
      { x: 1220, y: 1040 }, { x: 760, y: 1400 }
    ],
    driftCorners: [1, 3, 4, 6, 8, 9],
    cameraAnchors: [{ x: 1090, y: 700 }, { x: 2130, y: 900 }, { x: 930, y: 1300 }]
  },
  {
    id: "neon-outskirts",
    name: "Neon Outskirts",
    category: "city",
    description: "도심 외곽 네온, 고가도로, 넓은 교차로가 섞인 야간 코스.",
    seed: 4001,
    roadWidth: 132,
    laps: 5,
    world: { width: 2740, height: 1780 },
    theme: { sky: 0x101219, ground: 0x1b263b, foliage: 0x2b9348, road: 0x2f3136, roadEdge: 0xadb5bd, line: 0xf4d35e, accent: 0x06d6a0 },
    points: [
      { x: 330, y: 930 }, { x: 720, y: 420 }, { x: 1220, y: 560 }, { x: 1780, y: 310 },
      { x: 2370, y: 620 }, { x: 2390, y: 1190 }, { x: 1950, y: 1460 }, { x: 1430, y: 1180 },
      { x: 900, y: 1450 }, { x: 470, y: 1260 }
    ],
    driftCorners: [1, 3, 4, 5, 7, 8],
    cameraAnchors: [{ x: 1250, y: 570 }, { x: 2280, y: 980 }, { x: 920, y: 1310 }]
  },
  {
    id: "daikoku-afterhours",
    name: "Daikoku Afterhours",
    category: "city",
    description: "주차장 램프와 외곽순환도로를 닮은 고속 야간 배틀 코스.",
    seed: 4002,
    roadWidth: 138,
    laps: 5,
    world: { width: 2760, height: 1780 },
    theme: { sky: 0x090b10, ground: 0x202c39, foliage: 0x3a5a40, road: 0x2c2f35, roadEdge: 0xc7d2fe, line: 0xffd166, accent: 0xef476f },
    points: [
      { x: 420, y: 760 }, { x: 780, y: 330 }, { x: 1350, y: 410 }, { x: 2030, y: 300 },
      { x: 2420, y: 780 }, { x: 2190, y: 1220 }, { x: 2380, y: 1510 }, { x: 1550, y: 1390 },
      { x: 1050, y: 1160 }, { x: 600, y: 1370 }, { x: 300, y: 1080 }
    ],
    driftCorners: [1, 4, 5, 6, 8, 10],
    cameraAnchors: [{ x: 1350, y: 410 }, { x: 2260, y: 1120 }, { x: 710, y: 1200 }]
  }
];

export function getTrack(trackId: string): TrackSpec {
  return tracks.find((track) => track.id === trackId) ?? tracks[0];
}
