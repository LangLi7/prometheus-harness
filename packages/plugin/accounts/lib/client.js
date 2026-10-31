/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/accounts/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/accounts/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/accounts",
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
		  KontenIcon: () => KontenIcon,
		  KontenPanel: () => KontenPanel,
		  PANEL_ID: () => PANEL_ID,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "konten";
		var ENTRY_ID = "pmh-accounts";
		var NS = "konten";
		var STANDARD_REIHENFOLGE = 12;
		function liesAnzeige(config) {
		  const flaeche = config?.surface;
		  const oberflaeche = flaeche === "plugins" || flaeche === "both" || flaeche === "none" || flaeche === "sidebar" ? flaeche : "sidebar";
		  const platz = config?.order;
		  const reihenfolge = typeof platz === "number" && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE;
		  const roh = config?.label;
		  const beschriftung = typeof roh === "string" && roh.trim() !== "" ? roh.trim() : undefined;
		  return { oberflaeche, reihenfolge, beschriftung };
		}
		var inject = ["slots", "locale", "layout", "configForms"];
		var CSRF_KEKS = "pmh_csrf";
		var CSRF_KOPF = "x-pmh-csrf";
		var ANMELDUNG = "/anmeldung/";
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
		async function hole(url) {
		  const antwort = await fetch(url, { credentials: "same-origin", cache: "no-store" });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (daten?.ok === true)
		    return daten.value;
		  throw new ServerFehler(daten?.error?.code ?? `http-${String(antwort.status)}`, daten?.error?.message ?? `HTTP ${String(antwort.status)}`, daten?.konten ?? []);
		}

		class ServerFehler extends Error {
		  code;
		  konten;
		  constructor(code, message, konten = []) {
		    super(message);
		    this.code = code;
		    this.konten = konten;
		  }
		}
		async function sende(url, koerper) {
		  const antwort = await fetch(url, {
		    method: "POST",
		    credentials: "same-origin",
		    cache: "no-store",
		    headers: { "content-type": "application/json", [CSRF_KOPF]: keksWert(CSRF_KEKS) },
		    body: JSON.stringify(koerper)
		  });
		  const daten = await antwort.json().catch(() => {
		    return;
		  });
		  if (daten?.ok === true)
		    return daten.value;
		  throw new ServerFehler(daten?.error?.code ?? "unbekannt", daten?.error?.message ?? `HTTP ${String(antwort.status)}`, daten?.konten ?? []);
		}
		function zustandText(zustand, t) {
		  switch (zustand) {
		    case "offen":
		      return t("open");
		    case "eingeloest":
		      return t("redeemed");
		    case "abgelaufen":
		      return t("expired");
		    case "zurueckgezogen":
		      return t("revoked");
		  }
		}
		function einladungsLink(token) {
		  return `${window.location.origin}${ANMELDUNG}?token=${encodeURIComponent(token)}`;
		}
		function KontenPanel({ close, t }) {
		  const [ich, setIch] = import_react.useState(null);
		  const [geprueft, setGeprueft] = import_react.useState(false);
		  const [benutzer, setBenutzer] = import_react.useState([]);
		  const [einladungen, setEinladungen] = import_react.useState([]);
		  const [auswahl, setAuswahl] = import_react.useState([]);
		  const [neue, setNeue] = import_react.useState(null);
		  const [dauer, setDauer] = import_react.useState(7 * 24 * 60 * 60);
		  const [notiz, setNotiz] = import_react.useState("");
		  const [kopiert, setKopiert] = import_react.useState(false);
		  const [fehler, setFehler] = import_react.useState(null);
		  const [laden, setLaden] = import_react.useState(true);
		  const [arbeitet, setArbeitet] = import_react.useState(false);
		  const [neuOffen, setNeuOffen] = import_react.useState(false);
		  const [neuEmail, setNeuEmail] = import_react.useState("");
		  const [neuName, setNeuName] = import_react.useState("");
		  const [neuRolle, setNeuRolle] = import_react.useState("user");
		  const [passwortLink, setPasswortLink] = import_react.useState(null);
		  const [linkKopiert, setLinkKopiert] = import_react.useState(false);
		  const [bestaetigen, setBestaetigen] = import_react.useState(null);
		  const istAdmin = ich?.role === "admin";
		  const lade = import_react.useCallback(async () => {
		    setLaden(true);
		    setFehler(null);
		    try {
		      const ich_ = await hole("/api/pmh/auth/me").catch(async (problem) => {
		        if (problem instanceof ServerFehler && problem.code === "nicht-angemeldet") {
		          try {
		            await sende("/api/pmh/auth/betreiber", {});
		          } catch (zweiter) {
		            if (zweiter instanceof ServerFehler && zweiter.code === "mehrere-admins") {
		              setAuswahl(zweiter.konten);
		              return;
		            }
		            throw zweiter;
		          }
		          return await hole("/api/pmh/auth/me");
		        }
		        throw problem;
		      });
		      if (ich_ === undefined) {
		        setIch(null);
		        setBenutzer([]);
		        setEinladungen([]);
		        return;
		      }
		      setAuswahl([]);
		      setIch(ich_);
		      if (ich_.role !== "admin") {
		        setBenutzer([]);
		        setEinladungen([]);
		        return;
		      }
		      const [k, e] = await Promise.all([
		        hole("/api/pmh/auth/benutzer"),
		        hole("/api/pmh/auth/einladungen")
		      ]);
		      setBenutzer(k.benutzer ?? []);
		      setEinladungen(e.einladungen ?? []);
		    } catch (problem) {
		      if (problem instanceof ServerFehler && problem.code === "kein-token") {
		        setIch(null);
		        setBenutzer([]);
		        setEinladungen([]);
		        return;
		      }
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setGeprueft(true);
		      setLaden(false);
		    }
		  }, []);
		  import_react.useEffect(() => {
		    lade();
		  }, [lade]);
		  const aendere = async (arbeit) => {
		    setArbeitet(true);
		    setFehler(null);
		    try {
		      await arbeit();
		      await lade();
		    } catch (problem) {
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setArbeitet(false);
		    }
		  };
		  const beimSperren = (id, gesperrt) => {
		    aendere(() => sende("/api/pmh/auth/benutzer/status", { id, gesperrt }));
		  };
		  const waehle = (id) => {
		    setAuswahl([]);
		    aendere(() => sende("/api/pmh/auth/betreiber", { userId: id }));
		  };
		  const beimAnlegen = () => {
		    setPasswortLink(null);
		    aendere(async () => {
		      const frisch = await sende("/api/pmh/auth/benutzer/neu", {
		        email: neuEmail,
		        displayName: neuName,
		        rolle: neuRolle
		      });
		      setPasswortLink(frisch);
		      setNeuEmail("");
		      setNeuName("");
		      setNeuRolle("user");
		      setNeuOffen(false);
		    });
		  };
		  const beimRolle = (id, rolle) => {
		    aendere(() => sende("/api/pmh/auth/benutzer/rolle", { id, rolle }));
		  };
		  const beimPasswortLink = (id) => {
		    setPasswortLink(null);
		    aendere(async () => {
		      const frisch = await sende("/api/pmh/auth/passwort/link", { id });
		      setPasswortLink(frisch);
		    });
		  };
		  const beimLoeschen = (id) => {
		    if (bestaetigen !== id) {
		      setBestaetigen(id);
		      return;
		    }
		    setBestaetigen(null);
		    aendere(() => sende("/api/pmh/auth/benutzer/loeschen", { id }));
		  };
		  const beimEinladen = () => {
		    setKopiert(false);
		    aendere(async () => {
		      const frisch = await sende("/api/pmh/auth/einladungen/neu", {
		        dauerSekunden: dauer,
		        notiz
		      });
		      setNeue(frisch);
		      setNotiz("");
		    });
		  };
		  const beimZuruecknehmen = (id) => {
		    aendere(() => sende("/api/pmh/auth/einladungen/zuruecknehmen", { id }));
		  };
		  const beimKopieren = async (token) => {
		    try {
		      await navigator.clipboard.writeText(einladungsLink(token));
		      setKopiert(true);
		    } catch {
		      setKopiert(false);
		      setFehler("Kopieren ging nicht — bitte den Link von Hand markieren.");
		    }
		  };
		  const kopf = /* @__PURE__ */ jsx_runtime.jsxs("header", {
		    className: "pmh-kt__head",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-kt__brand",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx(KontenIcon, {
		            size: 22
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-kt__brandtext",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx("span", {
		                className: "pmh-kt__kicker",
		                children: t("kicker")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                className: "pmh-kt__title",
		                children: t("title")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-kt__actions",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: "pmh-kt__btn",
		            type: "button",
		            onClick: () => void lade(),
		            disabled: laden,
		            children: t("refresh")
		          }),
		          close !== undefined && /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: "pmh-kt__btn pmh-kt__btn--ghost",
		            type: "button",
		            onClick: close,
		            children: t("close")
		          })
		        ]
		      })
		    ]
		  });
		  if (!geprueft) {
		    return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		      className: "pmh-kt",
		      children: [
		        kopf,
		        /* @__PURE__ */ jsx_runtime.jsx("p", {
		          className: "pmh-kt__leer",
		          children: t("loading")
		        })
		      ]
		    });
		  }
		  if (!istAdmin) {
		    return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		      className: "pmh-kt",
		      children: [
		        kopf,
		        auswahl.length > 0 ? /* @__PURE__ */ jsx_runtime.jsxs("div", {
		          className: "pmh-kt__hinweis",
		          children: [
		            /* @__PURE__ */ jsx_runtime.jsx("strong", {
		              children: t("chooseAdmin")
		            }),
		            /* @__PURE__ */ jsx_runtime.jsx("p", {
		              children: t("chooseAdminHint")
		            }),
		            /* @__PURE__ */ jsx_runtime.jsxs("div", {
		              className: "pmh-kt__linkzeile",
		              children: [
		                auswahl.map((konto) => /* @__PURE__ */ jsx_runtime.jsx("button", {
		                  className: "pmh-kt__btn",
		                  type: "button",
		                  disabled: arbeitet,
		                  onClick: () => waehle(konto.id),
		                  children: konto.displayName === undefined || konto.displayName === "" ? konto.email : konto.displayName
		                }, konto.id)),
		                /* @__PURE__ */ jsx_runtime.jsx("button", {
		                  className: "pmh-kt__btn pmh-kt__btn--ghost",
		                  type: "button",
		                  onClick: () => void lade(),
		                  children: t("retry")
		                })
		              ]
		            })
		          ]
		        }) : /* @__PURE__ */ jsx_runtime.jsxs("div", {
		          className: "pmh-kt__hinweis",
		          children: [
		            /* @__PURE__ */ jsx_runtime.jsx("strong", {
		              children: t("notAdmin")
		            }),
		            /* @__PURE__ */ jsx_runtime.jsx("p", {
		              children: fehler ?? t("notAdminHint")
		            }),
		            /* @__PURE__ */ jsx_runtime.jsxs("div", {
		              className: "pmh-kt__linkzeile",
		              children: [
		                /* @__PURE__ */ jsx_runtime.jsx("a", {
		                  className: "pmh-kt__btn",
		                  href: ANMELDUNG,
		                  children: t("signIn")
		                }),
		                /* @__PURE__ */ jsx_runtime.jsx("button", {
		                  className: "pmh-kt__btn pmh-kt__btn--ghost",
		                  type: "button",
		                  onClick: () => void lade(),
		                  children: t("retry")
		                })
		              ]
		            })
		          ]
		        })
		      ]
		    });
		  }
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-kt",
		    children: [
		      kopf,
		      fehler !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-kt__fehler",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("span", {
		            children: fehler
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: "pmh-kt__btn",
		            type: "button",
		            onClick: () => void lade(),
		            children: t("retry")
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-kt__body",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-kt__abschnitt",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-kt__abschnittkopf",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                    children: t("users")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-kt__zahl",
		                    children: benutzer.length
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    className: "pmh-kt__btn pmh-kt__btn--klein pmh-kt__rechts",
		                    type: "button",
		                    disabled: arbeitet,
		                    onClick: () => {
		                      setNeuOffen(!neuOffen);
		                      setPasswortLink(null);
		                    },
		                    children: neuOffen ? t("cancel") : t("newUser")
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-kt__still",
		                children: t("usersHint")
		              }),
		              neuOffen && /* @__PURE__ */ jsx_runtime.jsxs("form", {
		                className: "pmh-kt__form",
		                onSubmit: (ereignis) => {
		                  ereignis.preventDefault();
		                  beimAnlegen();
		                },
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-kt__feld",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("email")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("input", {
		                        type: "email",
		                        value: neuEmail,
		                        autoComplete: "off",
		                        required: true,
		                        onChange: (e) => setNeuEmail(e.target.value)
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-kt__feld",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("name")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("input", {
		                        type: "text",
		                        value: neuName,
		                        autoComplete: "off",
		                        onChange: (e) => setNeuName(e.target.value)
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-kt__feld pmh-kt__feld--schmal",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("role")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                        value: neuRolle,
		                        onChange: (e) => setNeuRolle(e.target.value === "admin" ? "admin" : "user"),
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: "user",
		                            children: t("roleUser")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: "admin",
		                            children: t("roleAdmin")
		                          })
		                        ]
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    className: "pmh-kt__btn pmh-kt__btn--voll",
		                    type: "submit",
		                    disabled: arbeitet,
		                    children: t("createUser")
		                  })
		                ]
		              }),
		              passwortLink !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-kt__link",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsxs("strong", {
		                    children: [
		                      t("passwordLinkTitle"),
		                      " · ",
		                      passwortLink.email
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("code", {
		                    children: `${window.location.origin}${passwortLink.link}`
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                    className: "pmh-kt__linkzeile",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("button", {
		                        className: "pmh-kt__btn pmh-kt__btn--klein",
		                        type: "button",
		                        onClick: () => {
		                          navigator.clipboard.writeText(`${window.location.origin}${passwortLink.link}`);
		                          setLinkKopiert(true);
		                        },
		                        children: linkKopiert ? t("copied") : t("copy")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("small", {
		                        children: t("passwordLinkHint")
		                      })
		                    ]
		                  })
		                ]
		              }),
		              benutzer.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-kt__leer",
		                children: t("emptyUsers")
		              }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                className: "pmh-kt__liste",
		                children: benutzer.map((zeile) => {
		                  const selbst = zeile.id === ich?.id;
		                  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                    className: zeile.gesperrt ? "pmh-kt__zeile is-gesperrt" : "pmh-kt__zeile",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                        className: "pmh-kt__wer",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("span", {
		                            className: "pmh-kt__mail",
		                            children: zeile.email
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsxs("span", {
		                            className: "pmh-kt__name",
		                            children: [
		                              zeile.displayName === "" ? "—" : zeile.displayName,
		                              selbst ? ` · ${t("self")}` : ""
		                            ]
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        className: zeile.role === "admin" ? "pmh-kt__rolle is-admin" : "pmh-kt__rolle",
		                        children: zeile.role === "admin" ? t("roleAdmin") : t("roleUser")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        className: zeile.gesperrt ? "pmh-kt__stand is-gesperrt" : "pmh-kt__stand",
		                        children: zeile.gesperrt ? t("blocked") : t("active")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("small", {
		                        className: "pmh-kt__datum",
		                        children: new Date(zeile.erstelltAm).toLocaleDateString()
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                        className: "pmh-kt__aktionen",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("button", {
		                            className: "pmh-kt__btn pmh-kt__btn--klein",
		                            type: "button",
		                            disabled: arbeitet || selbst,
		                            onClick: () => beimSperren(zeile.id, !zeile.gesperrt),
		                            children: zeile.gesperrt ? t("unblock") : t("block")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("button", {
		                            className: "pmh-kt__btn pmh-kt__btn--klein",
		                            type: "button",
		                            disabled: arbeitet || selbst,
		                            onClick: () => beimRolle(zeile.id, zeile.role === "admin" ? "user" : "admin"),
		                            children: zeile.role === "admin" ? t("makeUser") : t("makeAdmin")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("button", {
		                            className: "pmh-kt__btn pmh-kt__btn--klein",
		                            type: "button",
		                            disabled: arbeitet || zeile.gesperrt,
		                            onClick: () => beimPasswortLink(zeile.id),
		                            children: t("passwordLink")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("button", {
		                            className: bestaetigen === zeile.id ? "pmh-kt__btn pmh-kt__btn--klein pmh-kt__btn--gefahr is-scharf" : "pmh-kt__btn pmh-kt__btn--klein pmh-kt__btn--gefahr",
		                            type: "button",
		                            disabled: arbeitet || selbst,
		                            onClick: () => beimLoeschen(zeile.id),
		                            onBlur: () => setBestaetigen(null),
		                            children: bestaetigen === zeile.id ? t("deleteSure") : t("delete")
		                          })
		                        ]
		                      })
		                    ]
		                  }, zeile.id);
		                })
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            className: "pmh-kt__abschnitt",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-kt__abschnittkopf",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("h3", {
		                    children: t("invitations")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-kt__zahl",
		                    children: einladungen.filter((e) => e.zustand === "offen").length
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-kt__still",
		                children: t("invitationsHint")
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-kt__form",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-kt__feld",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("duration")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("select", {
		                        value: String(dauer),
		                        onChange: (ereignis) => setDauer(Number(ereignis.target.value)),
		                        children: [
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: String(60 * 60),
		                            children: t("hour")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: String(24 * 60 * 60),
		                            children: t("day")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: String(7 * 24 * 60 * 60),
		                            children: t("week")
		                          }),
		                          /* @__PURE__ */ jsx_runtime.jsx("option", {
		                            value: String(30 * 24 * 60 * 60),
		                            children: t("month")
		                          })
		                        ]
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("label", {
		                    className: "pmh-kt__feld",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("span", {
		                        children: t("note")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsx("input", {
		                        type: "text",
		                        value: notiz,
		                        maxLength: 120,
		                        onChange: (ereignis) => setNotiz(ereignis.target.value),
		                        placeholder: "für Anna"
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    className: "pmh-kt__btn pmh-kt__btn--voll",
		                    type: "button",
		                    disabled: arbeitet,
		                    onClick: beimEinladen,
		                    children: t("create")
		                  })
		                ]
		              }),
		              neue !== null && /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                className: "pmh-kt__link",
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("strong", {
		                    children: t("linkTitle")
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("code", {
		                    children: einladungsLink(neue.token)
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                    className: "pmh-kt__linkzeile",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime.jsx("button", {
		                        className: "pmh-kt__btn",
		                        type: "button",
		                        onClick: () => void beimKopieren(neue.token),
		                        children: kopiert ? t("copied") : t("copy")
		                      }),
		                      /* @__PURE__ */ jsx_runtime.jsxs("small", {
		                        children: [
		                          t("duration"),
		                          " ",
		                          new Date(neue.laeuftAb).toLocaleString()
		                        ]
		                      })
		                    ]
		                  })
		                ]
		              }),
		              einladungen.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-kt__leer",
		                children: t("emptyInvitations")
		              }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                className: "pmh-kt__liste",
		                children: einladungen.map((zeile) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
		                  className: "pmh-kt__zeile",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime.jsx("span", {
		                      className: `pmh-kt__stand is-${zeile.zustand}`,
		                      children: zustandText(zeile.zustand, t)
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsx("span", {
		                      className: "pmh-kt__name",
		                      children: zeile.note === "" ? "—" : zeile.note
		                    }),
		                    /* @__PURE__ */ jsx_runtime.jsx("small", {
		                      className: "pmh-kt__datum",
		                      children: new Date(zeile.laeuftAb).toLocaleString()
		                    }),
		                    zeile.zustand === "offen" && /* @__PURE__ */ jsx_runtime.jsx("button", {
		                      className: "pmh-kt__btn pmh-kt__btn--klein",
		                      type: "button",
		                      disabled: arbeitet,
		                      onClick: () => beimZuruecknehmen(zeile.id),
		                      children: t("revoke")
		                    })
		                  ]
		                }, zeile.id))
		              })
		            ]
		          })
		        ]
		      })
		    ]
		  });
		}
		function KontenIcon({ size = 20 }) {
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
		        cx: "9",
		        cy: "8",
		        r: "3.2"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M3.5 19c0-2.8 2.4-4.6 5.5-4.6s5.5 1.8 5.5 4.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "17",
		        cy: "9.5",
		        r: "2.3"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("path", {
		        d: "M15.2 14.6c2.6.2 4.3 1.8 4.3 4.1"
		      })
		    ]
		  });
		}
		function KontenItem({ view, t }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime.jsx("span", {
		      className: "pmh-kt__chip",
		      children: t("panel")
		    });
		  return /* @__PURE__ */ jsx_runtime.jsx(KontenPanel, {
		    t
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhKonten = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "konten: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close })
		    }, KontenPanel);
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
		        }, KontenIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS
		        }, KontenItem)));
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
		  }, "konten: Anzeige nach den Einstellungen");
		}
		var CSS = `
		.pmh-kt{
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 15% 0%,#0f1a18 0%,#090d0c 55%,#07090a 100%);
		  color:#e9f2ef;font:13px/1.5 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-kt__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-kt__brand{display:flex;align-items:center;gap:11px;color:#a8e6cf}
		.pmh-kt__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-kt__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(168,230,207,.55)}
		.pmh-kt__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2fff9}
		/* **Die eine Zeile der Plugin-Liste.** Monospace wie die übrigen Kurztexte des Panels, in der
		   Farbe der Marke — sie steht dort, wo sonst der Titel der Karte steht, und soll nicht wie ein
		   Fließtext aussehen. */
		.pmh-kt__chip{font:11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d9f7ec}
		.pmh-kt__actions{display:flex;align-items:center;gap:9px}
		.pmh-kt__btn{
		  appearance:none;border:1px solid rgba(150,220,195,.22);background:rgba(18,34,30,.6);
		  color:#e8faf3;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  cursor:pointer;text-decoration:none;transition:border-color .18s ease,background .18s ease;
		}
		.pmh-kt__btn:hover:not(:disabled){border-color:rgba(150,230,200,.6);background:rgba(28,52,46,.75)}
		.pmh-kt__btn:disabled{opacity:.45;cursor:default}
		.pmh-kt__btn--ghost{border-color:transparent;background:transparent;color:rgba(233,242,239,.6)}
		.pmh-kt__btn--klein{padding:4px 8px;font-size:10px}
		.pmh-kt__btn--voll{width:100%}
		.pmh-kt__body{flex:1;min-height:0;overflow:auto;padding:18px 20px 26px;display:grid;gap:26px}
		.pmh-kt__abschnitt{display:flex;flex-direction:column;gap:8px}
		.pmh-kt__abschnittkopf{display:flex;align-items:baseline;gap:9px}
		.pmh-kt__abschnittkopf h3{margin:0;font-size:15px;font-weight:600;color:#f2fff9;letter-spacing:-.01em}
		.pmh-kt__zahl{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(168,230,207,.7);border:1px solid rgba(150,220,195,.22);border-radius:999px;padding:3px 7px}
		.pmh-kt__still{margin:0 0 4px;font-size:11.5px;line-height:1.5;color:rgba(233,242,239,.5);max-width:78ch}
		.pmh-kt__leer{margin:10px 0;color:rgba(233,242,239,.42);font-size:12px}
		.pmh-kt__fehler{display:flex;align-items:center;gap:12px;margin:14px 20px 0;padding:10px 12px;border:1px solid rgba(255,120,120,.25);border-radius:9px;background:rgba(60,20,30,.35);color:#ffd9d9;font-size:12px}
		.pmh-kt__hinweis{margin:22px 20px;padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.02)}
		.pmh-kt__hinweis strong{display:block;margin-bottom:4px;color:#f2fff9}
		.pmh-kt__hinweis p{margin:0 0 12px;color:rgba(233,242,239,.55);font-size:12px}
		.pmh-kt__liste{list-style:none;margin:0;padding:0;display:grid;gap:6px}
		.pmh-kt__zeile{display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;padding:8px 10px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:rgba(255,255,255,.015)}
		.pmh-kt__zeile.is-gesperrt{opacity:.62}
		.pmh-kt__wer{display:flex;flex-direction:column;gap:1px;min-width:180px;flex:1}
		.pmh-kt__mail{font-size:12.5px;color:#f0fdf8;overflow-wrap:anywhere}
		.pmh-kt__name{font-size:11px;color:rgba(233,242,239,.45)}
		.pmh-kt__rolle{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;padding:4px 7px;border-radius:999px;border:1px solid rgba(150,220,195,.2);color:rgba(233,242,239,.55)}
		.pmh-kt__rolle.is-admin{border-color:rgba(255,205,120,.45);color:#ffd88a}
		.pmh-kt__stand{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;padding:4px 7px;border-radius:999px;border:1px solid rgba(120,220,160,.35);color:#8fe3b6}
		.pmh-kt__stand.is-gesperrt,.pmh-kt__stand.is-abgelaufen,.pmh-kt__stand.is-zurueckgezogen{border-color:rgba(255,140,140,.35);color:#ffb4b4}
		.pmh-kt__stand.is-eingeloest{border-color:rgba(150,190,255,.35);color:#a9c6ff}
		.pmh-kt__datum{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,242,239,.35);margin-left:auto}
		.pmh-kt__form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end;margin:6px 0 12px;max-width:640px}
		.pmh-kt__feld{display:grid;gap:4px;font-size:11px;color:rgba(233,242,239,.55)}
		.pmh-kt__feld select,.pmh-kt__feld input{
		  padding:7px 9px;border:1px solid rgba(150,220,195,.2);border-radius:7px;background:rgba(8,14,12,.6);
		  color:#e9f2ef;font:12px/1.3 "Segoe UI", system-ui, sans-serif;outline:none;
		}
		.pmh-kt__feld select:focus-visible,.pmh-kt__feld input:focus-visible{border-color:rgba(150,230,200,.55);box-shadow:0 0 0 3px rgba(90,200,160,.1)}
		.pmh-kt__link{display:grid;gap:8px;margin:0 0 14px;padding:12px;border:1px solid rgba(150,220,195,.22);border-radius:9px;background:rgba(10,20,17,.6);max-width:680px}
		.pmh-kt__link strong{font-size:12px;color:#f2fff9}
		.pmh-kt__link code{font:11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:#a8e6cf;word-break:break-all;background:rgba(0,0,0,.25);padding:8px;border-radius:6px}
		.pmh-kt__linkzeile{display:flex;align-items:center;gap:12px}
		.pmh-kt__linkzeile small{font:10px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,242,239,.4)}
		/* **Die Zeile trägt jetzt Handlungen.** Datum und Aktionen teilen sich den
		   rechten Rand: das Datum bleibt ruhig, die vier Knöpfe stehen dahinter. */
		.pmh-kt__zeile .pmh-kt__datum{margin-left:0}
		.pmh-kt__aktionen{display:flex;flex-wrap:wrap;gap:6px;margin-left:auto}
		.pmh-kt__aktionen .pmh-kt__btn{opacity:.72}
		.pmh-kt__zeile:hover .pmh-kt__aktionen .pmh-kt__btn{opacity:1}
		.pmh-kt__rechts{margin-left:auto}
		.pmh-kt__btn--gefahr{color:rgba(255,180,180,.8);border-color:rgba(255,140,140,.22)}
		.pmh-kt__btn--gefahr:hover:not(:disabled){border-color:rgba(255,140,140,.6);background:rgba(60,20,20,.6);color:#ffd0d0}
		.pmh-kt__btn--gefahr.is-scharf{background:rgba(120,30,30,.75);border-color:rgba(255,140,140,.7);color:#fff}
		.pmh-kt__feld--schmal{max-width:140px}
		@media (max-width:760px){
		  .pmh-kt__body{padding:14px}
		  .pmh-kt__wer{min-width:120px}
		  .pmh-kt__datum{margin-left:0}
		  .pmh-kt__aktionen{margin-left:0;width:100%}
		}
		`;

		return module.exports;
	}
});
