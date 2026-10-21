/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/git/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/git/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/git",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var __defProp = Object.defineProperty;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		function __accessProp(key) {
		  return this[key];
		}
		var __toCommonJS = (from) => {
		  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
		  if (entry)
		    return entry;
		  entry = __defProp({}, "__esModule", { value: true });
		  if (from && typeof from === "object" || typeof from === "function") {
		    for (var key of __getOwnPropNames(from))
		      if (!__hasOwnProp.call(entry, key))
		        __defProp(entry, key, {
		          get: __accessProp.bind(from, key),
		          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		        });
		  }
		  __moduleCache.set(from, entry);
		  return entry;
		};
		var __moduleCache;
		var __returnValue = (v) => v;
		function __exportSetter(name, newValue) {
		  this[name] = __returnValue.bind(null, newValue);
		}
		var __export = (target, all) => {
		  for (var name in all)
		    __defProp(target, name, {
		      get: all[name],
		      enumerable: true,
		      configurable: true,
		      set: __exportSetter.bind(all, name)
		    });
		};

		// packages/plugin/git/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  GitPanel: () => GitPanel,
		  PANEL_ID: () => PANEL_ID,
		  TAB_ID: () => TAB_ID,
		  TAB_KIND: () => TAB_KIND,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");

		// packages/plugin/git/src/locales.ts
		var DE = {
		  panel: "Git",
		  title: "Überprüfung",
		  guide: "Repostand, Änderungen und Commits je Workspace",
		  refresh: "Aktualisieren",
		  close: "Schließen",
		  loading: "Lese Repositories …",
		  error: "Fehler",
		  retry: "Nochmal",
		  noRepo: "Kein Repository",
		  noWorkspaces: "Keine Workspaces eingerichtet.",
		  clean: "Sauber",
		  changed: "geändert",
		  staged: "Bereitgestellt",
		  unstaged: "Arbeitsbaum",
		  untracked: "Unversioniert",
		  commits: "Letzte Commits",
		  remote: "Remote",
		  cloud: "Cloud",
		  pulls: "Pull Requests",
		  issues: "Issues",
		  cloudLoading: "Frage Anbieter …",
		  noToken: "Kein Token",
		  actions: "Aktionen",
		  stage: "Alle bereitstellen",
		  unstage: "Zurücknehmen",
		  commit: "Committen",
		  message: "Nachricht",
		  fetch: "Fetch",
		  pull: "Pull",
		  push: "Push",
		  working: "Git changes",
		  branch: "Branch changes",
		  round: "Letzte Runde",
		  unified: "Vereinheitlicht",
		  split: "Geteilt",
		  expandAll: "Alle erweitern",
		  collapseAll: "Alle einklappen",
		  noChanges: "Keine Änderungen",
		  loadingDiff: "Lade Diff …",
		  diffError: "Diff nicht lesbar",
		  binary: "Binär — kein Textvergleich",
		  truncated: "Nur ein Ausschnitt",
		  unknown: "Unbekannt",
		  ahead: "voraus",
		  behind: "zurück",
		  basis: "Vergleich",
		  actionOk: "Fertig",
		  actionFail: "Fehlgeschlagen",
		  files: "Dateien",
		  cloudHint: "Pull Requests und Issues werden nur gelesen — ein Klick öffnet die Weboberfläche.",
		  providerUnknown: "Anbieter unbekannt",
		  gitMissing: "git ist auf diesem Host nicht auffindbar.",
		  added: "Hinzugefügt",
		  modified: "Geändert",
		  deleted: "Gelöscht",
		  renamed: "Umbenannt",
		  copied: "Kopiert",
		  typechange: "Typwechsel",
		  conflict: "Konflikt",
		  commitPlaceholder: "Commit-Nachricht …",
		  onlyTwenty: "Nur die ersten 20 Dateien wurden geöffnet.",
		  truncatedList: "Liste gekürzt",
		  workspace: "Workspace",
		  noRepoShort: "kein Repo"
		};
		var EN = {
		  panel: "Git",
		  title: "Review",
		  guide: "Repository state, changes and commits per workspace",
		  refresh: "Refresh",
		  close: "Close",
		  loading: "Reading repositories …",
		  error: "Error",
		  retry: "Retry",
		  noRepo: "No repository",
		  noWorkspaces: "No workspaces configured.",
		  clean: "Clean",
		  changed: "changed",
		  staged: "Staged",
		  unstaged: "Working tree",
		  untracked: "Untracked",
		  commits: "Recent commits",
		  remote: "Remote",
		  cloud: "Cloud",
		  pulls: "Pull requests",
		  issues: "Issues",
		  cloudLoading: "Asking provider …",
		  noToken: "No token",
		  actions: "Actions",
		  stage: "Stage all",
		  unstage: "Unstage",
		  commit: "Commit",
		  message: "Message",
		  fetch: "Fetch",
		  pull: "Pull",
		  push: "Push",
		  working: "Git changes",
		  branch: "Branch changes",
		  round: "Last run",
		  unified: "Unified",
		  split: "Split",
		  expandAll: "Expand all",
		  collapseAll: "Collapse all",
		  noChanges: "No changes",
		  loadingDiff: "Loading diff …",
		  diffError: "Diff unreadable",
		  binary: "Binary — no text comparison",
		  truncated: "Excerpt only",
		  unknown: "Unknown",
		  ahead: "ahead",
		  behind: "behind",
		  basis: "Compared with",
		  actionOk: "Done",
		  actionFail: "Failed",
		  files: "files",
		  cloudHint: "Pull requests and issues are read-only — a click opens the web UI.",
		  providerUnknown: "Unknown provider",
		  gitMissing: "git is not available on this host.",
		  added: "Added",
		  modified: "Modified",
		  deleted: "Deleted",
		  renamed: "Renamed",
		  copied: "Copied",
		  typechange: "Type changed",
		  conflict: "Conflict",
		  commitPlaceholder: "Commit message …",
		  onlyTwenty: "Only the first 20 files were opened.",
		  truncatedList: "List truncated",
		  workspace: "Workspace",
		  noRepoShort: "no repo"
		};

		// packages/plugin/git/src/index.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "git";
		var TAB_ID = "@prometheus-harness/git";
		var TAB_KIND = "pmh-git";
		var NS = "git";
		var WEG_STAND = "/api/pmh/git/stand";
		var WEG_DIFF = "/api/pmh/git/diff";
		var WEG_AKTION = "/api/pmh/git/aktion";
		var WEG_FERN = "/api/pmh/git/fern";
		var inject = ["slots", "locale", "layout", "sidebarRightTabs"];
		var MODI = ["arbeitsbaum", "zweig", "letzte-runde"];
		function schluessel(workspace, aenderung) {
		  return `${workspace}|${aenderung.bereich}|${aenderung.pfad}`;
		}
		function zahl(wert) {
		  return wert === null ? "·" : String(wert);
		}
		function statuswort(status, t) {
		  switch (status) {
		    case "hinzugefuegt":
		      return t("added");
		    case "geaendert":
		      return t("modified");
		    case "geloescht":
		      return t("deleted");
		    case "umbenannt":
		      return t("renamed");
		    case "kopiert":
		      return t("copied");
		    case "typwechsel":
		      return t("typechange");
		    case "konflikt":
		      return t("conflict");
		    case "unversioniert":
		      return t("untracked");
		    default:
		      return t("unknown");
		  }
		}
		function statusklasse(status) {
		  if (status === "hinzugefuegt" || status === "unversioniert")
		    return "is-neu";
		  if (status === "geloescht")
		    return "is-weg";
		  if (status === "konflikt")
		    return "is-konflikt";
		  if (status === "umbenannt" || status === "kopiert")
		    return "is-verschoben";
		  return "is-geaendert";
		}
		function kuerzel(pfad) {
		  const name = pfad.split("/").pop() ?? pfad;
		  const punkt = name.lastIndexOf(".");
		  if (punkt <= 0)
		    return name.slice(0, 2).toUpperCase();
		  const endung = name.slice(punkt + 1).toLowerCase();
		  const karte = {
		    ts: "TS",
		    tsx: "TS",
		    mts: "TS",
		    js: "JS",
		    jsx: "JS",
		    mjs: "JS",
		    json: "{}",
		    md: "MD",
		    go: "GO",
		    rs: "RS",
		    py: "PY",
		    css: "{}",
		    scss: "{}",
		    html: "<>",
		    svg: "<>",
		    yml: "YML",
		    yaml: "YML",
		    toml: "TML",
		    lock: "LCK",
		    txt: "TXT",
		    png: "IMG",
		    jpg: "IMG",
		    jpeg: "IMG",
		    webp: "IMG",
		    gif: "IMG",
		    sh: "SH",
		    ps1: "PS"
		  };
		  return karte[endung] ?? endung.slice(0, 3).toUpperCase();
		}
		function farbton(pfad) {
		  let summe = 0;
		  for (const zeichen of pfad)
		    summe = (summe + zeichen.codePointAt(0)) % 6;
		  return ["a", "b", "c", "d", "e", "f"][summe] ?? "a";
		}
		function paare(hunk) {
		  const aus = [];
		  const zeilen = hunk.zeilen;
		  let i = 0;
		  while (i < zeilen.length) {
		    const zeile = zeilen[i];
		    if (zeile === undefined)
		      break;
		    if (zeile.art === "kontext") {
		      aus.push({ links: zeile, rechts: zeile });
		      i += 1;
		      continue;
		    }
		    const minus = [];
		    while (i < zeilen.length && zeilen[i]?.art === "minus") {
		      const wert = zeilen[i];
		      if (wert !== undefined)
		        minus.push(wert);
		      i += 1;
		    }
		    const plus = [];
		    while (i < zeilen.length && zeilen[i]?.art === "plus") {
		      const wert = zeilen[i];
		      if (wert !== undefined)
		        plus.push(wert);
		      i += 1;
		    }
		    const anzahl = Math.max(minus.length, plus.length);
		    for (let k = 0;k < anzahl; k += 1) {
		      aus.push({ links: minus[k] ?? null, rechts: plus[k] ?? null });
		    }
		    if (anzahl === 0)
		      i += 1;
		  }
		  return aus;
		}
		function GitIcon({ size = 16 }) {
		  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
		    "aria-hidden": "true",
		    width: size,
		    height: size,
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.4",
		    strokeLinecap: "round",
		    strokeLinejoin: "round",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "6",
		        cy: "6",
		        r: "2.3"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "6",
		        cy: "18",
		        r: "2.3"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "18",
		        cy: "9",
		        r: "2.3"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M6 8.3v7.4"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M8.3 6h3.1a2 2 0 0 1 2 2v.7"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M15.7 9h-1.9"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M8.3 18h3.1a2 2 0 0 0 2-2v-4.7"
		      })
		    ]
		  });
		}
		function Workspacekarte({
		  ws,
		  schmal,
		  mitKopf,
		  offen,
		  diffs,
		  ladend,
		  ansicht,
		  nachricht,
		  arbeitet,
		  fern,
		  fernLaden,
		  onOeffne,
		  onAktion,
		  onFern,
		  onNachricht,
		  t
		}) {
		  const repo = ws.repo;
		  const busy = arbeitet === ws.id;
		  return /* @__PURE__ */ jsx_runtime.jsxs("section", {
		    className: "pmh-git__karte",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-git__kopf",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__kopftext",
		            children: [
		              mitKopf ? /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                className: "pmh-git__titel",
		                children: ws.titel
		              }) : null,
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__pfad",
		                title: ws.pfad,
		                children: repo?.wurzel ?? ws.pfad
		              })
		            ]
		          }),
		          repo !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__zweig",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__chip",
		                title: repo.basis === null ? undefined : `${t("basis")}: ${repo.basis}`,
		                children: repo.zweig.name ?? "HEAD"
		              }),
		              repo.zweig.voraus > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                className: "pmh-git__ab",
		                title: `${String(repo.zweig.voraus)} ${t("ahead")}`,
		                children: [
		                  "↑",
		                  repo.zweig.voraus
		                ]
		              }),
		              repo.zweig.zurueck > 0 && /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                className: "pmh-git__ab is-zurueck",
		                title: `${String(repo.zweig.zurueck)} ${t("behind")}`,
		                children: [
		                  "↓",
		                  repo.zweig.zurueck
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: `pmh-git__zustand${repo.aenderungenGesamt === 0 ? " is-sauber" : ""}`,
		                children: repo.aenderungenGesamt === 0 ? t("clean") : `${String(repo.aenderungenGesamt)} ${t("changed")}`
		              })
		            ]
		          })
		        ]
		      }),
		      ws.hinweis !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-git__leer",
		        children: ws.hinweis
		      }),
		      repo === null && ws.hinweis === undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-git__leer",
		        children: t("noRepo")
		      }),
		      repo !== null && /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__liste",
		            children: [
		              repo.aenderungen.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-git__leer",
		                children: t("noChanges")
		              }),
		              repo.aenderungen.map((aenderung) => {
		                const key = schluessel(ws.id, aenderung);
		                const istOffen = offen.includes(key);
		                const diff = diffs[key];
		                const laedt = ladend.includes(key);
		                return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                  className: "pmh-git__datei",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime.jsxs("button", {
		                      type: "button",
		                      className: `pmh-git__zeile${istOffen ? " is-offen" : ""}`,
		                      onClick: () => onOeffne(ws, aenderung),
		                      title: aenderung.altpfad === undefined ? aenderung.pfad : `${aenderung.altpfad} → ${aenderung.pfad}`,
		                      children: [
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          className: `pmh-git__kuerzel pmh-git__kuerzel--${farbton(aenderung.pfad)}`,
		                          children: kuerzel(aenderung.pfad)
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                          className: "pmh-git__dateipfad",
		                          children: [
		                            aenderung.pfad,
		                            aenderung.altpfad !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("em", {
		                              className: "pmh-git__alt",
		                              children: [
		                                " ← ",
		                                aenderung.altpfad
		                              ]
		                            })
		                          ]
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          className: `pmh-git__status ${statusklasse(aenderung.status)}`,
		                          children: statuswort(aenderung.status, t)
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                          className: "pmh-git__zahlen",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsxs("b", {
		                              className: "is-plus",
		                              children: [
		                                "+",
		                                zahl(aenderung.zusatz)
		                              ]
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsxs("i", {
		                              className: "is-minus",
		                              children: [
		                                "−",
		                                zahl(aenderung.abzug)
		                              ]
		                            })
		                          ]
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          className: `pmh-git__pfeil${istOffen ? " is-offen" : ""}`,
		                          "aria-hidden": "true",
		                          children: "›"
		                        })
		                      ]
		                    }),
		                    istOffen && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                      className: "pmh-git__diff",
		                      children: [
		                        laedt && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                          className: "pmh-git__leer",
		                          children: t("loadingDiff")
		                        }),
		                        !laedt && diff === undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                          className: "pmh-git__leer",
		                          children: t("diffError")
		                        }),
		                        !laedt && diff !== undefined && /* @__PURE__ */ jsx_runtime.jsx(Diffblock, {
		                          diff,
		                          ansicht,
		                          t
		                        })
		                      ]
		                    })
		                  ]
		                }, key);
		              })
		            ]
		          }),
		          repo.hinweis !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-git__hinweis",
		            children: repo.hinweis
		          }),
		          repo.gekuerzt && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		            className: "pmh-git__hinweis",
		            children: [
		              t("truncatedList"),
		              " — ",
		              String(repo.aenderungen.length),
		              " / ",
		              String(repo.aenderungenGesamt)
		            ]
		          }),
		          !schmal && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__spalten",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-git__spalte",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h4", {
		                    className: "pmh-git__ueberschrift",
		                    children: t("commits")
		                  }),
		                  repo.commits.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                    className: "pmh-git__leer",
		                    children: t("noChanges")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                    className: "pmh-git__commits",
		                    children: repo.commits.slice(0, 5).map((commit) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                      children: [
		                        /* @__PURE__ */ jsx_runtime.jsx("code", {
		                          children: commit.hash
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          className: "pmh-git__betreff",
		                          children: commit.betreff
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          className: "pmh-git__autor",
		                          children: commit.autor
		                        })
		                      ]
		                    }, commit.voll))
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-git__spalte",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h4", {
		                    className: "pmh-git__ueberschrift",
		                    children: t("remote")
		                  }),
		                  repo.remotes.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                    className: "pmh-git__leer",
		                    children: t("noRepo")
		                  }),
		                  repo.remotes.map((remote) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                    className: "pmh-git__remote",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        className: "pmh-git__anbieter",
		                        children: remote.anbieter === "unbekannt" ? t("providerUnknown") : remote.anbieter
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        className: "pmh-git__remotename",
		                        children: remote.name
		                      }),
		                      remote.webUrl !== null ? /* @__PURE__ */ jsx_runtime.jsxs("a", {
		                        className: "pmh-git__link",
		                        href: remote.webUrl,
		                        target: "_blank",
		                        rel: "noreferrer",
		                        children: [
		                          remote.eigner ?? "",
		                          "/",
		                          remote.repo ?? ""
		                        ]
		                      }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        className: "pmh-git__remotepfad",
		                        children: remote.host === "" ? remote.url : `${remote.host}/${remote.repo ?? ""}`
		                      })
		                    ]
		                  }, remote.name)),
		                  repo.remotes.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn pmh-git__btn--cloud",
		                    onClick: () => onFern(ws),
		                    disabled: fernLaden,
		                    children: fernLaden ? t("cloudLoading") : t("cloud")
		                  }),
		                  fern !== undefined && /* @__PURE__ */ jsx_runtime.jsx(Fernblock, {
		                    fern,
		                    t
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__aktionen",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("h4", {
		                className: "pmh-git__ueberschrift",
		                children: t("actions")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-git__aktionszeile",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn",
		                    onClick: () => onAktion(ws, "stage"),
		                    disabled: busy,
		                    children: t("stage")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn",
		                    onClick: () => onAktion(ws, "fetch"),
		                    disabled: busy,
		                    children: t("fetch")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn",
		                    onClick: () => onAktion(ws, "pull"),
		                    disabled: busy,
		                    children: t("pull")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn",
		                    onClick: () => onAktion(ws, "push"),
		                    disabled: busy,
		                    children: t("push")
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-git__commit",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("input", {
		                    className: "pmh-git__feld",
		                    value: nachricht,
		                    placeholder: t("commitPlaceholder"),
		                    onChange: (ereignis) => onNachricht(ws, ereignis.target.value),
		                    onKeyDown: (ereignis) => {
		                      if (ereignis.key === "Enter" && !ereignis.shiftKey) {
		                        ereignis.preventDefault();
		                        onAktion(ws, "commit", { nachricht });
		                      }
		                    }
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    className: "pmh-git__btn pmh-git__btn--stark",
		                    onClick: () => onAktion(ws, "commit", { nachricht }),
		                    disabled: busy || nachricht.trim() === "",
		                    children: t("commit")
		                  })
		                ]
		              })
		            ]
		          })
		        ]
		      })
		    ]
		  });
		}
		function Fernblock({ fern, t }) {
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-git__fern",
		    children: [
		      fern.hinweis !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-git__leer",
		        children: fern.hinweis
		      }),
		      fern.pulls.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("h5", {
		            className: "pmh-git__ueberschrift",
		            children: t("pulls")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("ul", {
		            className: "pmh-git__fernliste",
		            children: fern.pulls.map((posten) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		              children: /* @__PURE__ */ jsx_runtime.jsxs("a", {
		                href: posten.url,
		                target: "_blank",
		                rel: "noreferrer",
		                children: [
		                  "#",
		                  posten.nummer,
		                  " ",
		                  posten.titel
		                ]
		              })
		            }, `p${String(posten.nummer)}`))
		          })
		        ]
		      }),
		      fern.issues.length > 0 && /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("h5", {
		            className: "pmh-git__ueberschrift",
		            children: t("issues")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("ul", {
		            className: "pmh-git__fernliste",
		            children: fern.issues.map((posten) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		              children: /* @__PURE__ */ jsx_runtime.jsxs("a", {
		                href: posten.url,
		                target: "_blank",
		                rel: "noreferrer",
		                children: [
		                  "#",
		                  posten.nummer,
		                  " ",
		                  posten.titel
		                ]
		              })
		            }, `i${String(posten.nummer)}`))
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-git__klein",
		        children: t("cloudHint")
		      })
		    ]
		  });
		}
		function Diffblock({
		  diff,
		  ansicht,
		  t
		}) {
		  if (diff.hinweis !== undefined && diff.hunks.length === 0) {
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-git__leer",
		      children: diff.hinweis
		    });
		  }
		  if (diff.binaer)
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-git__leer",
		      children: t("binary")
		    });
		  if (diff.hunks.length === 0)
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-git__leer",
		      children: t("noChanges")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-git__diffrumpf",
		    children: [
		      diff.abgeschnitten && /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-git__hinweis",
		        children: t("truncated")
		      }),
		      diff.hunks.map((hunk, hunkIndex) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-git__hunk",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("div", {
		            className: "pmh-git__hunkkopf",
		            children: hunk.kopf
		          }),
		          ansicht === "unified" ? hunk.zeilen.map((zeile, index) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: `pmh-git__dzeile is-${zeile.art}`,
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__nr",
		                children: zeile.alt === null ? "" : String(zeile.alt)
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__nr",
		                children: zeile.neu === null ? "" : String(zeile.neu)
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__zeichen",
		                children: zeile.art === "plus" ? "+" : zeile.art === "minus" ? "−" : " "
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__dtext",
		                children: zeile.text
		              })
		            ]
		          }, String(index))) : paare(hunk).map((paar, index) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__paar",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: `pmh-git__seite${paar.links?.art === "minus" ? " is-minus" : ""}`,
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-git__nr",
		                    children: paar.links?.alt === null || paar.links === null ? "" : String(paar.links.alt)
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-git__dtext",
		                    children: paar.links?.text ?? ""
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: `pmh-git__seite${paar.rechts?.art === "plus" ? " is-plus" : ""}`,
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-git__nr",
		                    children: paar.rechts?.neu === null || paar.rechts === null ? "" : String(paar.rechts.neu)
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-git__dtext",
		                    children: paar.rechts?.text ?? ""
		                  })
		                ]
		              })
		            ]
		          }, String(index)))
		        ]
		      }, `${String(hunkIndex)}-${hunk.kopf}`))
		    ]
		  });
		}
		function GitPanel({ close, t }) {
		  const [stand, setStand] = import_react.useState(null);
		  const [laden, setLaden] = import_react.useState(true);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [neu, setNeu] = import_react.useState(0);
		  const [modus, setModus] = import_react.useState("arbeitsbaum");
		  const [ansicht, setAnsicht] = import_react.useState("unified");
		  const [offen, setOffen] = import_react.useState([]);
		  const [diffs, setDiffs] = import_react.useState({});
		  const [ladend, setLadend] = import_react.useState([]);
		  const [nachrichten, setNachrichten] = import_react.useState({});
		  const [meldung, setMeldung] = import_react.useState(null);
		  const [arbeitet, setArbeitet] = import_react.useState(null);
		  const [fern, setFern] = import_react.useState({});
		  const [fernLaden, setFernLaden] = import_react.useState([]);
		  const [gewaehlt, setGewaehlt] = import_react.useState(null);
		  const [breite, setBreite] = import_react.useState(1000);
		  const rahmen = import_react.useRef(null);
		  import_react.useEffect(() => {
		    const element = rahmen.current;
		    if (element === null)
		      return;
		    const beobachter = new ResizeObserver((eintraege) => {
		      const erster = eintraege[0];
		      if (erster !== undefined)
		        setBreite(erster.contentRect.width);
		    });
		    beobachter.observe(element);
		    return () => {
		      beobachter.disconnect();
		    };
		  }, []);
		  const schmal = breite < 520;
		  import_react.useEffect(() => {
		    if (stand === null)
		      return;
		    const liste = stand.workspaces;
		    if (liste.length === 0) {
		      setGewaehlt(null);
		      return;
		    }
		    if (gewaehlt !== null && liste.some((eintrag) => eintrag.id === gewaehlt))
		      return;
		    const mitRepo = liste.find((eintrag) => eintrag.repo !== null);
		    setGewaehlt(mitRepo?.id ?? liste[0]?.id ?? null);
		  }, [stand, gewaehlt]);
		  import_react.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    setFehler(null);
		    setDiffs({});
		    setOffen([]);
		    fetch(`${WEG_STAND}?modus=${modus}`, { headers: { accept: "application/json" } }).then(async (antwort) => {
		      if (!antwort.ok) {
		        const text = await antwort.text();
		        throw new Error(text === "" ? `HTTP ${String(antwort.status)}` : text);
		      }
		      return await antwort.json();
		    }).then((daten) => {
		      if (!ab)
		        setStand(daten);
		    }).catch((problem) => {
		      if (!ab)
		        setFehler(problem instanceof Error ? problem.message : String(problem));
		    }).finally(() => {
		      if (!ab)
		        setLaden(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [modus, neu]);
		  const ladeDiff = import_react.useCallback(async (ws, aenderung) => {
		    const key = schluessel(ws.id, aenderung);
		    setLadend((alt) => alt.includes(key) ? alt : [...alt, key]);
		    try {
		      const frage = new URLSearchParams({
		        workspace: ws.id,
		        modus,
		        pfad: aenderung.pfad,
		        bereich: aenderung.bereich
		      });
		      if (ws.repo?.basis != null)
		        frage.set("basis", ws.repo.basis);
		      const antwort = await fetch(`${WEG_DIFF}?${frage.toString()}`, { headers: { accept: "application/json" } });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${String(antwort.status)}`);
		      const daten = await antwort.json();
		      setDiffs((alt) => ({ ...alt, [key]: daten.diff }));
		    } catch (problem) {
		      setDiffs((alt) => ({
		        ...alt,
		        [key]: {
		          binaer: false,
		          abgeschnitten: false,
		          hunks: [],
		          hinweis: problem instanceof Error ? problem.message : String(problem)
		        }
		      }));
		    } finally {
		      setLadend((alt) => alt.filter((eintrag) => eintrag !== key));
		    }
		  }, [modus]);
		  const oeffne = import_react.useCallback((ws, aenderung) => {
		    const key = schluessel(ws.id, aenderung);
		    if (offen.includes(key)) {
		      setOffen(offen.filter((eintrag) => eintrag !== key));
		      return;
		    }
		    setOffen([...offen, key]);
		    if (diffs[key] === undefined)
		      ladeDiff(ws, aenderung);
		  }, [offen, diffs, ladeDiff]);
		  const alleErweitern = import_react.useCallback(() => {
		    const alle = (stand?.workspaces ?? []).flatMap((ws) => (ws.repo?.aenderungen ?? []).map((aenderung) => ({ ws, aenderung })));
		    const begrenzt = alle.slice(0, 20);
		    if (alle.length > 20)
		      setMeldung({ art: "ok", text: t("onlyTwenty") });
		    const zuOeffnen = begrenzt.filter((eintrag) => !offen.includes(schluessel(eintrag.ws.id, eintrag.aenderung)));
		    if (zuOeffnen.length === 0) {
		      setOffen([]);
		      return;
		    }
		    setOffen([...offen, ...zuOeffnen.map((eintrag) => schluessel(eintrag.ws.id, eintrag.aenderung))]);
		    for (const eintrag of zuOeffnen) {
		      if (diffs[schluessel(eintrag.ws.id, eintrag.aenderung)] === undefined)
		        ladeDiff(eintrag.ws, eintrag.aenderung);
		    }
		  }, [stand, offen, diffs, ladeDiff, t]);
		  const aktion = import_react.useCallback(async (ws, name, extra) => {
		    setArbeitet(ws.id);
		    setMeldung(null);
		    try {
		      const antwort = await fetch(WEG_AKTION, {
		        method: "POST",
		        headers: { "content-type": "application/json", accept: "application/json" },
		        body: JSON.stringify({ workspace: ws.id, aktion: name, ...extra })
		      });
		      const daten = await antwort.json();
		      if (daten.repo !== undefined) {
		        setStand((alt) => alt === null ? alt : {
		          ...alt,
		          workspaces: alt.workspaces.map((eintrag) => eintrag.id === ws.id ? { ...eintrag, repo: daten.repo ?? eintrag.repo } : eintrag)
		        });
		      }
		      const ok = daten.ok === true && antwort.ok;
		      setMeldung({
		        art: ok ? "ok" : "fehler",
		        text: ok ? daten.ausgabe === undefined || daten.ausgabe === "" ? t("actionOk") : daten.ausgabe : daten.fehler ?? `HTTP ${String(antwort.status)}`
		      });
		      if (ok && name === "commit")
		        setNachrichten((alt) => ({ ...alt, [ws.id]: "" }));
		    } catch (problem) {
		      setMeldung({ art: "fehler", text: problem instanceof Error ? problem.message : String(problem) });
		    } finally {
		      setArbeitet(null);
		    }
		  }, [t]);
		  const holeFern = import_react.useCallback(async (ws) => {
		    setFernLaden((alt) => alt.includes(ws.id) ? alt : [...alt, ws.id]);
		    try {
		      const antwort = await fetch(`${WEG_FERN}?workspace=${encodeURIComponent(ws.id)}`, {
		        headers: { accept: "application/json" }
		      });
		      const daten = await antwort.json();
		      setFern((alt) => ({ ...alt, [ws.id]: daten }));
		    } catch (problem) {
		      setFern((alt) => ({
		        ...alt,
		        [ws.id]: {
		          anbieter: "unbekannt",
		          eigner: null,
		          repo: null,
		          pulls: [],
		          issues: [],
		          hinweis: problem instanceof Error ? problem.message : String(problem)
		        }
		      }));
		    } finally {
		      setFernLaden((alt) => alt.filter((eintrag) => eintrag !== ws.id));
		    }
		  }, []);
		  const leer = stand !== null && stand.workspaces.length === 0;
		  const anzahl = stand?.workspaces.length ?? 0;
		  const gezeigt = (stand?.workspaces ?? []).find((eintrag) => eintrag.id === gewaehlt) ?? null;
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: `pmh-git${schmal ? " is-schmal" : ""}`,
		    ref: rahmen,
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-git__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx(GitIcon, {
		                size: schmal ? 16 : 20
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-git__brandtext",
		                children: [
		                  !schmal && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-git__kicker",
		                    children: "GIT"
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                    className: "pmh-git__name",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__headaktionen",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: `pmh-git__dot${stand === null ? "" : " is-on"}`
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-git__btn",
		                onClick: () => setNeu(neu + 1),
		                disabled: laden,
		                children: t("refresh")
		              }),
		              close !== undefined && /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-git__btn pmh-git__btn--ghost",
		                onClick: close,
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-git__bar",
		        children: [
		          anzahl > 1 && /* @__PURE__ */ jsx_runtime.jsxs("label", {
		            className: "pmh-git__waehler",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__waehlerlabel",
		                children: t("workspace")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-git__waehlerselect",
		                children: /* @__PURE__ */ jsx_runtime.jsx("select", {
		                  value: gewaehlt ?? "",
		                  onChange: (ereignis) => {
		                    setGewaehlt(ereignis.target.value);
		                    setOffen([]);
		                    setDiffs({});
		                  },
		                  children: stand?.workspaces.map((ws) => /* @__PURE__ */ jsx_runtime.jsxs("option", {
		                    value: ws.id,
		                    children: [
		                      ws.titel,
		                      " · ",
		                      ws.repo === null ? t("noRepoShort") : `${ws.repo.zweig.name ?? "HEAD"} · ${String(ws.repo.aenderungenGesamt)}`
		                    ]
		                  }, ws.id))
		                })
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("div", {
		            className: "pmh-git__segmente",
		            role: "tablist",
		            "aria-label": t("title"),
		            children: MODI.map((wert) => /* @__PURE__ */ jsx_runtime.jsx("button", {
		              type: "button",
		              role: "tab",
		              "aria-selected": modus === wert,
		              className: `pmh-git__segment${modus === wert ? " is-aktiv" : ""}`,
		              onClick: () => setModus(wert),
		              children: t(wert === "arbeitsbaum" ? "working" : wert === "zweig" ? "branch" : "round")
		            }, wert))
		          }),
		          !schmal && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__ansichten",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: `pmh-git__segment${ansicht === "unified" ? " is-aktiv" : ""}`,
		                onClick: () => setAnsicht("unified"),
		                children: t("unified")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: `pmh-git__segment${ansicht === "split" ? " is-aktiv" : ""}`,
		                onClick: () => setAnsicht("split"),
		                children: t("split")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-git__segment",
		                onClick: alleErweitern,
		                children: t("expandAll")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-git__scroll",
		        children: [
		          fehler !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-git__fehler",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                children: t("error")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: fehler
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-git__btn",
		                onClick: () => setNeu(neu + 1),
		                children: t("retry")
		              })
		            ]
		          }),
		          laden && stand === null && /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-git__leer",
		            children: t("loading")
		          }),
		          leer && /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-git__leer",
		            children: t("noWorkspaces")
		          }),
		          meldung !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: `pmh-git__meldung is-${meldung.art}`,
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("b", {
		                children: meldung.art === "ok" ? t("actionOk") : t("actionFail")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: meldung.text
		              })
		            ]
		          }),
		          gezeigt !== null && /* @__PURE__ */ jsx_runtime.jsx(Workspacekarte, {
		            ws: gezeigt,
		            schmal,
		            mitKopf: anzahl <= 1,
		            offen,
		            diffs,
		            ladend,
		            ansicht,
		            nachricht: nachrichten[gezeigt.id] ?? "",
		            arbeitet,
		            fern: fern[gezeigt.id],
		            fernLaden: fernLaden.includes(gezeigt.id),
		            onOeffne: oeffne,
		            onAktion: (ziel, name, extra) => {
		              aktion(ziel, name, extra);
		            },
		            onFern: (ziel) => {
		              holeFern(ziel);
		            },
		            onNachricht: (ziel, text) => setNachrichten((alt) => ({ ...alt, [ziel.id]: text })),
		            t
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("footer", {
		        className: "pmh-git__fuss",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("span", {
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("b", {
		                children: t("files")
		              }),
		              " ",
		              String(gezeigt?.repo?.aenderungenGesamt ?? 0)
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("span", {
		            children: stand === null ? "" : new Date(stand.gelesenAm).toLocaleString()
		          })
		        ]
		      })
		    ]
		  });
		}
		function GitTabBody({ t }) {
		  return /* @__PURE__ */ jsx_runtime.jsx(GitPanel, {
		    t
		  });
		}
		function GitTabTitle({ t }) {
		  return /* @__PURE__ */ jsx_runtime.jsx("span", {
		    className: "pmh-git__chip",
		    children: t("panel")
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => ctx.locale.register(NS, "de", DE), "git: Texte de");
		  ctx.effect(() => ctx.locale.register(NS, "en", EN), "git: Texte en");
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhGit = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "git: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({ name: "main", key: PANEL_ID, locale: NS, inject: () => ({ close }) }, GitPanel);
		  });
		  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 14, label: () => t("panel"), locale: NS }, GitIcon));
		  ctx.effect(() => ctx.sidebarRightTabs.register({
		    id: TAB_ID,
		    kind: TAB_KIND,
		    multiple: false,
		    keepMounted: true,
		    priority: "extension",
		    title: () => t("panel"),
		    guide: [{ id: "git", order: 37, title: () => t("panel"), description: () => t("guide") }]
		  }), "git: Typ in der rechten Leiste");
		  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID, locale: NS }, GitTabBody));
		  ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: TAB_ID, locale: NS }, GitTabTitle));
		}
		var CSS = `
		.pmh-git{
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 85% 0%,#131022 0%,#0b0a12 55%,#07070c 100%);
		  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-git__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 13px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-git__brand{display:flex;align-items:center;gap:11px;color:#b9a6f0}
		.pmh-git__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-git__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(185,166,240,.55)}
		.pmh-git__name{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f4f1fb}
		.pmh-git__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#e7e2f7}
		.pmh-git__headaktionen{display:flex;align-items:center;gap:9px;min-width:0}
		.pmh-git__dot{width:6px;height:6px;border-radius:50%;background:#5b4f86;box-shadow:0 0 0 4px rgba(91,79,134,.12)}
		.pmh-git__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
		.pmh-git__bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:10px 20px;border-bottom:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.012)}
		.pmh-git__segmente,.pmh-git__ansichten{display:flex;align-items:center;gap:2px;padding:2px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(0,0,0,.25)}
		.pmh-git__segment{
		  appearance:none;border:0;background:transparent;color:rgba(236,238,248,.55);
		  padding:5px 10px;border-radius:7px;cursor:pointer;
		  font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.02em;white-space:nowrap;
		}
		.pmh-git__segment:hover{color:#f0ecfb;background:rgba(255,255,255,.05)}
		.pmh-git__segment.is-aktiv{background:rgba(150,127,224,.18);color:#efe9ff;box-shadow:inset 0 0 0 1px rgba(150,127,224,.35)}
		.pmh-git__scroll{flex:1;min-height:0;overflow:auto;padding:14px 20px 26px}
		.pmh-git__karte{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.022);margin-bottom:14px;overflow:hidden}
		.pmh-git__kopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:13px 15px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018)}
		.pmh-git__kopftext{display:flex;flex-direction:column;gap:2px;min-width:0}
		.pmh-git__titel{margin:0;font-size:13.5px;font-weight:600;color:#f2eefc;letter-spacing:-.01em}
		.pmh-git__pfad{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.38);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:58ch}
		.pmh-git__zweig{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}
		.pmh-git__ab{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
		.pmh-git__ab.is-zurueck{color:#f0b48d}
		.pmh-git__zustand{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.05em;text-transform:uppercase;color:#f0c98d;border:1px solid rgba(240,201,141,.24);background:rgba(240,201,141,.07);border-radius:999px;padding:3px 7px}
		.pmh-git__zustand.is-sauber{color:#8fe3c6;border-color:rgba(105,214,163,.3);background:rgba(105,214,163,.07)}
		.pmh-git__liste{padding:4px 0}
		.pmh-git__datei{border-bottom:1px solid rgba(255,255,255,.035)}
		.pmh-git__datei:last-child{border-bottom:0}
		.pmh-git__zeile{
		  display:grid;grid-template-columns:30px minmax(0,1fr) auto auto 14px;align-items:center;gap:9px;
		  width:100%;padding:7px 14px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer;
		}
		.pmh-git__zeile:hover{background:rgba(255,255,255,.035)}
		.pmh-git__zeile.is-offen{background:rgba(150,127,224,.07)}
		.pmh-git__kuerzel{
		  display:inline-flex;align-items:center;justify-content:center;width:24px;height:18px;border-radius:4px;
		  font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.02em;
		}
		.pmh-git__kuerzel--a{background:rgba(80,140,220,.18);color:#9dc3f5}
		.pmh-git__kuerzel--b{background:rgba(200,140,70,.18);color:#f0c08a}
		.pmh-git__kuerzel--c{background:rgba(120,190,140,.16);color:#9ee0b5}
		.pmh-git__kuerzel--d{background:rgba(180,120,200,.16);color:#dcb3ec}
		.pmh-git__kuerzel--e{background:rgba(200,100,110,.16);color:#f2aab2}
		.pmh-git__kuerzel--f{background:rgba(120,160,180,.16);color:#a9cfdd}
		.pmh-git__dateipfad{font:11.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(240,242,250,.86);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-git__alt{font-style:normal;color:rgba(236,238,248,.34)}
		.pmh-git__status{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.04em;white-space:nowrap}
		.pmh-git__status.is-neu{color:#8fe3c6}
		.pmh-git__status.is-weg{color:#f29b9b}
		.pmh-git__status.is-geaendert{color:#f0c98d}
		.pmh-git__status.is-verschoben{color:#a9c9f2}
		.pmh-git__status.is-konflikt{color:#f2a06a}
		.pmh-git__zahlen{display:flex;align-items:baseline;gap:6px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;white-space:nowrap}
		.pmh-git__zahlen b{font-weight:600;color:#7fd8a8}
		.pmh-git__zahlen i{font-style:normal;color:#ef9a9a}
		.pmh-git__pfeil{color:rgba(236,238,248,.3);transition:transform .15s ease;display:inline-block}
		.pmh-git__pfeil.is-offen{transform:rotate(90deg);color:#b9a6f0}
		.pmh-git__diff{border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.28)}
		.pmh-git__diffrumpf{max-height:420px;overflow:auto;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace}
		.pmh-git__hunk{border-bottom:1px solid rgba(255,255,255,.04)}
		.pmh-git__hunk:last-child{border-bottom:0}
		.pmh-git__hunkkopf{padding:5px 12px;color:rgba(150,180,220,.75);background:rgba(80,120,180,.08)}
		.pmh-git__dzeile,.pmh-git__paar{display:grid;grid-template-columns:44px 44px 14px minmax(0,1fr);align-items:baseline}
		.pmh-git__dzeile.is-plus{background:rgba(70,160,110,.11)}
		.pmh-git__dzeile.is-minus{background:rgba(190,80,90,.1)}
		.pmh-git__nr{padding:0 6px;text-align:right;color:rgba(236,238,248,.26);user-select:none;font-size:10px}
		.pmh-git__zeichen{color:rgba(236,238,248,.4);text-align:center}
		.pmh-git__dtext{padding:0 12px 0 2px;white-space:pre-wrap;word-break:break-word;color:rgba(240,242,250,.82)}
		.pmh-git__dzeile.is-plus .pmh-git__dtext{color:#b8ecc9}
		.pmh-git__dzeile.is-minus .pmh-git__dtext{color:#f3bcbc}
		.pmh-git__paar{grid-template-columns:1fr 1fr;gap:1px}
		.pmh-git__seite{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:baseline;min-width:0}
		.pmh-git__seite.is-plus{background:rgba(70,160,110,.11)}
		.pmh-git__seite.is-minus{background:rgba(190,80,90,.1)}
		.pmh-git__spalten{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr);gap:14px;padding:12px 15px;border-top:1px solid rgba(255,255,255,.05)}
		.pmh-git__spalte{min-width:0}
		.pmh-git__ueberschrift{margin:0 0 7px;font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,166,240,.72)}
		.pmh-git__commits{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
		.pmh-git__commits li{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:8px;align-items:baseline}
		.pmh-git__commits code{font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#b9a6f0}
		.pmh-git__betreff{font:11px/1.4 "Segoe UI", system-ui, sans-serif;color:rgba(240,242,250,.78);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-git__autor{font:9px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.3)}
		.pmh-git__remote{display:flex;align-items:center;gap:7px;margin-bottom:6px;flex-wrap:wrap}
		.pmh-git__anbieter{font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:#d9cdf7;border:1px solid rgba(150,127,224,.3);background:rgba(150,127,224,.09);border-radius:999px;padding:3px 6px}
		.pmh-git__remotename{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.4)}
		.pmh-git__link{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:#9dc3f5;text-decoration:none;overflow:hidden;text-overflow:ellipsis}
		.pmh-git__link:hover{text-decoration:underline}
		.pmh-git__remotepfad{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.45);overflow:hidden;text-overflow:ellipsis}
		.pmh-git__fern{margin-top:9px;padding-top:9px;border-top:1px dashed rgba(255,255,255,.07)}
		.pmh-git__fernliste{list-style:none;margin:0 0 8px;padding:0;display:flex;flex-direction:column;gap:3px}
		.pmh-git__fernliste a{font:10.5px/1.4 "Segoe UI", system-ui, sans-serif;color:#c9dcf7;text-decoration:none}
		.pmh-git__fernliste a:hover{text-decoration:underline}
		.pmh-git__aktionen{padding:12px 15px 14px;border-top:1px solid rgba(255,255,255,.05)}
		.pmh-git__aktionszeile{display:flex;flex-wrap:wrap;gap:6px}
		.pmh-git__commit{display:flex;gap:6px;margin-top:8px}
		.pmh-git__feld{
		  flex:1;min-width:0;border:1px solid rgba(185,166,240,.18);border-radius:8px;background:rgba(8,8,14,.7);
		  color:#efeafc;padding:7px 9px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
		}
		.pmh-git__feld:focus{border-color:rgba(185,166,240,.5);box-shadow:0 0 0 3px rgba(150,127,224,.09)}
		.pmh-git__btn{
		  appearance:none;border:1px solid rgba(185,166,240,.2);background:rgba(20,17,30,.6);color:#efeafc;
		  border-radius:8px;padding:6px 11px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
		  transition:border-color .16s ease,background .16s ease;
		}
		.pmh-git__btn:hover:not(:disabled){border-color:rgba(185,166,240,.55);background:rgba(38,32,55,.8)}
		.pmh-git__btn:disabled{opacity:.45;cursor:default}
		.pmh-git__btn--ghost{border-color:transparent;background:transparent;color:rgba(236,238,248,.55)}
		.pmh-git__btn--stark{border-color:rgba(150,127,224,.45);background:rgba(150,127,224,.18);color:#f2ecff}
		.pmh-git__btn--cloud{margin-top:2px;width:fit-content}
		.pmh-git__leer{margin:12px 15px;color:rgba(236,238,248,.4);font-size:12px}
		.pmh-git__hinweis{margin:8px 15px;padding:7px 10px;border:1px solid rgba(240,201,141,.2);border-radius:8px;background:rgba(240,201,141,.06);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(246,238,222,.7)}
		.pmh-git__klein{margin:8px 0 0;font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.3)}
		.pmh-git__meldung{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:0 0 12px;padding:9px 12px;border-radius:9px;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace}
		.pmh-git__meldung.is-ok{border:1px solid rgba(105,214,163,.24);background:rgba(105,214,163,.07);color:#c9f2e0}
		.pmh-git__meldung.is-fehler{border:1px solid rgba(255,120,120,.26);background:rgba(60,20,30,.35);color:rgba(255,207,207,.9)}
		.pmh-git__meldung span{flex:1 1 60%;min-width:0;white-space:pre-wrap}
		.pmh-git__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
		.pmh-git__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
		.pmh-git__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
		.pmh-git__fuss{display:flex;justify-content:space-between;gap:12px;padding:9px 20px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.34)}
		.pmh-git__fuss b{color:rgba(185,166,240,.65);font-weight:600;margin-right:4px}
		@media (max-width:900px){
		  .pmh-git__spalten{grid-template-columns:1fr}
		  .pmh-git__pfad{max-width:32ch}
		}
		.pmh-git__waehler{display:flex;align-items:center;gap:7px;min-width:0}
		.pmh-git__waehlerlabel{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(185,166,240,.55)}
		.pmh-git__waehlerselect{position:relative;display:inline-flex;min-width:0;max-width:300px}
		.pmh-git__waehlerselect::after{content:'';position:absolute;right:9px;top:50%;width:5px;height:5px;border-right:1px solid rgba(236,238,248,.5);border-bottom:1px solid rgba(236,238,248,.5);transform:translateY(-65%) rotate(45deg);pointer-events:none}
		.pmh-git__waehlerselect select{appearance:none;-webkit-appearance:none;width:100%;min-width:0;border:1px solid rgba(185,166,240,.22);border-radius:9px;background:rgba(20,17,30,.75);color:#efeafc;padding:6px 26px 6px 10px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;outline:none}
		.pmh-git__waehlerselect select:hover{border-color:rgba(185,166,240,.5)}
		.pmh-git__waehlerselect select:focus{border-color:rgba(185,166,240,.6);box-shadow:0 0 0 3px rgba(150,127,224,.1)}
		.pmh-git__waehlerselect option{background:#141120;color:#efeafc}
		/* Die schmale Leiste ist nicht das Hauptfeld: weniger Kopf, kein Statuswort, keine Nebenspalten. */
		.pmh-git.is-schmal .pmh-git__bar{gap:8px}
		.pmh-git.is-schmal .pmh-git__waehler{flex:1 1 100%}
		.pmh-git.is-schmal .pmh-git__waehlerselect{flex:1;max-width:none}
		.pmh-git.is-schmal .pmh-git__segmente{flex:1 1 100%;overflow:auto;scrollbar-width:none}
		.pmh-git.is-schmal .pmh-git__head{padding:12px 14px 10px}
		.pmh-git.is-schmal .pmh-git__name{font-size:14px}
		.pmh-git.is-schmal .pmh-git__scroll{padding:10px 12px 18px}
		.pmh-git.is-schmal .pmh-git__kopf{flex-direction:column;align-items:flex-start;gap:6px}
		.pmh-git.is-schmal .pmh-git__zeile{grid-template-columns:26px minmax(0,1fr) auto 14px}
		.pmh-git.is-schmal .pmh-git__zahlen{display:none}
		.pmh-git.is-schmal .pmh-git__status{display:none}
		.pmh-git.is-schmal .pmh-git__dzeile{grid-template-columns:30px 30px 12px minmax(0,1fr)}
		@media (max-width:560px){
		  .pmh-git__head{padding:14px 16px 12px}
		  .pmh-git__bar{padding:9px 16px}
		  .pmh-git__scroll{padding:12px 16px 22px}
		  .pmh-git__zeile{grid-template-columns:26px minmax(0,1fr) auto 14px}
		  .pmh-git__zahlen{display:none}
		}
		`;

		return module.exports;
	}
});
