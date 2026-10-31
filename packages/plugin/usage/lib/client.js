/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/usage/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/usage/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/usage",
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
		  ENTRY_ID: () => ENTRY_ID,
		  PANEL_ID: () => PANEL_ID,
		  TAB_ID: () => TAB_ID,
		  TAB_KIND: () => TAB_KIND,
		  UsagePanel: () => UsagePanel,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "usage";
		var TAB_ID = "@prometheus-harness/usage";
		var TAB_KIND = "pmh-usage";
		var ENTRY_ID = "pmh-usage";
		var NS = "usage";
		var STANDARD_REIHENFOLGE = 13;
		var STANDARD_KACHEL_REIHENFOLGE = 36;
		function liesAnzeige(config) {
		  const flaeche = config?.surface;
		  const oberflaeche = flaeche === "plugins" || flaeche === "both" || flaeche === "none" || flaeche === "sidebar" ? flaeche : "sidebar";
		  const platz = config?.order;
		  const reihenfolge = typeof platz === "number" && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE;
		  const roh = config?.label;
		  const beschriftung = typeof roh === "string" && roh.trim() !== "" ? roh.trim() : undefined;
		  return { oberflaeche, reihenfolge, beschriftung, kachel: config?.guide !== false };
		}
		var WEG_STAND = "/api/pmh/usage/status";
		var WEG_SCHAETZUNG = "/api/pmh/usage/schaetzung";
		var inject = ["slots", "locale", "layout", "sidebarRightTabs", "configForms"];
		function geld(wert) {
		  if (wert === undefined || !Number.isFinite(wert))
		    return "—";
		  return `${Math.abs(wert) < 1 ? wert.toFixed(4) : wert.toFixed(2)} USD`;
		}
		function zwei(wert) {
		  return wert === undefined || !Number.isFinite(wert) ? "—" : wert.toFixed(2);
		}
		function limitLabel(zeitraum) {
		  if (zeitraum === "daily")
		    return "limitDaily";
		  if (zeitraum === "weekly")
		    return "limitWeekly";
		  if (zeitraum === "monthly")
		    return "limitMonthly";
		  return "limitKey";
		}
		function zeitpunkt(iso) {
		  if (iso === null)
		    return "—";
		  const datum = new Date(iso);
		  return Number.isNaN(datum.getTime()) ? "—" : datum.toLocaleString();
		}
		function alterInTagen(iso, jetzt) {
		  if (iso === undefined)
		    return;
		  const zeit = new Date(iso).getTime();
		  if (Number.isNaN(zeit))
		    return;
		  return Math.max(0, Math.floor((jetzt - zeit) / 86400000));
		}
		async function hole(url) {
		  const antwort = await fetch(url, { headers: { accept: "application/json" } });
		  if (!antwort.ok)
		    throw new Error(`HTTP ${String(antwort.status)}`);
		  return await antwort.json();
		}
		function UsagePanel({ close, t }) {
		  const [stand, setStand] = import_react.useState(null);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [laden, setLaden] = import_react.useState(true);
		  const [neu, setNeu] = import_react.useState(0);
		  const [modell, setModell] = import_react.useState("");
		  const [stufe, setStufe] = import_react.useState("");
		  const [anzahl, setAnzahl] = import_react.useState(1);
		  const [schaetzung, setSchaetzung] = import_react.useState(null);
		  const [schaetzt, setSchaetzt] = import_react.useState(false);
		  const [schaetzFehler, setSchaetzFehler] = import_react.useState(null);
		  import_react.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    setFehler(null);
		    hole(neu > 0 ? `${WEG_STAND}?frisch=1` : WEG_STAND).then((neuer) => {
		      if (ab)
		        return;
		      setStand(neuer);
		      setModell((alt) => alt !== "" ? alt : neuer.schaetzung.modelle[0]?.modell ?? "");
		      setStufe((alt) => {
		        if (alt !== "")
		          return alt;
		        return neuer.schaetzung.stufen.includes("1K") ? "1K" : neuer.schaetzung.stufen[0] ?? "";
		      });
		    }).catch((problem) => {
		      if (ab)
		        return;
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    }).finally(() => {
		      if (!ab)
		        setLaden(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [neu]);
		  import_react.useEffect(() => {
		    if (modell === "") {
		      setSchaetzung(null);
		      return;
		    }
		    let ab = false;
		    setSchaetzt(true);
		    setSchaetzFehler(null);
		    const frage = new URLSearchParams({ modell, anzahl: String(anzahl) });
		    if (stufe !== "")
		      frage.set("aufloesung", stufe);
		    hole(`${WEG_SCHAETZUNG}?${frage.toString()}`).then((antwort) => {
		      if (!ab)
		        setSchaetzung(antwort.schaetzung);
		    }).catch((problem) => {
		      if (ab)
		        return;
		      setSchaetzung(null);
		      setSchaetzFehler(problem instanceof Error ? problem.message : String(problem));
		    }).finally(() => {
		      if (!ab)
		        setSchaetzt(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [modell, stufe, anzahl]);
		  const kacheln = stand === null ? [] : [
		    { schluessel: "today", fenster: stand.fenster.tag },
		    { schluessel: "week", fenster: stand.fenster.woche },
		    { schluessel: "month", fenster: stand.fenster.monat },
		    { schluessel: "all", fenster: stand.fenster.gesamt }
		  ];
		  const hoechsterTag = stand === null ? 0 : stand.jeTag.reduce((hoechster, posten) => posten.usd > hoechster ? posten.usd : hoechster, 0);
		  const leer = stand !== null && stand.fenster.gesamt.anfragen === 0 && stand.salden.length === 0;
		  const jetzt = Date.now();
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-us",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-us__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-us__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx(UsageIcon, {
		                size: 20
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-us__brandtext",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-us__kicker",
		                    children: "USAGE"
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                    className: "pmh-us__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-us__actions",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: `pmh-us__dot${stand === null ? "" : " is-on"}`
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-us__state",
		                children: stand?.datei ?? t("noFile")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-us__btn",
		                onClick: () => setNeu(neu + 1),
		                disabled: laden,
		                children: t("refresh")
		              }),
		              close !== undefined && /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-us__btn pmh-us__btn--ghost",
		                onClick: close,
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-us__scroll",
		        children: [
		          fehler !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-us__fehler",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                children: t("error")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: fehler
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                type: "button",
		                className: "pmh-us__btn",
		                onClick: () => setNeu(neu + 1),
		                children: t("retry")
		              })
		            ]
		          }),
		          laden && stand === null && /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-us__leer",
		            children: t("loading")
		          }),
		          stand !== null && /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
		            children: [
		              stand.hinweis !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-us__hinweis",
		                children: stand.hinweis
		              }),
		              leer && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-us__leer",
		                children: t("noData")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("section", {
		                className: "pmh-us__stats",
		                children: kacheln.map((kachel) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                  className: "pmh-us__stat",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime.jsx("span", {
		                      className: "pmh-us__statlabel",
		                      children: t(kachel.schluessel)
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                      className: "pmh-us__statwert",
		                      children: geld(kachel.fenster.usd)
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                      className: "pmh-us__statsub",
		                      children: [
		                        String(kachel.fenster.anfragen),
		                        " ",
		                        t("requests"),
		                        kachel.fenster.unbepreist > 0 ? ` · ${String(kachel.fenster.unbepreist)} ${t("unpriced")}` : ""
		                      ]
		                    })
		                  ]
		                }, kachel.schluessel))
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-us__grid",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
		                    className: "pmh-us__card",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                        className: "pmh-us__karte",
		                        children: t("balances")
		                      }),
		                      stand.salden.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                        className: "pmh-us__leer",
		                        children: t("noBalance")
		                      }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                        className: "pmh-us__salden",
		                        children: stand.salden.map((saldo) => {
		                          const anteil = saldo.limitUsd === undefined || saldo.limitUsd <= 0 || saldo.verbrauchtUsd === undefined ? undefined : Math.min(1, Math.max(0, saldo.verbrauchtUsd / saldo.limitUsd));
		                          const tage = saldo.quelle === "live" ? undefined : alterInTagen(saldo.stand, jetzt);
		                          const veraltet = tage !== undefined && tage >= 2;
		                          return /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                            className: "pmh-us__saldo",
		                            children: [
		                              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                                className: "pmh-us__saldokopf",
		                                children: [
		                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                                    className: "pmh-us__saldomarke",
		                                    children: [
		                                      saldo.schluessel.replace(/_API_KEY$/u, ""),
		                                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                                        className: `pmh-us__quelle${saldo.quelle === "live" ? " is-live" : ""}`,
		                                        title: saldo.stand === undefined ? undefined : zeitpunkt(saldo.stand),
		                                        children: saldo.quelle === "live" ? t("live") : t("cached")
		                                      }),
		                                      saldo.geteilt === true && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                                        className: "pmh-us__geteilt",
		                                        children: t("shared")
		                                      })
		                                    ]
		                                  }),
		                                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                                    className: "pmh-us__saldobetrag",
		                                    children: saldo.guthabenUsd === undefined ? t("noBalance") : geld(saldo.guthabenUsd)
		                                  })
		                                ]
		                              }),
		                              saldo.detail !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                                className: "pmh-us__saldodetail",
		                                children: saldo.detail
		                              }),
		                              saldo.geteilt === true && saldo.hier30Usd !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                                className: "pmh-us__saldodetail",
		                                children: [
		                                  t("ofWhichHere"),
		                                  " ",
		                                  geld(saldo.hier30Usd)
		                                ]
		                              }),
		                              saldo.quelle !== "live" && saldo.stand !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                                className: `pmh-us__saldostand${veraltet ? " is-alt" : ""}`,
		                                children: [
		                                  t("fileStand"),
		                                  " ",
		                                  zeitpunkt(saldo.stand),
		                                  tage === undefined ? "" : ` · ${String(tage)} ${t("ageDays")}`
		                                ]
		                              }),
		                              saldo.fehler !== undefined && /* @__PURE__ */ jsx_runtime.jsx("p", {
		                                className: "pmh-us__saldofehler",
		                                title: saldo.fehlerTechnisch,
		                                children: saldo.fehler
		                              }),
		                              anteil !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                                className: "pmh-us__limit",
		                                children: [
		                                  /* @__PURE__ */ jsx_runtime.jsx("div", {
		                                    className: "pmh-us__spur",
		                                    children: /* @__PURE__ */ jsx_runtime.jsx("i", {
		                                      style: { width: `${String(Math.round(anteil * 100))}%` }
		                                    })
		                                  }),
		                                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                                    children: [
		                                      t(limitLabel(saldo.limitZeitraum)),
		                                      " · ",
		                                      zwei(saldo.verbrauchtUsd),
		                                      " /",
		                                      " ",
		                                      zwei(saldo.limitUsd),
		                                      " USD",
		                                      saldo.limitRestUsd === undefined ? "" : ` · ${zwei(saldo.limitRestUsd)} ${t("left")}`
		                                    ]
		                                  })
		                                ]
		                              })
		                            ]
		                          }, saldo.schluessel);
		                        })
		                      }),
		                      stand.ausgeblendet !== undefined && stand.ausgeblendet > 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                        className: "pmh-us__ausgeblendet",
		                        children: [
		                          String(stand.ausgeblendet),
		                          " × ",
		                          t("hiddenKeys")
		                        ]
		                      }),
		                      stand.fremd !== undefined && stand.fremd > 0 && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                        className: "pmh-us__ausgeblendet",
		                        children: [
		                          String(stand.fremd),
		                          " × ",
		                          t("foreign")
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("p", {
		                        className: "pmh-us__ausgeblendet",
		                        children: t("billingNote")
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("section", {
		                    className: "pmh-us__card",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                        className: "pmh-us__karte",
		                        children: t("history")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("div", {
		                        className: "pmh-us__verlauf",
		                        children: stand.jeTag.map((posten) => {
		                          const hoehe = hoechsterTag <= 0 ? 0 : Math.max(2, Math.round(posten.usd / hoechsterTag * 100));
		                          return /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            className: `pmh-us__balken${posten.usd > 0 ? " is-aktiv" : ""}`,
		                            style: { height: `${String(hoehe)}%` },
		                            title: `${posten.tag}: ${geld(posten.usd)} · ${String(posten.anfragen)} ${t("requests")}`
		                          }, posten.tag);
		                        })
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                        className: "pmh-us__verlaufsfuss",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            children: stand.jeTag[0]?.tag ?? ""
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            children: t("today")
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                        className: "pmh-us__karte pmh-us__karte--eng",
		                        children: t("models")
		                      }),
		                      stand.jeModell.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                        className: "pmh-us__leer",
		                        children: t("noData")
		                      }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                        className: "pmh-us__modelle",
		                        children: stand.jeModell.map((posten) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                          children: [
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              className: "pmh-us__modellname",
		                              children: posten.modell
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              className: "pmh-us__modellfamilie",
		                              children: posten.familie
		                            }),
		                            /* @__PURE__ */ jsx_runtime.jsx("span", {
		                              className: "pmh-us__modellbetrag",
		                              children: geld(posten.usd)
		                            })
		                          ]
		                        }, `${posten.familie}/${posten.modell}`))
		                      })
		                    ]
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("section", {
		                className: "pmh-us__card pmh-us__schaetzer",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                    className: "pmh-us__karte",
		                    children: t("estimate")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                    className: "pmh-us__steuer",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                        className: "pmh-us__feld",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            children: t("model")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("select", {
		                            value: modell,
		                            onChange: (ereignis) => setModell(ereignis.target.value),
		                            children: stand.schaetzung.modelle.map((eintrag) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                              value: eintrag.modell,
		                              children: eintrag.usd === undefined ? `${eintrag.modell} — ${t("unknownPrice")}` : `${eintrag.modell} — ${geld(eintrag.usd)} (${eintrag.herkunft})`
		                            }, eintrag.modell))
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                        className: "pmh-us__feld",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            children: t("resolution")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("select", {
		                            value: stufe,
		                            onChange: (ereignis) => setStufe(ereignis.target.value),
		                            children: stand.schaetzung.stufen.map((wert) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                              value: wert,
		                              children: wert
		                            }, wert))
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                        className: "pmh-us__feld",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            children: t("count")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                            className: "pmh-us__zaehler",
		                            children: [
		                              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                                type: "button",
		                                onClick: () => setAnzahl((alt) => Math.max(1, alt - 1)),
		                                disabled: anzahl <= 1,
		                                "aria-label": t("less"),
		                                children: "−"
		                              }),
		                              /* @__PURE__ */ jsx_runtime.jsx("b", {
		                                children: anzahl
		                              }),
		                              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                                type: "button",
		                                onClick: () => setAnzahl((alt) => Math.min(4, alt + 1)),
		                                disabled: anzahl >= 4,
		                                "aria-label": t("more"),
		                                children: "+"
		                              })
		                            ]
		                          })
		                        ]
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("p", {
		                    className: "pmh-us__zahl",
		                    children: schaetzt ? "…" : schaetzung?.usd === undefined ? t("noEstimate") : geld(schaetzung.usd)
		                  }),
		                  schaetzung !== null && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                    className: "pmh-us__grund",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("basis")
		                      }),
		                      " ",
		                      schaetzung.grund
		                    ]
		                  }),
		                  schaetzFehler !== null && /* @__PURE__ */ jsx_runtime.jsxs("p", {
		                    className: "pmh-us__saldofehler",
		                    children: [
		                      t("estimateError"),
		                      " ",
		                      schaetzFehler
		                    ]
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("footer", {
		                className: "pmh-us__fuss",
		                children: [
		                  stand.geltung !== undefined && /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("scope")
		                      }),
		                      " ",
		                      stand.geltung.nutzer === null ? t("scopeHost") : `${stand.geltung.nutzer} · ${t("scopeHost")}`
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("source")
		                      }),
		                      " ",
		                      stand.datei ?? t("noFile")
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("readAt")
		                      }),
		                      " ",
		                      zeitpunkt(stand.gelesenAm)
		                    ]
		                  }),
		                  stand.katalog?.geholtAm != null && /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("catalog")
		                      }),
		                      " ",
		                      zeitpunkt(stand.katalog.geholtAm)
		                    ]
		                  }),
		                  stand.saldenStand !== null && /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("b", {
		                        children: t("balancesAt")
		                      }),
		                      " ",
		                      zeitpunkt(stand.saldenStand)
		                    ]
		                  }),
		                  stand.katalog?.fehler !== undefined && /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-us__fussfehler",
		                    children: stand.katalog.fehler
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-us__fusshinweis",
		                    children: t("hint")
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
		function UsageIcon({ size = 16 }) {
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
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5Z"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M4 8.5h13"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "16.4",
		        cy: "13",
		        r: "1.25"
		      })
		    ]
		  });
		}
		function UsageTabBody({ t }) {
		  return /* @__PURE__ */ jsx_runtime.jsx(UsagePanel, {
		    t
		  });
		}
		function UsageTabTitle({ t }) {
		  return /* @__PURE__ */ jsx_runtime.jsx("span", {
		    className: "pmh-us__chip",
		    children: t("panel")
		  });
		}
		function UsageItem({ view, t }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime.jsx("span", {
		      className: "pmh-us__chip",
		      children: t("guide")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsx(UsagePanel, {
		    t
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhUsage = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "usage: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close })
		    }, UsagePanel);
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
		        }, UsageIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS
		        }, UsageItem)));
		      }
		      abgemeldet.push(ctx.sidebarRightTabs.register({
		        id: TAB_ID,
		        kind: TAB_KIND,
		        multiple: false,
		        keepMounted: true,
		        priority: "extension",
		        title: titel,
		        guide: anzeige.kachel ? [{ id: "usage", order: STANDARD_KACHEL_REIHENFOLGE, title: titel, description: () => t("guide") }] : []
		      }));
		    };
		    anmelden();
		    const abhoeren = form.subscribe(anmelden);
		    return () => {
		      abhoeren();
		      for (const ab of abgemeldet)
		        ab();
		      abgemeldet = [];
		    };
		  }, "usage: Anzeige nach den Einstellungen");
		  ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID, locale: NS }, UsageTabBody));
		  ctx.slots.inject("sidebar.right.pane.tab.title", () => ctx.slots.register({ name: "sidebar.right.pane.tab.title", key: TAB_ID, locale: NS }, UsageTabTitle));
		}
		var CSS = `
		.pmh-us{
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 85% 0%,#161227 0%,#0b0a12 55%,#07070c 100%);
		  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-us__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-us__brand{display:flex;align-items:center;gap:11px;color:#e9c68f}
		.pmh-us__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-us__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(233,198,143,.55)}
		.pmh-us__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f6f1e8}
		.pmh-us__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f0e6d2}
		.pmh-us__actions{display:flex;align-items:center;gap:9px;min-width:0}
		.pmh-us__dot{width:6px;height:6px;border-radius:50%;background:#6b5a8f;box-shadow:0 0 0 4px rgba(107,90,143,.12)}
		.pmh-us__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
		.pmh-us__state{max-width:34ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.5)}
		.pmh-us__btn{
		  appearance:none;border:1px solid rgba(233,198,143,.22);background:rgba(30,24,18,.55);
		  color:#f2ead9;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  cursor:pointer;transition:border-color .18s ease,background .18s ease;
		}
		.pmh-us__btn:hover:not(:disabled){border-color:rgba(233,198,143,.6);background:rgba(52,41,28,.75)}
		.pmh-us__btn:disabled{opacity:.45;cursor:default}
		.pmh-us__btn--ghost{border-color:transparent;background:transparent;color:rgba(230,232,248,.6)}
		.pmh-us__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 26px}
		.pmh-us__stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px;margin-bottom:14px}
		.pmh-us__stat{display:flex;flex-direction:column;gap:3px;padding:11px 13px;border:1px solid rgba(255,255,255,.07);border-radius:11px;background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012))}
		.pmh-us__statlabel{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.12em;text-transform:uppercase;color:rgba(230,232,248,.45)}
		.pmh-us__statwert{font:600 17px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f7f2e7;letter-spacing:-.02em}
		.pmh-us__statsub{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.42)}
		.pmh-us__grid{display:grid;grid-template-columns:minmax(260px,0.85fr) minmax(0,1.15fr);gap:14px;margin-bottom:14px}
		.pmh-us__card{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.022);padding:14px 16px 16px}
		.pmh-us__karte{margin:0 0 11px;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(233,198,143,.72)}
		.pmh-us__karte--eng{margin-top:22px}
		.pmh-us__salden{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
		.pmh-us__saldo{display:flex;flex-direction:column;gap:4px;padding-bottom:11px;border-bottom:1px dashed rgba(255,255,255,.06)}
		.pmh-us__saldo:last-child{border-bottom:0;padding-bottom:0}
		.pmh-us__saldokopf{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
		.pmh-us__saldomarke{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);letter-spacing:.03em}
		.pmh-us__quelle{margin-left:6px;font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:rgba(230,232,248,.32);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 5px}
		.pmh-us__quelle.is-live{color:#8fe3c6;border-color:rgba(105,214,163,.35);background:rgba(105,214,163,.08)}
		.pmh-us__geteilt{margin-left:5px;font:8.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;color:#f0c98d;border:1px solid rgba(233,198,143,.3);background:rgba(233,198,143,.08);border-radius:999px;padding:2px 5px}
		.pmh-us__fussfehler{width:100%;color:rgba(255,167,167,.6)}
		.pmh-us__saldobetrag{font:600 12.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f4ead6;white-space:nowrap}
		.pmh-us__saldodetail{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.42)}
		.pmh-us__saldofehler{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,167,167,.78)}
		.pmh-us__saldostand{margin:0;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
		.pmh-us__saldostand.is-alt{color:#e3b778}
		.pmh-us__limit{display:flex;flex-direction:column;gap:4px}
		.pmh-us__limit span{font:9.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.4)}
		.pmh-us__spur{height:4px;border-radius:999px;background:rgba(255,255,255,.07);overflow:hidden}
		.pmh-us__spur i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#e9c68f,#d98f5a);transition:width .3s ease}
		.pmh-us__verlauf{display:flex;align-items:flex-end;gap:3px;height:74px;padding:2px 0 0}
		.pmh-us__balken{flex:1;min-height:2px;border-radius:2px 2px 0 0;background:rgba(255,255,255,.07)}
		.pmh-us__balken.is-aktiv{background:linear-gradient(180deg,#e9c68f,rgba(217,143,90,.55))}
		.pmh-us__verlaufsfuss{display:flex;justify-content:space-between;margin-top:5px;font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
		.pmh-us__modelle{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
		.pmh-us__modelle li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:10px;align-items:baseline}
		.pmh-us__modellname{font:11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-us__modellfamilie{font:9.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.34)}
		.pmh-us__modellbetrag{font:11.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f2e6cf}
		.pmh-us__schaetzer{display:flex;flex-direction:column}
		.pmh-us__steuer{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(90px,.7fr) auto;gap:12px;align-items:end}
		.pmh-us__feld{display:flex;flex-direction:column;gap:5px;min-width:0}
		.pmh-us__feld>span{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(230,232,248,.42)}
		.pmh-us__feld select{
		  appearance:none;width:100%;min-width:0;border:1px solid rgba(233,198,143,.2);border-radius:8px;
		  background:rgba(10,9,15,.7);color:#efe9dc;padding:7px 9px;font:11.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
		}
		.pmh-us__feld select:focus{border-color:rgba(233,198,143,.55);box-shadow:0 0 0 3px rgba(233,198,143,.09)}
		.pmh-us__zaehler{display:flex;align-items:center;gap:6px}
		.pmh-us__zaehler button{
		  appearance:none;width:26px;height:28px;border:1px solid rgba(233,198,143,.2);border-radius:8px;
		  background:rgba(10,9,15,.7);color:#efe9dc;font:13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
		}
		.pmh-us__zaehler button:hover:not(:disabled){border-color:rgba(233,198,143,.55)}
		.pmh-us__zaehler button:disabled{opacity:.35;cursor:default}
		.pmh-us__zaehler b{min-width:18px;text-align:center;font:600 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f6efdf}
		.pmh-us__zahl{margin:16px 0 4px;font:600 30px/1.05 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:-.03em;color:#f8f1e2}
		.pmh-us__grund{margin:0;max-width:84ch;font:10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.46)}
		.pmh-us__grund b{color:rgba(233,198,143,.8);font-weight:600}
		.pmh-us__fuss{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.36)}
		.pmh-us__fuss b{margin-right:5px;color:rgba(233,198,143,.6);font-weight:600}
		.pmh-us__fusshinweis{width:100%;color:rgba(230,232,248,.28)}
		.pmh-us__leer{margin:12px 0;color:rgba(230,232,248,.4);font-size:12px}
		.pmh-us__ausgeblendet{margin:12px 0 0;padding-top:10px;border-top:1px dashed rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.3)}
		.pmh-us__hinweis{margin:0 0 12px;padding:8px 11px;border:1px solid rgba(233,198,143,.2);border-radius:9px;background:rgba(233,198,143,.06);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(246,238,222,.7)}
		.pmh-us__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
		.pmh-us__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
		.pmh-us__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
		@media (max-width:900px){
		  .pmh-us__grid{grid-template-columns:1fr}
		  .pmh-us__steuer{grid-template-columns:1fr 1fr}
		  .pmh-us__state{display:none}
		}
		@media (max-width:560px){
		  .pmh-us__steuer{grid-template-columns:1fr}
		  .pmh-us__head{padding:14px 16px 12px}
		  .pmh-us__scroll{padding:14px 16px 22px}
		}
		`;

		return module.exports;
	}
});
