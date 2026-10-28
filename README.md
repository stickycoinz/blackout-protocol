# BLACKOUT PROTOCOL

A 2v2 Spies vs Mercs-style night-ops browser game for playing with friends, built on top of
[Riposte: Frontline](https://github.com/BenDBSS/Riposte-Frontline-Source) (MIT).

Spies sneak through the dark, hack terminals and extract; Mercs hunt them with flashlights and armor.

## ▶ Play

**https://stickycoinz.github.io/blackout-protocol/**

Nothing to install: open the link in Chrome, Edge or Firefox on a desktop.

1. Click **PLAY**, pick Merc or Spy.
2. **Solo vs Bots** to practice, or **Host Room** to play online.
3. The host shares the room code; friends open the same link and use **Join by Code**.
4. The host's editor settings (lighting, look, guns, spy kit, gameplay) are sent to everyone when the match starts.

## Controls (defaults, rebindable in Options → Controls, including mouse buttons)

| Shared | |
|---|---|
| W A S D | Move |
| Space | Jump (spy: vault / climb / hang) |
| C | Crouch (spy: drop from ledge) |
| Left click / Right click | Fire / Aim |
| R | Reload |
| T | Chat (online) |
| Esc | Pause |
| F9 | Loadout screen |
| F10 | In-game editor |

| Merc | | Spy | |
|---|---|---|---|
| 1 / 2 / Q / wheel | Switch weapon | E (hold) | Hack terminal / extract |
| L | Flashlight | F or click | Takedown (from behind) |
| F | Knife | Left Alt | Roll (brief invulnerability) |
| G | Grenade | G | Smoke bomb |
| E | Pick up weapon | Q | Flashbang |
| I | Inspect weapon | X | Throwing knife |
| | | V | Decoy |

Crouching still in the dark activates the spy's shadow cloak. Street lamps can be shot out.

## Building from source

```bash
python3 build.py      # assembles dist/riposte-frontline.html and assets
```

Serve `dist/` with any static web server. BLACKOUT's own code lives in `src/*blackout*.js`.

## Credits & licenses

- Game engine and code: **Riposte: Frontline** by BenDBSS — https://github.com/BenDBSS/Riposte-Frontline-Source, MIT License
  (see `LICENSE`). Some upstream items are *not* MIT (name/logo, music, soldier animations, some sounds) — see `NOTICE.md`.
  The original upstream README is kept as `README_RIPOSTE.md`.
- Spy character and animations: **Quaternius Universal Animation Library** (CC0) — https://quaternius.com
- BLACKOUT PROTOCOL is a fan project for playing with friends; it is not the official Riposte: Frontline game.
