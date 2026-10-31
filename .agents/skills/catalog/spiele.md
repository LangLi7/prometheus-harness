# Regal: Spiele

Engine, Genre, Assets. Das Regal beantwortet: *welche Engine, welches Genre-Skill, welcher Unterbau?*

## Zuerst der Router

| Skill | Wann |
|---|---|
| `router` | irgendein Spiel-Auftrag: erkennt die Engine und liest den passenden Skill |
| `game-jam` | Zeitdruck, Scope auf die Uhr schneiden |
| `prototype-fast` | in einer Stunde prüfen, ob es Spaß macht |

## Engines — ein Satz pro Familie

| Engine | Einstieg | Unterbau |
|---|---|---|
| **Godot 4.7** | `godot-nodes-scenes` | `godot-gdscript`, `godot-physics`, `godot-animation`, `godot-ui-control`, `godot-2d-movement`, `godot-3d-essentials`, `godot-audio`, `godot-multiplayer`, `godot-resources`, `godot-shaders`, `godot-tilemap`, `godot-export`, `godot-csharp`, `godot-gdscript-headless-testing` |
| **Unity 6.3 LTS** | `unity-csharp-scripting` | `unity-input-system`, `unity-physics`, `unity-animation`, `unity-navmesh`, `unity-tilemap-2d`, `unity-scriptableobjects`, `unity-build-pipeline` |
| **Unreal 5** | `unreal-cpp-gameplay` | `unreal-blueprints`, `unreal-enhanced-input`, `unreal-behavior-trees`, `unreal-niagara`, `unreal-packaging` |
| **Roblox** | `roblox-luau` | `roblox-studio-workflow`, `roblox-physics`, `roblox-networking`, `roblox-datastores`, `roblox-ui`, `roblox-characters` |
| **Web/2D** | `phaser-core` | `phaser-arcade-physics`, `pixijs-rendering`, `threejs-scene-setup` |
| **Klein/Code** | `love2d-core`, `pygame-core`, `ebitengine-game`, `bevy-ecs` | — |

## Genres

`platformer`, `fps-shooter`, `roguelike`, `rpg`, `card-game`, `puzzle`, `tower-defense`,
`survival-crafting`, `visual-novel`.

## Unterbau — unabhängig von der Engine

| Skill | Wann |
|---|---|
| `game-feel` | Screen Shake, Hit-Stop, Squash, Juice |
| `game-ai` | FSM, Behavior Tree, Steering, A* |
| `ai-behavior-trees-utility-ai` | BT + Utility AI als Runtime |
| `game-ui-ux` | HUD, Menü, Fokus, Safe Areas |
| `level-design` | Blockout, Pacing, kritischer Pfad |
| `procedural-gen` | Seed, Noise, Dungeon, Loot |
| `dialogue-systems` | Verzweigung, Bedingungen, Ink/Yarn |
| `save-systems` | Slots, atomares Schreiben, Migration |
| `input-systems` | Aktionen, Rebinding, Deadzone, Coyote Time |
| `audio-design` | Busse, Ducking, adaptive Musik |
| `physics-tuning` | Fixed Timestep, CCD, Jitter |
| `camera-systems` | Deadzone, Look-ahead, Kollision |
| `performance-optimization` | Profiler, Pooling, Draw Calls, GC |
| `create-game-assets` | Art Direction, Sprites, Tilesets, Icons |
| `shader-programming` | 2D/3D-Effekte engine-neutral |

## Ausliefern

| Skill | Wann |
|---|---|
| `itch-publish` | itch.io mit butler, Channels |
| `steam-publish` | Steamworks, SteamPipe, Depot |

## Abgrenzung

`game-ai` ist die **Lehre**, `ai-behavior-trees-utility-ai` ist die **Runtime**. Wer eine Engine
schon hat, nimmt deren Skill (`unreal-behavior-trees`) statt des engine-neutralen.
`router` entscheidet das, nicht du.
