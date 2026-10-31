/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/crew/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/crew/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/crew",
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

		// src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  CrewIcon: () => CrewIcon,
		  CrewPanel: () => CrewPanel,
		  ENTRY_ID: () => ENTRY_ID,
		  PANEL_ID: () => PANEL_ID,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "crew";
		var PLUGIN_ID = "pmh-crew";
		var ENTRY_ID = "pmh-crew";
		var NS = "crew";
		var inject = ["slots", "locale", "layout", "configForms"];
		var STANDARD_REIHENFOLGE = 14;
		function liesAnzeige(config) {
		  const flaeche = config?.surface;
		  const oberflaeche = flaeche === "plugins" || flaeche === "both" || flaeche === "none" || flaeche === "sidebar" ? flaeche : "sidebar";
		  const platz = config?.order;
		  const reihenfolge = typeof platz === "number" && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE;
		  const roh = config?.label;
		  const beschriftung = typeof roh === "string" && roh.trim() !== "" ? roh.trim() : undefined;
		  return { oberflaeche, reihenfolge, beschriftung };
		}
		var WEG = "/api/pmh/crew";
		var WEG_KATALOG = "/api/pmh/crew/katalog";
		var CREW_ROUTE = "crew";
		function modelleDerRoute(wege, familie) {
		  if (familie === CREW_ROUTE)
		    return [];
		  return wege.find((weg) => weg.id === familie)?.modelle ?? [];
		}
		var CSRF_KEKS = "pmh_csrf";
		var CSRF_KOPF = "x-pmh-csrf";
		var ROLLEN = ["planner", "executor", "reviewer", "vision", "search", "helper"];
		function keksWert(name) {
		  for (const stueck of document.cookie.split(";")) {
		    const i = stueck.indexOf("=");
		    if (i === -1)
		      continue;
		    if (stueck.slice(0, i).trim() === name)
		      return decodeURIComponent(stueck.slice(i + 1).trim());
		  }
		  return "";
		}

		class Serverfehler extends Error {
		  status;
		  befunde;
		  crewId;
		  constructor(status, meldung, befunde = [], crewId) {
		    super(meldung);
		    this.status = status;
		    this.befunde = befunde;
		    this.crewId = crewId;
		  }
		}
		async function hole(url, sprache) {
		  const antwort = await fetch(`${url}?sprache=${encodeURIComponent(sprache)}`, {
		    credentials: "same-origin",
		    cache: "no-store"
		  });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (!antwort.ok) {
		    const fehler = daten;
		    throw new Serverfehler(antwort.status, fehler?.text ?? `HTTP ${String(antwort.status)}`);
		  }
		  return daten;
		}
		async function schicke(url, koerper, sprache) {
		  const antwort = await fetch(`${url}?sprache=${encodeURIComponent(sprache)}`, {
		    method: "PUT",
		    credentials: "same-origin",
		    cache: "no-store",
		    headers: { "content-type": "application/json", [CSRF_KOPF]: keksWert(CSRF_KEKS) },
		    body: JSON.stringify(koerper)
		  });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (!antwort.ok) {
		    const fehler = daten;
		    throw new Serverfehler(antwort.status, fehler?.text ?? fehler?.fehler ?? `HTTP ${String(antwort.status)}`, fehler?.befunde ?? [], fehler?.crewId);
		  }
		  return daten;
		}
		function entwurfAus(sicht) {
		  return {
		    crews: sicht.crews.map((crew) => ({
		      id: crew.id,
		      name: crew.name ?? "",
		      rollen: Object.entries(crew.rollen).map(([rolle, bindung]) => ({
		        rolle,
		        familie: bindung.familie,
		        modell: bindung.modell
		      }))
		    })),
		    standard: sicht.standard ?? sicht.crews[0]?.id ?? null,
		    projekt: sicht.projekt ?? "",
		    aktiv: sicht.aktiv
		  };
		}
		function rumpfAus(entwurf) {
		  return {
		    crews: entwurf.crews.map((crew) => {
		      const rollen = {};
		      for (const eintrag of crew.rollen) {
		        if (eintrag.rolle === "" || eintrag.familie.trim() === "" || eintrag.modell.trim() === "")
		          continue;
		        rollen[eintrag.rolle] = { familie: eintrag.familie.trim(), modell: eintrag.modell.trim() };
		      }
		      return {
		        id: crew.id.trim(),
		        ...crew.name.trim() === "" ? {} : { name: crew.name.trim() },
		        rollen
		      };
		    }),
		    standard: entwurf.standard,
		    projekt: entwurf.projekt.trim() === "" ? null : entwurf.projekt.trim(),
		    aktiv: entwurf.aktiv
		  };
		}
		function neueCrew(nummer) {
		  return {
		    id: `crew-${String(nummer)}`,
		    name: "",
		    rollen: [{ rolle: "executor", familie: "deepseek-official", modell: "deepseek-flash" }]
		  };
		}
		function freieKennung(crews) {
		  let nummer = 1;
		  while (crews.some((crew) => crew.id === `crew-${String(nummer)}`))
		    nummer += 1;
		  return `crew-${String(nummer)}`;
		}
		function CrewPanel({ close, t, sprache }) {
		  const [sicht, setSicht] = import_react.useState(null);
		  const [entwurf, setEntwurf] = import_react.useState(null);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [befunde, setBefunde] = import_react.useState([]);
		  const [arbeitet, setArbeitet] = import_react.useState(false);
		  const [gespeichert, setGespeichert] = import_react.useState(null);
		  const [wege, setWege] = import_react.useState([]);
		  const spracheJetzt = import_react.useCallback(() => {
		    try {
		      return sprache() === "" ? "en" : sprache();
		    } catch {
		      return "en";
		    }
		  }, [sprache]);
		  import_react.useEffect(() => {
		    let ab = false;
		    hole(WEG_KATALOG, spracheJetzt()).then((katalog) => {
		      if (!ab)
		        setWege(katalog.wege);
		    }).catch(() => {
		      if (!ab)
		        setWege([]);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [spracheJetzt]);
		  const lade = import_react.useCallback(async () => {
		    setFehler(null);
		    setBefunde([]);
		    try {
		      const stand = await hole(WEG, spracheJetzt());
		      setSicht(stand);
		      setEntwurf(entwurfAus(stand));
		    } catch (grund) {
		      setFehler(grund instanceof Error ? grund.message : String(grund));
		    }
		  }, [spracheJetzt]);
		  import_react.useEffect(() => {
		    lade();
		  }, [lade]);
		  const ungespeichert = sicht !== null && entwurf !== null && JSON.stringify(rumpfAus(entwurf)) !== JSON.stringify(rumpfAus(entwurfAus(sicht)));
		  const beimSpeichern = import_react.useCallback(async () => {
		    if (entwurf === null)
		      return;
		    setArbeitet(true);
		    setFehler(null);
		    setBefunde([]);
		    try {
		      const stand = await schicke(WEG, rumpfAus(entwurf), spracheJetzt());
		      setSicht(stand);
		      setEntwurf(entwurfAus(stand));
		      setGespeichert(new Date().toLocaleTimeString());
		    } catch (grund) {
		      if (grund instanceof Serverfehler) {
		        setFehler(grund.message);
		        setBefunde(grund.befunde);
		      } else {
		        setFehler(grund instanceof Error ? grund.message : String(grund));
		      }
		    } finally {
		      setArbeitet(false);
		    }
		  }, [entwurf, spracheJetzt]);
		  const aendere = import_react.useCallback((aenderung) => {
		    setEntwurf((alt) => alt === null ? alt : aenderung(alt));
		    setGespeichert(null);
		  }, []);
		  const setzeCrew = import_react.useCallback((index, feld) => {
		    aendere((alt) => ({
		      ...alt,
		      crews: alt.crews.map((crew, i) => i === index ? { ...crew, ...feld } : crew)
		    }));
		  }, [aendere]);
		  const setzeRolle = import_react.useCallback((crewIndex, rollenIndex, feld) => {
		    aendere((alt) => ({
		      ...alt,
		      crews: alt.crews.map((crew, i) => i === crewIndex ? { ...crew, rollen: crew.rollen.map((rolle, r) => r === rollenIndex ? { ...rolle, ...feld } : rolle) } : crew)
		    }));
		  }, [aendere]);
		  const freieRolle = (crew) => ROLLEN.find((rolle) => !crew.rollen.some((eintrag) => eintrag.rolle === rolle)) ?? "helper";
		  const plan = sicht?.plan ?? null;
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-cr",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-cr__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-cr__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx(CrewIcon, {
		                size: 22
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-cr__brandtext",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-cr__kicker",
		                    children: t("kicker")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                    className: "pmh-cr__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-cr__actions",
		            children: [
		              gespeichert !== null && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-cr__marke pmh-cr__marke--gut",
		                children: t("saved")
		              }),
		              ungespeichert && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-cr__marke",
		                children: t("unsaved")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-cr__btn pmh-cr__btn--ghost",
		                type: "button",
		                onClick: () => void lade(),
		                children: t("refresh")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-cr__btn pmh-cr__btn--primary",
		                type: "button",
		                disabled: arbeitet || entwurf === null || sicht?.art === "datei",
		                onClick: () => void beimSpeichern(),
		                children: arbeitet ? t("saving") : t("save")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-cr__btn pmh-cr__btn--ghost",
		                type: "button",
		                onClick: close,
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      fehler !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-cr__fehler",
		        role: "alert",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("span", {
		            children: fehler
		          }),
		          befunde.length > 0 && /* @__PURE__ */ jsx_runtime.jsx("ul", {
		            children: befunde.map((befund) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		              children: befund
		            }, befund))
		          })
		        ]
		      }),
		      sicht === null && fehler === null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-cr__body",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-cr__skelett",
		            "aria-busy": "true",
		            "aria-label": t("loading"),
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("i", {}),
		              /* @__PURE__ */ jsx_runtime.jsx("i", {}),
		              /* @__PURE__ */ jsx_runtime.jsx("i", {})
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-cr__still",
		            children: t("loading")
		          })
		        ]
		      }),
		      sicht !== null && entwurf !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-cr__body",
		        children: [
		          sicht.hinweis !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-cr__hinweis",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                children: t("fileMode")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("p", {
		                children: t("fileModeHint")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("small", {
		                children: sicht.hinweis
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-cr__abschnitt",
		            "aria-labelledby": "pmh-cr-crews",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-cr__abschnittkopf",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                    id: "pmh-cr-crews",
		                    children: t("roles")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-cr__zahl",
		                    children: entwurf.crews.length
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("small", {
		                    children: t("manageHint")
		                  })
		                ]
		              }),
		              entwurf.crews.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-cr__leer",
		                children: t("noCrews")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("div", {
		                className: "pmh-cr__crews",
		                children: entwurf.crews.map((crew, crewIndex) => /* @__PURE__ */ jsx_runtime.jsxs("article", {
		                  className: "pmh-cr__crew",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                      className: "pmh-cr__crewzeile",
		                      children: [
		                        /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                          className: "pmh-cr__feld",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              children: t("crewId")
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("input", {
		                              type: "text",
		                              value: crew.id,
		                              spellCheck: false,
		                              "aria-describedby": `pmh-cr-id-hinweis-${String(crewIndex)}`,
		                              onChange: (ereignis) => setzeCrew(crewIndex, { id: ereignis.target.value })
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("small", {
		                              id: `pmh-cr-id-hinweis-${String(crewIndex)}`,
		                              children: t("crewIdHint")
		                            })
		                          ]
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                          className: "pmh-cr__feld",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              children: t("crewName")
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("input", {
		                              type: "text",
		                              value: crew.name,
		                              placeholder: t("crewNameHint"),
		                              "aria-describedby": `pmh-cr-name-hinweis-${String(crewIndex)}`,
		                              onChange: (ereignis) => setzeCrew(crewIndex, { name: ereignis.target.value })
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("small", {
		                              id: `pmh-cr-name-hinweis-${String(crewIndex)}`,
		                              children: t("crewNameHint")
		                            })
		                          ]
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                          className: "pmh-cr__vorgabe",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("input", {
		                              type: "radio",
		                              name: "crew-standard",
		                              checked: entwurf.standard === crew.id,
		                              onChange: () => aendere((alt) => ({ ...alt, standard: crew.id }))
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              children: t("standard")
		                            })
		                          ]
		                        }),
		                        /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                          className: "pmh-cr__crewaktionen",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("button", {
		                              className: "pmh-cr__btn pmh-cr__btn--klein",
		                              type: "button",
		                              onClick: () => aendere((alt) => ({
		                                ...alt,
		                                crews: [
		                                  ...alt.crews,
		                                  {
		                                    id: freieKennung(alt.crews),
		                                    name: crew.name === "" ? "" : `${crew.name} (Kopie)`,
		                                    rollen: crew.rollen.map((rolle) => ({ ...rolle }))
		                                  }
		                                ]
		                              })),
		                              children: t("duplicate")
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("button", {
		                              className: "pmh-cr__btn pmh-cr__btn--klein",
		                              type: "button",
		                              onClick: () => aendere((alt) => {
		                                const crews = alt.crews.filter((_, i) => i !== crewIndex);
		                                return {
		                                  ...alt,
		                                  crews,
		                                  standard: alt.standard === crew.id ? crews[0]?.id ?? null : alt.standard
		                                };
		                              }),
		                              children: t("removeCrew")
		                            })
		                          ]
		                        })
		                      ]
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                      className: "pmh-cr__rollen",
		                      children: [
		                        crew.rollen.map((rolle, rollenIndex) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                          className: "pmh-cr__rolle",
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("select", {
		                              "aria-label": t("role"),
		                              value: rolle.rolle,
		                              onChange: (ereignis) => setzeRolle(crewIndex, rollenIndex, { rolle: ereignis.target.value }),
		                              children: (ROLLEN.includes(rolle.rolle) ? ROLLEN : [rolle.rolle, ...ROLLEN]).map((name) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                                value: name,
		                                children: name
		                              }, name))
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                              "aria-label": t("route"),
		                              value: rolle.familie,
		                              onChange: (ereignis) => setzeRolle(crewIndex, rollenIndex, { familie: ereignis.target.value }),
		                              children: [
		                                (rolle.familie === "" || wege.some((weg) => weg.id === rolle.familie) ? [] : [{ id: rolle.familie, name: rolle.familie }]).map((weg) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                                  value: weg.id,
		                                  children: weg.name === rolle.familie ? rolle.familie : `${weg.name} · ${weg.id}`
		                                }, weg.id)),
		                                rolle.familie === "" && /* @__PURE__ */ jsx_runtime.jsx("option", {
		                                  value: "",
		                                  children: t("route")
		                                }),
		                                wege.filter((weg) => weg.id !== CREW_ROUTE).map((weg) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                                  value: weg.id,
		                                  children: weg.name === weg.id ? weg.id : `${weg.name} · ${weg.id}`
		                                }, weg.id))
		                              ]
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("input", {
		                              type: "text",
		                              "aria-label": t("model"),
		                              placeholder: t("model"),
		                              value: rolle.modell,
		                              spellCheck: false,
		                              list: `pmh-cr-modell-${String(crewIndex)}-${String(rollenIndex)}`,
		                              onChange: (ereignis) => setzeRolle(crewIndex, rollenIndex, { modell: ereignis.target.value })
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("datalist", {
		                              id: `pmh-cr-modell-${String(crewIndex)}-${String(rollenIndex)}`,
		                              children: modelleDerRoute(wege, rolle.familie).map((modell) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                                value: modell.id,
		                                children: modell.name
		                              }, modell.id))
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("button", {
		                              className: "pmh-cr__btn pmh-cr__btn--klein",
		                              type: "button",
		                              "aria-label": t("removeRole"),
		                              onClick: () => setzeCrew(crewIndex, {
		                                rollen: crew.rollen.filter((_, r) => r !== rollenIndex)
		                              }),
		                              children: "×"
		                            })
		                          ]
		                        }, `r-${String(crewIndex)}-${String(rollenIndex)}`)),
		                        /* @__PURE__ */ jsx_runtime.jsxs("button", {
		                          className: "pmh-cr__btn pmh-cr__btn--klein",
		                          type: "button",
		                          onClick: () => setzeCrew(crewIndex, {
		                            rollen: [
		                              ...crew.rollen,
		                              { rolle: freieRolle(crew), familie: "deepseek-official", modell: "" }
		                            ]
		                          }),
		                          children: [
		                            "+ ",
		                            t("addRole")
		                          ]
		                        })
		                      ]
		                    })
		                  ]
		                }, `crew-${String(crewIndex)}`))
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("button", {
		                className: "pmh-cr__btn",
		                type: "button",
		                disabled: entwurf.crews.length >= 32,
		                onClick: () => aendere((alt) => {
		                  const crews = [...alt.crews, { ...neueCrew(1), id: freieKennung(alt.crews) }];
		                  return {
		                    ...alt,
		                    crews,
		                    standard: alt.standard ?? crews[0]?.id ?? null
		                  };
		                }),
		                children: [
		                  "+ ",
		                  t("addCrew")
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-cr__abschnitt",
		            "aria-labelledby": "pmh-cr-settings",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("div", {
		                className: "pmh-cr__abschnittkopf",
		                children: /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                  id: "pmh-cr-settings",
		                  children: t("settings")
		                })
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-cr__einstellungen",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-cr__feld pmh-cr__feld--breit",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("project")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("input", {
		                        type: "text",
		                        value: entwurf.projekt,
		                        spellCheck: false,
		                        placeholder: t("projectPlaceholder"),
		                        onChange: (ereignis) => aendere((alt) => ({ ...alt, projekt: ereignis.target.value }))
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("small", {
		                        children: t("projectHint")
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-cr__vorgabe",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("input", {
		                        type: "checkbox",
		                        checked: entwurf.aktiv,
		                        onChange: (ereignis) => aendere((alt) => ({ ...alt, aktiv: ereignis.target.checked }))
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                        children: [
		                          t("active"),
		                          /* @__PURE__ */ jsx_runtime.jsx("small", {
		                            children: t("activeHint")
		                          })
		                        ]
		                      })
		                    ]
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-cr__abschnitt",
		            "aria-labelledby": "pmh-cr-betrieb",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("div", {
		                className: "pmh-cr__abschnittkopf",
		                children: /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                  id: "pmh-cr-betrieb",
		                  children: t("operation")
		                })
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("dl", {
		                className: "pmh-cr__daten",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("dt", {
		                    children: t("billedTo")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("dd", {
		                    children: [
		                      sicht.betrieb.nutzer === null ? t("noAccount") : sicht.betrieb.nutzer,
		                      " · ",
		                      sicht.betrieb.werkzeuge ? t("toolsOn") : t("toolsOff"),
		                      sicht.betrieb.grund === undefined ? "" : ` (${sicht.betrieb.grund})`
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("dt", {
		                    children: t("planRoot")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("dd", {
		                    className: "pmh-cr__pfad",
		                    children: sicht.betrieb.verzeichnis
		                  }),
		                  gespeichert !== null && /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("dt", {
		                        children: t("status")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("dd", {
		                        children: [
		                          t("saved"),
		                          " ",
		                          gespeichert
		                        ]
		                      })
		                    ]
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-cr__abschnitt",
		            "aria-labelledby": "pmh-cr-plan",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-cr__abschnittkopf",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                    id: "pmh-cr-plan",
		                    children: t("plan")
		                  }),
		                  plan !== null && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-cr__zahl",
		                    children: plan.crew
		                  })
		                ]
		              }),
		              plan === null || plan.rollen.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-cr__leer",
		                children: t("planEmpty")
		              }) : /* @__PURE__ */ jsx_runtime.jsx("div", {
		                className: "pmh-cr__plan",
		                children: plan.rollen.map((rolle) => /* @__PURE__ */ jsx_runtime.jsxs("article", {
		                  className: "pmh-cr__planrolle",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime.jsx("h4", {
		                      children: rolle.rolle
		                    }),
		                    rolle.ziel !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                      className: "pmh-cr__ziel",
		                      children: [
		                        /* @__PURE__ */ jsx_runtime.jsx("span", {
		                          children: t("goal")
		                        }),
		                        " ",
		                        rolle.ziel.text,
		                        " ",
		                        /* @__PURE__ */ jsx_runtime.jsx("small", {
		                          children: rolle.ziel.stand
		                        })
		                      ]
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsxs("ul", {
		                      children: [
		                        rolle.aufgaben.length === 0 && /* @__PURE__ */ jsx_runtime.jsx("li", {
		                          className: "pmh-cr__still",
		                          children: t("noTasks")
		                        }),
		                        rolle.aufgaben.map((aufgabe, index) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                          className: `is-${aufgabe.stand}`,
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              children: aufgabe.text
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("small", {
		                              children: aufgabe.stand
		                            })
		                          ]
		                        }, `${rolle.rolle}-${String(index)}`))
		                      ]
		                    })
		                  ]
		                }, rolle.rolle))
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-cr__fussleiste",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-cr__fussleiste-text",
		                children: ungespeichert ? t("unsaved") : gespeichert !== null ? t("saved") : ""
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-cr__btn pmh-cr__btn--ghost",
		                type: "button",
		                onClick: () => void lade(),
		                children: t("refresh")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-cr__btn pmh-cr__btn--primary",
		                type: "button",
		                disabled: arbeitet || sicht?.art === "datei",
		                onClick: () => void beimSpeichern(),
		                children: arbeitet ? t("saving") : t("save")
		              })
		            ]
		          })
		        ]
		      })
		    ]
		  });
		}
		function CrewIcon({ size = 20 }) {
		  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
		    "aria-hidden": "true",
		    width: size,
		    height: size,
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.3",
		    strokeLinecap: "round",
		    strokeLinejoin: "round",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "12",
		        cy: "5.5",
		        r: "2.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "5.5",
		        cy: "17",
		        r: "2.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "18.5",
		        cy: "17",
		        r: "2.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M10.3 7.7 7.2 14.6M13.7 7.7l3.1 6.9M8.1 17h7.8"
		      })
		    ]
		  });
		}
		function CrewSettings({ t, sprache }) {
		  const [entwurf, setEntwurf] = import_react.useState(null);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [laden, setLaden] = import_react.useState(true);
		  const [arbeitet, setArbeitet] = import_react.useState(false);
		  const [gespeichert, setGespeichert] = import_react.useState(false);
		  import_react.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    hole(WEG, sprache()).then((sicht) => {
		      if (ab)
		        return;
		      setEntwurf(entwurfAus(sicht));
		      setLaden(false);
		    }).catch((problem) => {
		      if (ab)
		        return;
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		      setLaden(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [sprache]);
		  const aendere = import_react.useCallback((aenderung) => {
		    setGespeichert(false);
		    setEntwurf((alt) => alt === null ? alt : aenderung(alt));
		  }, []);
		  const speichern = import_react.useCallback(async () => {
		    const aktuell = entwurf;
		    if (aktuell === null)
		      return;
		    setArbeitet(true);
		    setFehler(null);
		    try {
		      const sicht = await schicke(WEG, rumpfAus(aktuell), sprache());
		      setEntwurf(entwurfAus(sicht));
		      setGespeichert(true);
		    } catch (problem) {
		      setFehler(problem instanceof Serverfehler ? [problem.message, ...problem.befunde].filter((zeile) => zeile !== "").join(" · ") : problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setArbeitet(false);
		    }
		  }, [entwurf, sprache]);
		  if (laden)
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-cr__leer",
		      children: t("loading")
		    });
		  if (entwurf === null)
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-cr__fehler",
		      children: fehler ?? t("error")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-cr__body",
		    children: [
		      entwurf.crews.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-cr__leer",
		        children: t("noCrews")
		      }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-cr__einstellungen",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("label", {
		            className: "pmh-cr__feld",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: t("standard")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("select", {
		                value: entwurf.standard ?? "",
		                onChange: (ereignis) => aendere((alt) => ({
		                  ...alt,
		                  standard: ereignis.target.value === "" ? null : ereignis.target.value
		                })),
		                children: entwurf.crews.map((crew) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                  value: crew.id,
		                  children: crew.name === "" ? crew.id : crew.name
		                }, crew.id))
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("small", {
		                children: t("standardHint")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("label", {
		            className: "pmh-cr__feld pmh-cr__feld--breit",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: t("project")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("input", {
		                type: "text",
		                value: entwurf.projekt,
		                spellCheck: false,
		                placeholder: t("projectPlaceholder"),
		                onChange: (ereignis) => aendere((alt) => ({ ...alt, projekt: ereignis.target.value }))
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("small", {
		                children: t("projectHint")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("label", {
		            className: "pmh-cr__vorgabe",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("input", {
		                type: "checkbox",
		                checked: entwurf.aktiv,
		                onChange: (ereignis) => aendere((alt) => ({ ...alt, aktiv: ereignis.target.checked }))
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                children: [
		                  t("active"),
		                  /* @__PURE__ */ jsx_runtime.jsx("small", {
		                    children: t("activeHint")
		                  })
		                ]
		              })
		            ]
		          })
		        ]
		      }),
		      fehler !== null && /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-cr__fehler",
		        children: fehler
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-cr__actions",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            type: "button",
		            className: "pmh-cr__btn",
		            disabled: arbeitet || entwurf.crews.length === 0,
		            onClick: () => void speichern(),
		            children: arbeitet ? t("saving") : t("save")
		          }),
		          gespeichert && /* @__PURE__ */ jsx_runtime.jsx("span", {
		            className: "pmh-cr__leer",
		            children: t("saved")
		          })
		        ]
		      })
		    ]
		  });
		}
		function CrewItem({ view, t, close, sprache }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime.jsx("span", {
		      className: "pmh-cr__marke",
		      children: t("panel")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsx(CrewPanel, {
		    close,
		    t,
		    sprache
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhCrew = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "crew: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  const sprache = () => {
		    try {
		      return ctx.locale.getLocale().active;
		    } catch {
		      return "en";
		    }
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close, sprache })
		    }, CrewPanel);
		  });
		  ctx.effect(() => {
		    const form = ctx.configForms.get(ENTRY_ID);
		    let abgemeldet = [];
		    let zuletzt = "";
		    const anmelden = () => {
		      const anzeige = liesAnzeige(form.getSnapshot().value);
		      const schluessel = JSON.stringify(anzeige);
		      if (schluessel === zuletzt)
		        return;
		      zuletzt = schluessel;
		      for (const ab of abgemeldet)
		        ab();
		      abgemeldet = [];
		      const titel = () => anzeige.beschriftung ?? t("panel");
		      if (anzeige.oberflaeche === "sidebar" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
		          name: "sidebar.panellist",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS
		        }, CrewIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS,
		          inject: () => ({ close, sprache })
		        }, CrewItem)));
		      }
		    };
		    anmelden();
		    const abhoeren = form.subscribe(anmelden);
		    return () => {
		      abhoeren();
		      for (const ab of abgemeldet)
		        ab();
		      abgemeldet = [];
		    };
		  }, "crew: Anzeige nach den Einstellungen");
		  ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
		    name: "settings.plugins.tab",
		    id: PLUGIN_ID,
		    order: 30,
		    label: () => t("settingsTab"),
		    locale: NS,
		    inject: () => ({ sprache })
		  }, CrewSettings));
		}
		var CSS = `
		.pmh-cr{
		  --cr-bg:#0a0b0d; --cr-panel:#0f1014; --cr-card:#15161b; --cr-card-2:#1a1b22;
		  --cr-line:rgba(255,255,255,.07); --cr-line-2:rgba(255,255,255,.13);
		  --cr-text:#eef0f5; --cr-muted:rgba(238,240,245,.56); --cr-faint:rgba(238,240,245,.34);
		  --cr-gold:#e9c68f; --cr-gold-soft:rgba(233,198,143,.12);
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:
		    radial-gradient(90% 60% at 12% -10%,rgba(233,198,143,.07) 0%,transparent 60%),
		    radial-gradient(70% 50% at 100% 0%,rgba(120,160,220,.05) 0%,transparent 55%),
		    var(--cr-bg);
		  color:var(--cr-text);
		  font:14px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
		  -webkit-font-smoothing:antialiased;
		}
		.pmh-cr *{box-sizing:border-box}
		.pmh-cr :focus-visible{outline:2px solid rgba(233,198,143,.75);outline-offset:2px}

		/* ---------- Kopf ---------- */
		.pmh-cr__head{
		  position:sticky;top:0;z-index:5;flex:none;
		  display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;
		  padding:16px 24px;border-bottom:1px solid var(--cr-line);
		  background:color-mix(in srgb,var(--cr-bg) 82%,transparent);
		  backdrop-filter:blur(12px) saturate(120%);
		}
		.pmh-cr__brand{display:flex;align-items:center;gap:12px;min-width:0}
		.pmh-cr__brandtext{min-width:0;display:flex;flex-direction:column;gap:2px}
		.pmh-cr__kicker{
		  font:600 9.5px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
		  letter-spacing:.16em;text-transform:uppercase;color:var(--cr-faint);
		}
		.pmh-cr__title{
		  margin:0;font-size:19px;font-weight:600;letter-spacing:-.015em;line-height:1.2;
		  text-wrap:balance;
		}
		.pmh-cr__actions{display:flex;align-items:center;gap:8px}
		.pmh-cr__marke{
		  display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;
		  border:1px solid rgba(233,198,143,.35);background:rgba(233,198,143,.1);
		  color:#f0d3a4;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
		  letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;
		}
		.pmh-cr__marke--gut{border-color:rgba(120,220,170,.32);background:rgba(120,220,170,.1);color:#a7e7c6}

		/* ---------- Knöpfe ---------- */
		.pmh-cr__btn{
		  display:inline-flex;align-items:center;justify-content:center;gap:6px;
		  height:34px;padding:0 14px;border-radius:10px;cursor:pointer;
		  border:1px solid var(--cr-line-2);background:var(--cr-card-2);color:var(--cr-text);
		  font:500 13px/1 inherit;letter-spacing:.005em;white-space:nowrap;
		  transition:background .16s ease,border-color .16s ease,transform .12s ease,color .16s ease;
		}
		.pmh-cr__btn:hover{background:#22232b;border-color:rgba(255,255,255,.2)}
		.pmh-cr__btn:active{transform:scale(.98)}
		.pmh-cr__btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
		.pmh-cr__btn--primary{
		  background:var(--cr-gold);border-color:transparent;color:#1b1608;font-weight:600;
		  box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 6px 18px rgba(233,198,143,.16);
		}
		.pmh-cr__btn--primary:hover{background:#f0d2a4;border-color:transparent}
		.pmh-cr__btn--ghost{background:transparent;border-color:var(--cr-line-2)}
		.pmh-cr__btn--ghost:hover{background:rgba(255,255,255,.05)}
		.pmh-cr__btn--klein{height:30px;padding:0 10px;font-size:12px;border-radius:9px}

		/* ---------- Körper ---------- */
		.pmh-cr__body{
		  flex:1;min-height:0;overflow:auto;padding:24px;
		  display:flex;flex-direction:column;gap:18px;
		  scrollbar-color:rgba(255,255,255,.16) transparent;
		}
		.pmh-cr__body>*{width:100%;max-width:1120px;margin-inline:auto}

		/* ---------- Abschnitt (Karte) ---------- */
		.pmh-cr__abschnitt{
		  border:1px solid var(--cr-line);border-radius:16px;
		  background:linear-gradient(180deg,rgba(255,255,255,.022),transparent 42%),var(--cr-card);
		  box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 18px 40px -28px rgba(0,0,0,.9);
		  padding:18px 20px 20px;
		}
		.pmh-cr__abschnittkopf{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-bottom:14px}
		.pmh-cr__abschnittkopf h3{
		  margin:0;display:flex;align-items:center;gap:9px;
		  font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--cr-muted);
		}
		.pmh-cr__zahl{
		  display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:19px;padding:0 6px;
		  border-radius:999px;background:var(--cr-gold-soft);color:var(--cr-gold);
		  font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;
		}
		.pmh-cr__abschnittkopf small{color:var(--cr-faint);font-size:11.5px}

		/* ---------- Crew-Karten ---------- */
		.pmh-cr__crews{display:flex;flex-direction:column;gap:14px}
		.pmh-cr__crew{
		  border:1px solid var(--cr-line);border-radius:14px;background:var(--cr-card-2);
		  padding:14px;
		}
		.pmh-cr__crewzeile{
		  display:grid;grid-template-columns:132px minmax(0,300px) auto auto;
		  gap:12px;align-items:end;justify-content:start;
		}
		.pmh-cr__crewzeile>.pmh-cr__feld{min-width:0}
		.pmh-cr__crewaktionen{display:flex;gap:6px;align-items:center}
		.pmh-cr__rollen{display:flex;flex-direction:column;gap:8px;margin-top:14px}
		.pmh-cr__rolle{
		  display:grid;grid-template-columns:150px minmax(0,1fr) minmax(0,1.5fr) 32px;
		  gap:8px;align-items:center;
		  padding:8px;border:1px solid var(--cr-line);border-radius:11px;background:rgba(0,0,0,.18);
		}
		.pmh-cr__rolle:hover{border-color:var(--cr-line-2)}

		/* ---------- Felder ---------- */
		.pmh-cr__feld{display:flex;flex-direction:column;gap:5px;min-width:0}
		.pmh-cr__feld--breit{flex:1 1 320px}
		.pmh-cr__feld>span{
		  font:600 10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;
		  letter-spacing:.1em;text-transform:uppercase;color:var(--cr-faint);
		}
		.pmh-cr__feld>small{color:var(--cr-faint);font-size:11px;line-height:1.45}
		.pmh-cr input[type=text],
		.pmh-cr select{
		  height:34px;min-width:0;width:100%;padding:0 10px;
		  border:1px solid var(--cr-line-2);border-radius:9px;
		  background:var(--cr-panel);color:var(--cr-text);
		  font:13px/1 inherit;
		  transition:border-color .16s ease,box-shadow .16s ease,background .16s ease;
		}
		.pmh-cr input[type=text]::placeholder{color:var(--cr-faint)}
		.pmh-cr input[type=text]:hover,
		.pmh-cr select:hover{border-color:rgba(255,255,255,.2)}
		.pmh-cr input[type=text]:focus,
		.pmh-cr select:focus{
		  outline:none;border-color:rgba(233,198,143,.6);
		  box-shadow:0 0 0 3px rgba(233,198,143,.14);background:#101116;
		}
		.pmh-cr select{
		  appearance:none;padding-right:30px;cursor:pointer;
		  background-image:linear-gradient(45deg,transparent 50%,var(--cr-faint) 50%),linear-gradient(135deg,var(--cr-faint) 50%,transparent 50%);
		  background-position:calc(100% - 15px) 15px,calc(100% - 10px) 15px;
		  background-size:5px 5px,5px 5px;background-repeat:no-repeat;
		}
		.pmh-cr__rolle input[type=text]{height:32px}
		.pmh-cr__rolle select{height:32px;background-color:rgba(0,0,0,.25)}
		.pmh-cr__vorgabe{
		  display:inline-flex;align-items:center;gap:8px;cursor:pointer;
		  font-size:12px;color:var(--cr-muted);padding:6px 2px;
		}
		.pmh-cr__vorgabe input[type=checkbox]{
		  width:16px;height:16px;accent-color:#e9c68f;cursor:pointer;flex:none;
		}
		.pmh-cr__vorgabe small{display:block;color:var(--cr-faint);font-size:10.5px;line-height:1.4}
		.pmh-cr__einstellungen{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start}
		.pmh-cr__einstellungen>.pmh-cr__feld{flex:1 1 260px}

		/* ---------- Betrieb, Plan ---------- */
		.pmh-cr__daten{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:6px 18px;margin:0}
		.pmh-cr__daten dt{color:var(--cr-faint);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
		.pmh-cr__daten dd{
		  margin:0;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
		  color:var(--cr-text);font-variant-numeric:tabular-nums;overflow-wrap:anywhere;
		}
		.pmh-cr__pfad{
		  display:block;margin-top:4px;color:var(--cr-faint);
		  font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere;
		}
		.pmh-cr__plan{display:flex;flex-direction:column;gap:12px}
		.pmh-cr__planrolle{border:1px solid var(--cr-line);border-radius:12px;background:rgba(0,0,0,.16);padding:12px}
		.pmh-cr__ziel{margin:0 0 6px;color:var(--cr-text);font-size:12.5px;line-height:1.5}
		.pmh-cr__planrolle ul{margin:0;padding-left:16px;color:var(--cr-muted);font-size:12px;line-height:1.6}

		/* ---------- Zustände ---------- */
		.pmh-cr__leer{
		  margin:0;padding:22px 18px;border:1px dashed var(--cr-line-2);border-radius:12px;
		  color:var(--cr-faint);font-size:12.5px;text-align:center;text-wrap:pretty;
		}
		.pmh-cr__fehler{
		  margin:0;padding:11px 14px;border:1px solid rgba(255,120,120,.28);border-radius:11px;
		  background:rgba(255,90,90,.07);color:#ffb4b4;font-size:12.5px;line-height:1.5;
		}
		.pmh-cr__fehler ul{margin:6px 0 0;padding-left:18px}
		.pmh-cr__hinweis{
		  margin:0;padding:11px 14px;border:1px solid rgba(233,198,143,.28);border-radius:11px;
		  background:rgba(233,198,143,.06);color:rgba(255,240,214,.8);font-size:12.5px;line-height:1.55;
		}
		.pmh-cr__hinweis strong{display:block;margin-bottom:3px;color:#ffe3ac;font-weight:600}
		.pmh-cr__hinweis p{margin:0 0 5px}
		.pmh-cr__hinweis small{font:10.5px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--cr-faint);word-break:break-all}
		.pmh-cr__fussleiste{
		  position:sticky;bottom:-24px;z-index:4;margin:4px auto -24px;
		  display:flex;align-items:center;justify-content:flex-end;gap:8px;width:100%;max-width:1120px;
		  padding:12px 24px;border-top:1px solid var(--cr-line);
		  background:color-mix(in srgb,var(--cr-bg) 88%,transparent);backdrop-filter:blur(10px);
		}
		.pmh-cr__fussleiste-text{flex:1;color:var(--cr-faint);font:10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase}
		.pmh-cr__still{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

		/* ---------- Laden: Knochen statt Kreisel ---------- */
		.pmh-cr__skelett{display:flex;flex-direction:column;gap:12px;padding:22px;border:1px solid var(--cr-line);border-radius:16px;background:var(--cr-card)}
		.pmh-cr__skelett i{
		  display:block;height:12px;border-radius:6px;
		  background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.11),rgba(255,255,255,.05));
		  background-size:200% 100%;animation:pmh-cr-schimmer 1.4s ease-in-out infinite;
		}
		.pmh-cr__skelett i:first-child{width:34%;height:16px}
		.pmh-cr__skelett i:nth-child(2){width:72%}
		.pmh-cr__skelett i:nth-child(3){width:58%}
		@keyframes pmh-cr-schimmer{0%{background-position:140% 0}100%{background-position:-40% 0}}
		@media (prefers-reduced-motion:reduce){
		  .pmh-cr *{transition:none!important;animation:none!important}
		}

		/* ---------- Schmal ---------- */
		@media (max-width:820px){
		  .pmh-cr__head{padding:12px 14px;grid-template-columns:minmax(0,1fr);gap:10px}
		  .pmh-cr__actions{justify-content:flex-start;flex-wrap:wrap}
		  .pmh-cr__body{padding:14px}
		  .pmh-cr__crewzeile{grid-template-columns:1fr 1fr}
		  .pmh-cr__rolle{grid-template-columns:1fr 1fr;grid-auto-rows:min-content}
		  .pmh-cr__rolle>button{justify-self:end}
		  .pmh-cr__daten{grid-template-columns:1fr;gap:2px}
		}
		`;

		return module.exports;
	}
});
