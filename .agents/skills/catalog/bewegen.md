# Regal: Bewegen

Motion, Video, HyperFrames, Remotion. Das Regal beantwortet: *erst die Bewegung verstehen, dann das Werkzeug, dann das Genre.*

## Gateway — immer zuerst

| Skill | Wann | Nicht wenn |
|---|---|---|
| `hyperframes` | irgendein Video mit HyperFrames (Vertrag, Arbeitsweise) | du baust eine Website-Animation |
| `hyperframes-cli` | CLI bedienen: scaffold, check, preview, render | die Arbeitsweise ist unklar |
| `hyperframes-registry` | ~450 fertige Blöcke, bevor du selbst baust | ein Block reicht nicht |
| `motion-doctrine` | GATEWAY vor jeder HyperFrames-Komposition | keine HyperFrames |
| `motion-design` | Grundprinzipien: Timing, Easing, Choreografie | das Werkzeug ist schon gewählt |
| `animation-principles` | „warum fühlt sich das falsch an" | du willst nur eine Kurve |
| `animate` | Bewegung von null entwerfen | du willst prüfen |

## Web-Motion

| Skill | Wann | Nicht wenn |
|---|---|---|
| `gsap-web` | ScrollTrigger, Pinning, SplitText, Lenis-Sync | kein GSAP |
| `motioncore` | Motion-Tokens und Hausregeln für eine Website | eine einzelne Animation |
| `motioncore-tokens` | Dauer, Easing, Staffelung in `design.md` §5 | Tokens existieren |
| `motioncore-audit` | vorhandene CSS-Bewegung prüfen | keine Website |
| `motioncore-review` | höchstens sieben konkrete Änderungen | ein Vollaudit |
| `60fps-animation` | Jank, Layout-Thrashing, `width/height` animieren | Server-Performance |
| `fixing-motion-performance` | Ruckeln, Scroll-Kopplung, Blur-Kosten | ein falscher Easing |
| `find-animation-opportunities` | wo sollte überhaupt Bewegung hin | du willst umsetzen |
| `improve-animations` | Roadmap für mehrere Stellen (plant, setzt nicht um) | eine Stelle |

## Video-Produktion

| Skill | Wann | Nicht wenn |
|---|---|---|
| `remotion-video` | React-Composition, `useCurrentFrame`, MP4-Render | HyperFrames ist der Auftrag |
| `remotion-to-hyperframes` | bestehendes Remotion/Motion-Canvas portieren | Neubau |
| `javascript-animation` | ein self-contained HTML, Frames auf Canvas | du brauchst Schnitt |
| `manim` | Mathe/Physik/CS-Animation | ein Logo-Reveal |
| `after-effects` | Expressions, MOGRT, Export-Codecs | Code gestaltet die Bewegung |
| `soundtrack` | Musik im Code erzeugen und auf Cuts legen | du hast eine Tonspur |
| `media-use` | Musik, SFX, Bilder, Icons, Voiceover beschaffen | alles liegt vor |
| `video-delivery-specs` | Plattform-Specs, Export, Safe Areas | ein Prototyp |

## Genres — je ein Skill pro Format

| Genre | Skill |
|---|---|
| Launch/Sizzle | `launch-video` |
| Erklärvideo | `explainer-video` |
| Short-form (Reels/TikTok) | `short-form-video` |
| Werbespot | `ad-creative-video` |
| Rabatt/Promo | `promo-video` |
| Testimonial/Zitat | `testimonial-video` |
| Diashow aus Fotos | `photo-slideshow` |
| Audiogramm | `audiogram` |
| Countdown | `countdown-video` |
| Jahresrückblick | `wrapped-video` |
| Changelog | `changelog-video` |
| Präsentation als Video | `presentation-video` |
| Slideshow zum Vorführen | `slideshow` |
| Lower Thirds | `lower-thirds` |
| Logo-Reveal | `logo-animation` |
| YouTube-Intro/Outro | `youtube-intro-outro` |
| Kinetische Typografie | `kinetic-typography` |
| Untertitel | `caption-animation`, `captions-overlay` |
| Schnitt und Naht | `cut-the-curve`, `seam-craft` |
| Textnachrichten | `text-message-animation` |
| Infografik | `animated-infographic` |
| Diagramm | `diagram-animation` |
| Chart/Bar-Race | `chart-animation` |
| Karte | `map-animation` |
| Whiteboard | `whiteboard-animation` |
| ASCII | `ascii-animation` |
| Isometrie | `isometric-animation` |
| Partikel/Hintergrund | `particle-system`, `motion-background` |
| Farbverlauf | `color-motion` |
| Schnitt auf Beat | `beat-sync-editing` |
| Bildkomposition | `shot-composition` |
| Talking Head | `talking-head`, `talking-head-b-roll` |
| Projekt-Pitch | `brag`, `brag-slim` |

## Fertige Blöcke — nicht selbst bauen

`canopy-part-title`, `code-slice-hero`, `cuboid-carousel`, `frost-sequence-camera-orbit`,
`glass-shard-title`, `orbit-card`, `oversized-cursor`, `wireframe-portal-title`.

Erst `hyperframes-registry` fragen, dann eines dieser Blöcke nehmen, bevor du die Bewegung neu erfindest.

## 3D, Shader, Zeichnung

| Skill | Wann |
|---|---|
| `threejs-scene-setup` | Szene, Kamera, Renderer, Loop |
| `threejs-gltf-loading` | GLB/glTF, AnimationMixer, DRACO |
| `threejs-materials-lighting` | PBR, Licht, Schatten, EnvMap |
| `threejs-animation` | Kamera, Clips, Instancing, Post-Processing |
| `shader-glsl` / `shader-programming` | Fragment/Vertex, Noise, SDF, Effekte |
| `svg-animation` | Draw-on, Morph, Pfad, Icon |
| `lottie-animation` | Lottie/dotLottie einbinden und steuern |

## Reihenfolge, die den Unterschied macht

`hyperframes` → `motion-doctrine` → Genre-Skill → `seam-craft` (Nahtstellen) → `video-delivery-specs`.
Wer beim Genre anfängt, baut Szenen, die einzeln gut und zusammen falsch sind.
