# Regal: Gestalten

Oberfläche, Design-System, Barrierefreiheit. Das Regal beantwortet: *welcher Skill entscheidet über Aussehen und Bedienung?*

## Richtung und Geschmack

| Skill | Wann | Nicht wenn |
|---|---|---|
| `design-taste-frontend` | Landingpage, Marketingseite, Redesign, „sieht billig aus" | nur ein Button-Fehler |
| `upstream-design-taste-frontend` | die unveränderte Herkunft derselben Fassung | du willst die lokale Anpassung |
| `impeccable` | ganze Oberfläche prüfen: Hierarchie, Zustände, UX-Text, Randfälle | ein einzelner Abstand |
| `baseline-ui` | schneller Polish-Durchgang: Abstände, Typografie, Hierarchie | ein neues Design entsteht |
| `frontend-design` | ästhetische Richtung für neues UI | das Design steht |
| `high-end-visual-design` | „soll teuer aussehen", Agentur-Niveau | ein internes Tool |
| `redesign-existing-projects` | bestehende Seite aufwerten, ohne Funktion zu brechen | Neubau |
| `emil-design-eng` | Feinschliff-Philosophie (Bewegung, Details) | eine Strukturfrage |

## Prüfen und vereinheitlichen

| Skill | Wann | Nicht wenn |
|---|---|---|
| `web-design-guidelines` | Prüfung gegen Web-Interface-Richtlinien | du willst umbauen |
| `userinterface-wiki` | Review mit `datei:zeile`-Befunden über 11 Kategorien | ein Einzelfall |
| `improve-ui` | Audit **ohne** Identitätswechsel, Pläne für andere Agenten | du willst selbst umsetzen |
| `ui-skills-root` | kleinster nötiger UI-Kontext vor UI-Arbeit | der Kontext steht |
| `create-design-md` | DESIGN.md aus bestehendem Produkt ableiten | du willst DESIGN.md schreiben |
| `design-system-baseline` | Pflichtvorgaben: Farben, design.md, Palette | kein Website-Projekt |

## Barrierefreiheit und Metadaten

| Skill | Wann | Nicht wenn |
|---|---|---|
| `fixing-accessibility` | ARIA, Fokus, Kontrast, Formularfehler | nur eine Farbe |
| `fixing-metadata` | Titel, Description, Canonical, Open Graph, JSON-LD | kein Webangebot |
| `accessible-animation` | `prefers-reduced-motion`, WCAG 2.3.3 | keine Bewegung |

## Bausteine, Werkzeuge, Figma

| Skill | Wann | Nicht wenn |
|---|---|---|
| `figma` | Figma als Motion-Quelle in einem Video | du willst das Design ändern |
| `figma-use` | Schreibzugriff im Figma-Dokument (Pflicht vorher) | nur lesen |
| `component-canvas` | Komponenten und Varianten räumlich erkunden | nur eine Komponente |
| `create-canvas` | freie Fläche zum Vergleichen und Iterieren | ein Dokument reicht |
| `glassmorphism` | Glas-Effekt, Frosted Panels | Standard-UI |
| `transitions-dev` | Übergänge für Badges, Modals, Drawer, Seiten | ganze Choreografie |
| `micro-interaction` | Hover, Toggle, Like-Button, Drawer, Listen-Umbau | Seitenübergang |
| `page-transition-animation` | Routenwechsel, View Transitions API | Komponenten-Zustand |

## Abgrenzung in einem Satz

`design-taste-frontend` entscheidet **die Richtung**, `baseline-ui` räumt **schnell auf**,
`impeccable` prüft **die ganze Fläche**, `improve-ui` schreibt **Pläne statt Code**.
Wer bei „mach das schöner" sofort `impeccable` lädt, überspringt die Richtungsentscheidung.
