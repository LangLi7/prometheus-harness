# Regal: Forschen

Herausfinden, belegen, vermessen. Das Regal beantwortet: *welcher Skill für welche Art von Frage?*

## Eine Frage, eine Antwort

| Skill | Wann | Nicht wenn |
|---|---|---|
| `research` | eine Frage gegen Primärquellen, Ergebnis als Markdown | du brauchst eine Pipeline mit Review |
| `deep-research` | 13-Agenten-Pipeline, mehrere Modi (Brief, Lit-Review, Fact-Check) | eine Seite reicht |
| `agent-reach` | Recherche in Plattformen (X, Reddit, Bilibili, YouTube, GitHub …) | offenes Web genügt |
| `parallel-web` | wiederkehrende Suche, Extraktion, Monitoring über die CLI | einmalige Suche |
| `repo-digest` | ein fremdes Repo als Text-Digest in den Kontext | du willst Architektur |
| `repo-map` | Architektur als Markdown + Mermaid | du willst den Code lesen |
| `repo-reverse` | aus einem Repo einen Bau-Prompt machen | du willst es nachbauen, nicht verstehen |
| `reverse-api` | API-Verhalten aus eigenen Artefakten rekonstruieren | du willst eine fremde API nutzen |

## Wissenschaft und Belege

| Skill | Wann | Nicht wenn |
|---|---|---|
| `paper-lookup` | 18 APIs: Paper, DOI/PMID/arXiv, Open Access | du hast die PDF |
| `literature-review` | systematische/narrative Übersicht mit Suchprotokoll | eine Handvoll Quellen |
| `citation-management` | BibTeX, DOI prüfen, Metadaten | du zitierst aus dem Kopf |
| `sr-screener` | Protokoll-Screening mit zwei Reviewern und PRISMA | freie Recherche |
| `peer-review` | Gutachten mit Evidenzgrenzen | du willst selbst schreiben |
| `academic-paper` | Paper schreiben (11 Modi) | ein Abstract genügt |
| `academic-paper-reviewer` | 5-Sitz-Review-Panel | ein Reviewer reicht |
| `academic-pipeline` | Gesamtlauf Research → Write → Review → Final | eine Stufe |

## Markt und Wettbewerb

| Skill | Wann |
|---|---|
| `market-research-reports` | Marktgröße, Wettbewerb, Prognose mit Belegen |
| `competitive-landscape` | SEO-Marktführer und Themenlücken |
| `competitor-analysis` | ein Wettbewerber, organischer Fußabdruck |
| `keyword-research` | Keyword-Chancen und Metriken |
| `keyword-clustering` | Cluster nach Absicht, Seiten zuordnen |
| `local-seo` | Google-Business-Profil und Maps-Sichtbarkeit |
| `link-prospecting` | Linkziele und Outreach |
| `ai-prompt-research` | welche Fragen Menschen KI stellen |
| `ai-visibility-audit` | wie eine Marke in KI-Antworten erscheint |
| `seo-audit` | Website-Audit mit datenbelegtem Bericht |
| `seo-project-setup` / `seo-coach` / `seo-report` | Projektkontext, Erklärung, Bericht |

## Abgrenzung

`research` ist der **eine** Lauf; `deep-research` ist die **Maschine** mit Rollen und Review.
`repo-digest` liefert Text, `repo-map` liefert Struktur, `repo-reverse` liefert eine Bauanleitung —
drei Ausgaben desselben Repos, drei verschiedene Ziele.

## Bevor du recherchierst

- **Graph zuerst** bei Codefragen: `graft` oder `codebase-memory`, nicht `grep`.
- **Vault zuerst** bei Projektentscheidungen: `obsidian_search` (wenn der Vault da ist).
- **Belegpflicht**: jede Aussage mit URL; „nicht abrufbar" ist ein Ergebnis, keine Lücke.
