# Codex Chat Split

Use one chat per ownership area. The goal is to keep each thread's memory coherent and avoid mixing balance, art, and deployment decisions.

## 00-총괄-프로듀서

Owns roadmap, milestones, acceptance criteria, release readiness, and final integration decisions. This chat should keep the current build status, top risks, and next milestone checklist.

## 01-게임룰-밸런스

Owns participant flow, coffee-buyer rule, SP gain, item effects, car stat ranges, comeback pressure, and race duration. Any change that affects fairness should be decided here first.

## 02-레이스메커니즘

Owns AI driving, path following, drift detection, speed model, hazard interactions, and broadcast camera selection. This chat should validate that race behavior still feels dynamic after each mechanics change.

## 03-차량리소스

Owns car roster, fictional names, color palettes, sprite direction, stat identity, and future vehicle additions. This chat should avoid real brand logos and protected car names.

## 04-맵-배경리소스

Owns the 10 map themes, route point data, drift corner placement, background objects, road readability, and future course additions.

## 05-프론트-UI

Owns title, setup, HUD, leaderboard, result screen, responsive layout, and Korean copy. This chat should check that controls fit on mobile and desktop.

## 06-빌드-배포-QA

Owns Vite config, GitHub Pages workflow, build health, browser smoke tests, and release checklists.

## Handoff Rule

When a thread changes behavior owned by another thread, leave a short note in `docs/qa-checklist.md` or the producer chat with the changed behavior, expected impact, and test scenario.
