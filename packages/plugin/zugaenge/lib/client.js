/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/zugaenge/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/zugaenge/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/zugaenge",
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
		  ZugaengeIcon: () => ZugaengeIcon,
		  ZugaengePanel: () => ZugaengePanel,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");

		// ../../ai/capabilities/src/index.ts
		var FAEHIGKEITEN = [
		  "gespraech",
		  "entscheiden",
		  "text-zu-sprache",
		  "sprache-zu-text",
		  "einbetten",
		  "bild"
		];

		// src/index.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "zugaenge";
		var ENTRY_ID = "pmh-zugaenge";
		var NS = "zugaenge";
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
		var WEG_LISTE = "/api/pmh/zugaenge";
		var WEG_SPEICHERN = "/api/pmh/zugaenge/speichern";
		var WEG_ENTFERNEN = "/api/pmh/zugaenge/entfernen";
		var WEG_PRUEFEN = "/api/pmh/zugaenge/pruefen";
		var inject = ["slots", "locale", "layout", "configForms"];
		var CAP_TEXT = {
		  gespraech: "capGespraech",
		  entscheiden: "capEntscheiden",
		  "text-zu-sprache": "capTextZuSprache",
		  "sprache-zu-text": "capSpracheZuText",
		  einbetten: "capEinbetten",
		  bild: "capBild"
		};
		function leererEntwurf() {
		  return {
		    name: "",
		    familie: "openrouter",
		    art: "fern",
		    schluessel: "noetig",
		    basis: "",
		    umgebung: "",
		    notiz: "",
		    modelle: {},
		    wert: ""
		  };
		}
		function alsEntwurf(zugang) {
		  return {
		    id: zugang.id,
		    name: zugang.name,
		    familie: zugang.familie,
		    art: zugang.art,
		    schluessel: zugang.schluessel,
		    basis: zugang.basis ?? "",
		    umgebung: zugang.umgebung ?? "",
		    notiz: zugang.notiz ?? "",
		    modelle: { ...zugang.modelle },
		    wert: ""
		  };
		}
		function csrfKopf() {
		  if (typeof document !== "undefined") {
		    for (const teil of document.cookie.split(";")) {
		      const [name, ...rest] = teil.trim().split("=");
		      if (name === "pmh_csrf") {
		        const wert = rest.join("=");
		        if (wert !== "") {
		          try {
		            return { "x-pmh-csrf": decodeURIComponent(wert) };
		          } catch {
		            return { "x-pmh-csrf": wert };
		          }
		        }
		      }
		    }
		  }
		  return { "x-pmh-csrf": EIGENER_CSRF };
		}
		var EIGENER_CSRF = `panel-${Math.random().toString(36).slice(2)}-${String(Date.now())}`;
		function meldungAus(daten, status) {
		  if (daten !== null && typeof daten === "object") {
		    const objekt = daten;
		    const maengel = objekt["maengel"];
		    if (Array.isArray(maengel) && maengel.length > 0)
		      return maengel.map(String).join(" · ");
		    const meldung = objekt["meldung"];
		    if (typeof meldung === "string" && meldung !== "")
		      return meldung;
		    const fehler = objekt["fehler"];
		    if (typeof fehler === "string" && fehler !== "")
		      return fehler;
		  }
		  return `HTTP ${String(status)}`;
		}
		async function hole(url) {
		  const antwort = await fetch(url, { headers: { accept: "application/json" } });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (!antwort.ok)
		    throw new Error(meldungAus(daten, antwort.status));
		  return daten;
		}
		async function schicke(url, koerper) {
		  const antwort = await fetch(url, {
		    method: "POST",
		    headers: { "content-type": "application/json", accept: "application/json", ...csrfKopf() },
		    body: JSON.stringify(koerper)
		  });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (!antwort.ok)
		    throw new Error(meldungAus(daten, antwort.status));
		  return daten;
		}
		function ZugaengePanel({ close, t }) {
		  const [bestand, setBestand] = import_react.useState(null);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [meldung, setMeldung] = import_react.useState(null);
		  const [laden, setLaden] = import_react.useState(true);
		  const [neu, setNeu] = import_react.useState(0);
		  const [entwurf, setEntwurf] = import_react.useState(null);
		  const [speichert, setSpeichert] = import_react.useState(false);
		  const [formFehler, setFormFehler] = import_react.useState(null);
		  const [pruefungen, setPruefungen] = import_react.useState({});
		  const [laeuft, setLaeuft] = import_react.useState(null);
		  import_react.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    setFehler(null);
		    hole(WEG_LISTE).then((antwort) => {
		      if (!ab)
		        setBestand(antwort);
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
		  }, [neu]);
		  const neuladen = () => setNeu((alt) => alt + 1);
		  const speichern = async () => {
		    if (entwurf === null)
		      return;
		    setSpeichert(true);
		    setFormFehler(null);
		    try {
		      const modelle = {};
		      for (const faehigkeit of FAEHIGKEITEN) {
		        const modell = (entwurf.modelle[faehigkeit] ?? "").trim();
		        if (modell !== "")
		          modelle[faehigkeit] = modell;
		      }
		      const zugang = {
		        ...entwurf.id === undefined ? {} : { id: entwurf.id },
		        name: entwurf.name.trim(),
		        familie: entwurf.familie,
		        art: entwurf.art,
		        schluessel: entwurf.schluessel,
		        modelle,
		        ...entwurf.basis.trim() === "" ? {} : { basis: entwurf.basis.trim() },
		        ...entwurf.umgebung.trim() === "" ? {} : { umgebung: entwurf.umgebung.trim() },
		        ...entwurf.notiz.trim() === "" ? {} : { notiz: entwurf.notiz.trim() }
		      };
		      await schicke(WEG_SPEICHERN, {
		        zugang,
		        ...entwurf.wert.trim() === "" ? {} : { wert: entwurf.wert.trim() }
		      });
		      setEntwurf(null);
		      setMeldung(t("saved"));
		      neuladen();
		    } catch (problem) {
		      setFormFehler(problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setSpeichert(false);
		    }
		  };
		  const entfernen = async (zugang) => {
		    if (!window.confirm(t("confirmDelete")))
		      return;
		    try {
		      await schicke(WEG_ENTFERNEN, { id: zugang.id });
		      setMeldung(t("removed"));
		      setPruefungen((alt) => {
		        const neu2 = { ...alt };
		        delete neu2[zugang.id];
		        return neu2;
		      });
		      neuladen();
		    } catch (problem) {
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    }
		  };
		  const pruefen = async (zugang) => {
		    setLaeuft(zugang.id);
		    setMeldung(null);
		    try {
		      const antwort = await schicke(WEG_PRUEFEN, { id: zugang.id });
		      setPruefungen((alt) => ({ ...alt, [zugang.id]: { art: "befund", befund: antwort.befund } }));
		    } catch (problem) {
		      setPruefungen((alt) => ({
		        ...alt,
		        [zugang.id]: { art: "fehler", meldung: problem instanceof Error ? problem.message : String(problem) }
		      }));
		    } finally {
		      setLaeuft(null);
		    }
		  };
		  const bereit = bestand?.zugaenge.filter((zugang) => zugang.stand === "bereit").length ?? 0;
		  return /* @__PURE__ */ jsx_runtime.jsxs("section", {
		    className: "pmh-zu",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-zu__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx(ZugaengeIcon, {}),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-zu__brandtext",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-zu__kicker",
		                    children: t("kicker")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("h1", {
		                    className: "pmh-zu__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__actions",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: `pmh-zu__dot${bereit > 0 ? " is-on" : ""}`
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-zu__state",
		                children: bestand === null ? "—" : `${String(bereit)} / ${String(bestand.zugaenge.length)} ${t("ready")}`
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn",
		                onClick: () => setEntwurf(leererEntwurf()),
		                type: "button",
		                children: t("new")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn pmh-zu__btn--ghost",
		                onClick: neuladen,
		                type: "button",
		                children: t("refresh")
		              }),
		              close === undefined ? null : /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn pmh-zu__btn--ghost",
		                onClick: close,
		                type: "button",
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__scroll",
		        children: [
		          meldung === null ? null : /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-zu__hinweis",
		            children: meldung
		          }),
		          fehler === null ? null : /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__fehler",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                children: t("error")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: fehler
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn",
		                onClick: neuladen,
		                type: "button",
		                children: t("refresh")
		              })
		            ]
		          }),
		          laden && bestand === null ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-zu__leer",
		            children: t("loading")
		          }) : null,
		          bestand !== null && bestand.zugaenge.length === 0 && entwurf === null ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-zu__leer",
		            children: t("empty")
		          }) : null,
		          bestand?.zugaenge.map((zugang) => /* @__PURE__ */ jsx_runtime.jsx(Karte, {
		            zugang,
		            t,
		            pruefung: pruefungen[zugang.id],
		            laeuft: laeuft === zugang.id,
		            onPruefen: () => void pruefen(zugang),
		            onBearbeiten: () => {
		              setFormFehler(null);
		              setEntwurf(alsEntwurf(zugang));
		            },
		            onEntfernen: () => void entfernen(zugang)
		          }, zugang.id)),
		          entwurf === null ? null : /* @__PURE__ */ jsx_runtime.jsx(Formular, {
		            entwurf,
		            familien: bestand?.familien ?? [],
		            t,
		            fehler: formFehler,
		            speichert,
		            onAendern: setEntwurf,
		            onSpeichern: () => void speichern(),
		            onAbbrechen: () => {
		              setEntwurf(null);
		              setFormFehler(null);
		            }
		          }),
		          bestand === null ? null : /* @__PURE__ */ jsx_runtime.jsxs("footer", {
		            className: "pmh-zu__fuss",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("b", {
		                    children: t("path")
		                  }),
		                  " ",
		                  bestand.datei
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("b", {
		                    children: t("scope")
		                  }),
		                  " ",
		                  bestand.geltung.nutzer ?? t("hostScope")
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-zu__fusshinweis",
		                children: t("hint")
		              })
		            ]
		          })
		        ]
		      })
		    ]
		  });
		}
		function Karte({ zugang, t, pruefung, laeuft, onPruefen, onBearbeiten, onEntfernen }) {
		  const standText = zugang.stand === "bereit" ? t("standBereit") : zugang.stand === "kein-schluessel" ? t("standKeinSchluessel") : t("standKeineFaehigkeit");
		  return /* @__PURE__ */ jsx_runtime.jsxs("article", {
		    className: "pmh-zu__karte",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__kopf",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__namen",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                className: "pmh-zu__name",
		                children: zugang.name
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-zu__marken",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: `pmh-zu__stand is-${zugang.stand}`,
		                    children: standText
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-zu__marke",
		                    children: zugang.familie
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-zu__marke",
		                    children: zugang.art === "lokal" ? t("local") : t("remote")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                    className: `pmh-zu__marke${zugang.schluesselstand.gesetzt ? " is-gesetzt" : ""}`,
		                    children: [
		                      zugang.schluesselstand.gesetzt ? t("keySet") : t("keyMissing"),
		                      zugang.schluesselstand.quelle === "umgebung" ? ` · ${t("keyEnv")}` : ""
		                    ]
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__knopfreihe",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn",
		                onClick: onPruefen,
		                disabled: laeuft,
		                type: "button",
		                children: laeuft ? t("testing") : t("test")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn pmh-zu__btn--ghost",
		                onClick: onBearbeiten,
		                type: "button",
		                children: t("edit")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("button", {
		                className: "pmh-zu__btn pmh-zu__btn--warn",
		                onClick: onEntfernen,
		                type: "button",
		                children: t("remove")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("ul", {
		        className: "pmh-zu__faecher",
		        children: FAEHIGKEITEN.map((faehigkeit) => {
		          const modell = zugang.modelle[faehigkeit];
		          if (modell === undefined)
		            return null;
		          return /* @__PURE__ */ jsx_runtime.jsxs("li", {
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: t(CAP_TEXT[faehigkeit])
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("code", {
		                children: modell
		              })
		            ]
		          }, faehigkeit);
		        })
		      }),
		      zugang.basis === undefined ? null : /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-zu__basis",
		        children: zugang.basis
		      }),
		      zugang.notiz === undefined ? null : /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-zu__notiz",
		        children: zugang.notiz
		      }),
		      pruefung === undefined ? null : pruefung.art === "fehler" ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-zu__prueffehler",
		        children: pruefung.meldung
		      }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__befund",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("p", {
		            className: "pmh-zu__befundkopf",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("b", {
		                children: t("testResult")
		              }),
		              " · ",
		              String(pruefung.befund.modellAnzahl),
		              " ",
		              t("models"),
		              " · ",
		              pruefung.befund.basis
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("ul", {
		            className: "pmh-zu__wege",
		            children: FAEHIGKEITEN.map((faehigkeit) => {
		              const wert = pruefung.befund.wege[faehigkeit] ?? "unbekannt";
		              const text = wert === "vorhanden" ? t("present") : wert === "fehlt" ? t("missing") : t("unknown");
		              return /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    children: t(CAP_TEXT[faehigkeit])
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("b", {
		                    className: `is-${wert}`,
		                    children: text
		                  })
		                ]
		              }, faehigkeit);
		            })
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-zu__grund",
		            children: pruefung.befund.bemerkung
		          })
		        ]
		      })
		    ]
		  });
		}
		function Formular({ entwurf, familien, t, fehler, speichert, onAendern, onSpeichern, onAbbrechen }) {
		  const familie = familien.find((eintrag) => eintrag.id === entwurf.familie);
		  const setze = (teil) => onAendern({ ...entwurf, ...teil });
		  return /* @__PURE__ */ jsx_runtime.jsxs("section", {
		    className: "pmh-zu__form",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("h2", {
		        className: "pmh-zu__formtitel",
		        children: entwurf.id === undefined ? t("new") : t("edit")
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__feld",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("label", {
		            htmlFor: "pmh-zu-name",
		            children: t("name")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("input", {
		            id: "pmh-zu-name",
		            value: entwurf.name,
		            onChange: (ereignis) => setze({ name: ereignis.target.value }),
		            placeholder: "OpenRouter privat"
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__doppel",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__feld",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("label", {
		                htmlFor: "pmh-zu-familie",
		                children: t("family")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                id: "pmh-zu-familie",
		                value: entwurf.familie,
		                onChange: (ereignis) => {
		                  const id = ereignis.target.value;
		                  setze({
		                    familie: id,
		                    ...id === "openai-kompatibel" ? { art: "lokal" } : {}
		                  });
		                },
		                children: [
		                  familien.map((eintrag) => /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: eintrag.id,
		                    children: eintrag.name
		                  }, eintrag.id)),
		                  familien.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: entwurf.familie,
		                    children: entwurf.familie
		                  }) : null
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__feld",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("label", {
		                htmlFor: "pmh-zu-key",
		                children: t("key")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("input", {
		                id: "pmh-zu-key",
		                type: "password",
		                autoComplete: "off",
		                value: entwurf.wert,
		                onChange: (ereignis) => setze({ wert: ereignis.target.value }),
		                placeholder: t("keyPlaceholder")
		              })
		            ]
		          })
		        ]
		      }),
		      familie?.stand === undefined ? null : /* @__PURE__ */ jsx_runtime.jsxs("p", {
		        className: "pmh-zu__familienstand",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("b", {
		            children: t("familyStand")
		          }),
		          " ",
		          familie.stand
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__feld",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("label", {
		            htmlFor: "pmh-zu-basis",
		            children: t("base")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("input", {
		            id: "pmh-zu-basis",
		            value: entwurf.basis,
		            onChange: (ereignis) => setze({ basis: ereignis.target.value }),
		            placeholder: "http://127.0.0.1:11434/v1"
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("span", {
		            className: "pmh-zu__hilfe",
		            children: t("baseHint")
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__doppel",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__feld",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("label", {
		                htmlFor: "pmh-zu-art",
		                children: t("kind")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                id: "pmh-zu-art",
		                value: entwurf.art,
		                onChange: (ereignis) => setze({ art: ereignis.target.value === "lokal" ? "lokal" : "fern" }),
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: "fern",
		                    children: t("remote")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: "lokal",
		                    children: t("local")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__feld",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("label", {
		                htmlFor: "pmh-zu-schluessel",
		                children: t("keyNeeded")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                id: "pmh-zu-schluessel",
		                value: entwurf.schluessel,
		                onChange: (ereignis) => setze({ schluessel: ereignis.target.value === "kein" ? "kein" : "noetig" }),
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: "noetig",
		                    children: t("keyNeeded")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("option", {
		                    value: "kein",
		                    children: t("keyOptional")
		                  })
		                ]
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("fieldset", {
		        className: "pmh-zu__faecherfeld",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("legend", {
		            children: t("capabilities")
		          }),
		          FAEHIGKEITEN.map((faehigkeit) => /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-zu__modell",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                children: t(CAP_TEXT[faehigkeit])
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("input", {
		                value: entwurf.modelle[faehigkeit] ?? "",
		                onChange: (ereignis) => {
		                  const modell = ereignis.target.value;
		                  const modelle = { ...entwurf.modelle };
		                  if (modell.trim() === "")
		                    delete modelle[faehigkeit];
		                  else
		                    modelle[faehigkeit] = modell;
		                  setze({ modelle });
		                },
		                placeholder: t("model"),
		                "aria-label": t(CAP_TEXT[faehigkeit])
		              })
		            ]
		          }, faehigkeit))
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__feld",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("label", {
		            htmlFor: "pmh-zu-umgebung",
		            children: t("env")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("input", {
		            id: "pmh-zu-umgebung",
		            value: entwurf.umgebung,
		            onChange: (ereignis) => setze({ umgebung: ereignis.target.value }),
		            placeholder: "OPENROUTER_API_KEY"
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("span", {
		            className: "pmh-zu__hilfe",
		            children: t("envHint")
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__feld",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("label", {
		            htmlFor: "pmh-zu-notiz",
		            children: t("note")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("input", {
		            id: "pmh-zu-notiz",
		            value: entwurf.notiz,
		            onChange: (ereignis) => setze({ notiz: ereignis.target.value }),
		            placeholder: t("notePlaceholder")
		          })
		        ]
		      }),
		      fehler === null ? null : /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-zu__prueffehler",
		        children: fehler
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-zu__knopfreihe",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: "pmh-zu__btn",
		            onClick: onSpeichern,
		            disabled: speichert,
		            type: "button",
		            children: t("save")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: "pmh-zu__btn pmh-zu__btn--ghost",
		            onClick: onAbbrechen,
		            type: "button",
		            children: t("cancel")
		          })
		        ]
		      })
		    ]
		  });
		}
		function ZugaengeIcon() {
		  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
		    width: "22",
		    height: "22",
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.4",
		    "aria-hidden": "true",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "8",
		        cy: "12",
		        r: "3.4"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M11.4 12H21m-3.2 0v3.2M21 12v2.2",
		        strokeLinecap: "round"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "8",
		        cy: "12",
		        r: "1",
		        fill: "currentColor",
		        stroke: "none"
		      })
		    ]
		  });
		}
		function ZugaengeItem({ view, t }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime.jsx("span", {
		      className: "pmh-zu__chip",
		      children: t("guide")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsx(ZugaengePanel, {
		    t
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhZugaenge = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "zugaenge: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close })
		    }, ZugaengePanel);
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
		        }, ZugaengeIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS
		        }, ZugaengeItem)));
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
		  }, "zugaenge: Anzeige nach den Einstellungen");
		}
		var CSS = `
		.pmh-zu{
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 80% 0%,#0f1d22 0%,#0a1013 55%,#06090b 100%);
		  color:#e8f1f2;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-zu__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-zu__brand{display:flex;align-items:center;gap:11px;color:#7fe0c0}
		.pmh-zu__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-zu__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(127,224,192,.55)}
		.pmh-zu__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2fbf8}
		.pmh-zu__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f6ec}
		.pmh-zu__actions{display:flex;align-items:center;gap:9px;min-width:0}
		.pmh-zu__dot{width:6px;height:6px;border-radius:50%;background:#4c6b70;box-shadow:0 0 0 4px rgba(76,107,112,.12)}
		.pmh-zu__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
		.pmh-zu__state{max-width:24ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.5)}
		.pmh-zu__btn{
		  appearance:none;border:1px solid rgba(127,224,192,.24);background:rgba(14,30,32,.6);
		  color:#e9fbf4;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  cursor:pointer;transition:border-color .18s ease,background .18s ease;
		}
		.pmh-zu__btn:hover:not(:disabled){border-color:rgba(127,224,192,.65);background:rgba(22,48,48,.8)}
		.pmh-zu__btn:disabled{opacity:.45;cursor:default}
		.pmh-zu__btn--ghost{border-color:transparent;background:transparent;color:rgba(232,241,242,.6)}
		.pmh-zu__btn--warn{border-color:rgba(255,140,140,.28);color:#ffc9c9;background:rgba(50,18,22,.5)}
		.pmh-zu__btn--warn:hover:not(:disabled){border-color:rgba(255,140,140,.6);background:rgba(70,22,28,.7)}
		.pmh-zu__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 26px}
		.pmh-zu__leer{margin:12px 0;color:rgba(232,241,242,.45);font-size:12px}
		.pmh-zu__hinweis{margin:0 0 12px;padding:8px 11px;border:1px solid rgba(127,224,192,.24);border-radius:9px;background:rgba(127,224,192,.07);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(226,250,242,.78)}
		.pmh-zu__fehler{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px;padding:15px 16px;font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,207,207,.85);border:1px solid rgba(255,120,120,.26);border-radius:10px;background:rgba(60,20,30,.35)}
		.pmh-zu__fehler strong{font-weight:600;color:#ffdcdc;flex-basis:100%}
		.pmh-zu__fehler span{flex:1 1 auto;min-width:0;color:rgba(255,207,207,.8)}
		.pmh-zu__karte{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.01));padding:14px 16px 16px;margin-bottom:12px}
		.pmh-zu__kopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
		.pmh-zu__namen{min-width:0}
		.pmh-zu__name{margin:0 0 6px;font-size:14px;font-weight:600;color:#f4fbf8}
		.pmh-zu__marken{display:flex;flex-wrap:wrap;gap:6px}
		.pmh-zu__stand{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;text-transform:uppercase;border-radius:999px;padding:3px 7px;border:1px solid rgba(255,255,255,.14);color:rgba(232,241,242,.6)}
		.pmh-zu__stand.is-bereit{color:#8fe3c6;border-color:rgba(105,214,163,.4);background:rgba(105,214,163,.09)}
		.pmh-zu__stand.is-kein-schluessel{color:#f0c98d;border-color:rgba(233,198,143,.38);background:rgba(233,198,143,.08)}
		.pmh-zu__stand.is-keine-faehigkeit{color:#ffb4b4;border-color:rgba(255,140,140,.32);background:rgba(255,140,140,.07)}
		.pmh-zu__marke{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.06em;border-radius:999px;padding:3px 7px;border:1px solid rgba(255,255,255,.1);color:rgba(232,241,242,.42)}
		.pmh-zu__marke.is-gesetzt{color:#9fe8cf;border-color:rgba(105,214,163,.32)}
		.pmh-zu__knopfreihe{display:flex;flex-wrap:wrap;gap:7px;flex:0 0 auto}
		.pmh-zu__faecher{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
		.pmh-zu__faecher li{display:flex;align-items:baseline;gap:7px;padding:4px 8px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.02)}
		.pmh-zu__faecher span{font:9.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.4)}
		.pmh-zu__faecher code{font:10.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f6ec}
		.pmh-zu__basis,.pmh-zu__notiz{margin:8px 0 0;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42);word-break:break-all}
		.pmh-zu__befund{margin-top:12px;padding-top:11px;border-top:1px dashed rgba(255,255,255,.07)}
		.pmh-zu__befundkopf{margin:0 0 7px;font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42);word-break:break-all}
		.pmh-zu__befundkopf b{margin-right:5px;color:rgba(127,224,192,.75);font-weight:600}
		.pmh-zu__wege{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px 12px}
		.pmh-zu__wege li{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.45)}
		.pmh-zu__wege b{font-weight:600;color:rgba(232,241,242,.42)}
		.pmh-zu__wege b.is-vorhanden{color:#8fe3c6}
		.pmh-zu__wege b.is-fehlt{color:#ff9f9f}
		.pmh-zu__wege b.is-unbekannt{color:#f0c98d}
		.pmh-zu__grund{margin:8px 0 0;font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.34)}
		.pmh-zu__prueffehler{margin:10px 0 0;font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,167,167,.82)}
		.pmh-zu__form{margin-top:6px;border:1px solid rgba(127,224,192,.22);border-radius:12px;background:rgba(16,32,34,.5);padding:16px 16px 18px}
		.pmh-zu__formtitel{margin:0 0 14px;font:600 13px/1.2 "Segoe UI", system-ui, sans-serif;color:#eafaf4}
		.pmh-zu__feld{display:flex;flex-direction:column;gap:5px;margin-bottom:12px;min-width:0}
		.pmh-zu__feld>label{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,241,242,.42)}
		.pmh-zu__feld input,.pmh-zu__feld select{
		  appearance:none;width:100%;min-width:0;border:1px solid rgba(127,224,192,.2);border-radius:8px;
		  background:rgba(6,12,14,.75);color:#eafaf4;padding:7px 9px;font:11.5px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;
		}
		.pmh-zu__feld input:focus,.pmh-zu__feld select:focus{border-color:rgba(127,224,192,.6);box-shadow:0 0 0 3px rgba(127,224,192,.09)}
		.pmh-zu__hilfe{font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.3)}
		.pmh-zu__doppel{display:grid;grid-template-columns:1fr 1fr;gap:12px}
		.pmh-zu__familienstand{margin:0 0 12px;padding:8px 10px;border-left:2px solid rgba(127,224,192,.35);font:10px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.42)}
		.pmh-zu__familienstand b{margin-right:5px;color:rgba(127,224,192,.7);font-weight:600}
		.pmh-zu__faecherfeld{margin:0 0 12px;padding:11px 12px 6px;border:1px solid rgba(255,255,255,.07);border-radius:9px}
		.pmh-zu__faecherfeld legend{font:9.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(232,241,242,.42);padding:0 5px}
		.pmh-zu__modell{display:grid;grid-template-columns:minmax(110px,150px) minmax(0,1fr);align-items:center;gap:10px;margin-bottom:7px}
		.pmh-zu__modell span{font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.5)}
		.pmh-zu__modell input{appearance:none;min-width:0;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:rgba(6,12,14,.7);color:#eafaf4;padding:6px 8px;font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
		.pmh-zu__modell input:focus{border-color:rgba(127,224,192,.5)}
		.pmh-zu__fuss{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding-top:12px;border-top:1px solid rgba(255,255,255,.06);font:9.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(232,241,242,.36);word-break:break-all}
		.pmh-zu__fuss b{margin-right:5px;color:rgba(127,224,192,.6);font-weight:600}
		.pmh-zu__fusshinweis{width:100%;color:rgba(232,241,242,.28)}
		@media (max-width:820px){
		  .pmh-zu__doppel{grid-template-columns:1fr}
		  .pmh-zu__kopf{flex-direction:column}
		  .pmh-zu__state{display:none}
		}
		`;

		return module.exports;
	}
});
