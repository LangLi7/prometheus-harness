/**
 * Browser-Hälfte. ERZEUGT von `packages/client/tabs/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/client/tabs/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/client-tabs",
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

		// packages/client/tabs/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  OpenInNewTabRow: () => OpenInNewTabRow,
		  PANEL_ID: () => PANEL_ID,
		  PFAD_CHAT: () => PFAD_CHAT,
		  PFAD_UEBERSICHT: () => PFAD_UEBERSICHT,
		  WorkspacesIcon: () => WorkspacesIcon,
		  WorkspacesPanel: () => WorkspacesPanel,
		  aliasZiel: () => aliasZiel,
		  apply: () => apply,
		  chatHref: () => chatHref,
		  gleichesZiel: () => gleichesZiel,
		  hrefFor: () => hrefFor,
		  inject: () => inject,
		  name: () => name,
		  parsePfad: () => parsePfad,
		  workspacesHref: () => workspacesHref
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");

		// packages/client/tabs/src/adresse.ts
		var PARAM_SESSION = "s";
		var PARAM_WORKSPACES = "w";
		var PANEL_ID = "workspaces";
		var PFAD_CHAT = "/c";
		var PFAD_UEBERSICHT = "/w";
		function chatHref(sessionId) {
		  return `${PFAD_CHAT}/${encodeURIComponent(sessionId)}`;
		}
		function workspacesHref() {
		  return PFAD_UEBERSICHT;
		}
		function normal(pfad) {
		  const ohneDoppelt = pfad.replace(/\/{2,}/g, "/");
		  if (ohneDoppelt === "/")
		    return "/";
		  return ohneDoppelt.replace(/\/+$/, "");
		}
		function parsePfad(pathname) {
		  const pfad = normal(pathname);
		  if (pfad === PFAD_UEBERSICHT)
		    return { ansicht: "uebersicht" };
		  if (pfad === PFAD_CHAT)
		    return { ansicht: "chat", sessionId: null };
		  const praefix = `${PFAD_CHAT}/`;
		  if (!pfad.startsWith(praefix))
		    return { ansicht: "chat", sessionId: null };
		  const roh = pfad.slice(praefix.length);
		  if (roh === "")
		    return { ansicht: "chat", sessionId: null };
		  let sitzung;
		  try {
		    sitzung = decodeURIComponent(roh);
		  } catch {
		    sitzung = roh;
		  }
		  return { ansicht: "chat", sessionId: sitzung };
		}
		function aliasZiel(search) {
		  const abfrage = search.startsWith("?") ? search.slice(1) : search;
		  if (abfrage === "")
		    return;
		  const werte = new URLSearchParams(abfrage);
		  if (werte.has(PARAM_WORKSPACES))
		    return workspacesHref();
		  const sitzung = werte.get(PARAM_SESSION);
		  if (sitzung === null || sitzung === "")
		    return;
		  return chatHref(sitzung);
		}
		function hrefFor(lage) {
		  if (lage.panelId === PANEL_ID)
		    return workspacesHref();
		  if (lage.sessionId !== null && lage.sessionId !== "")
		    return chatHref(lage.sessionId);
		  return "/";
		}
		function gleichesZiel(a, b) {
		  return normal(a) === normal(b);
		}
		function istEinfacherKlick(ereignis) {
		  if (ereignis.defaultPrevented === true)
		    return false;
		  if ((ereignis.button ?? 0) !== 0)
		    return false;
		  return ereignis.ctrlKey !== true && ereignis.metaKey !== true && ereignis.shiftKey !== true && ereignis.altKey !== true;
		}

		// packages/client/tabs/src/lage.ts
		function mainSessionId(byId) {
		  for (const wert of Object.values(byId)) {
		    const zeile = wert;
		    if (zeile === undefined || zeile === null)
		      continue;
		    const gehalten = zeile.retainedBy?.["mainView"] ?? 0;
		    if (gehalten > 0 && typeof zeile.sessionId === "string" && zeile.sessionId !== "")
		      return zeile.sessionId;
		  }
		  return null;
		}

		// packages/client/tabs/src/locales.ts
		var NS = "tabs";
		var DE = {
		  panel: "Workspaces",
		  title: "Workspaces",
		  lead: "Jeder Arbeitsbereich mit seinen Sitzungen. Ein Klick öffnet den Chat hier, Strg- oder Mittelklick öffnet ihn in einem neuen Tab.",
		  empty: "Noch kein Arbeitsbereich. Lege einen in der Seitenleiste an.",
		  noSessions: "Noch keine Sitzung.",
		  newChat: "Neuer Chat",
		  openTab: "In neuem Tab öffnen",
		  openHere: "Hier öffnen",
		  blank: "Neue Sitzung"
		};
		var EN = {
		  panel: "Workspaces",
		  title: "Workspaces",
		  lead: "Every workspace with its sessions. A click opens the chat here; Ctrl-click or middle-click opens it in a new tab.",
		  empty: "No workspace yet. Add one from the sidebar.",
		  noSessions: "No session yet.",
		  newChat: "New chat",
		  openTab: "Open in new tab",
		  openHere: "Open here",
		  blank: "New session"
		};

		// packages/client/tabs/src/index.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var name = "tabs";
		var inject = ["slots", "locale", "layout", "sessions", "uiWorkspace"];
		function zeilentitel(zeile, t) {
		  const daten = zeile;
		  if (daten === undefined)
		    return t("blank");
		  if (daten.blank === true)
		    return t("blank");
		  return daten.title !== undefined && daten.title !== "" ? daten.title : t("blank");
		}
		function WorkspacesPanel({ useWorkspaces, useSessions, openSession, newChat, t }) {
		  const items = useWorkspaces((snapshot) => snapshot.items);
		  const byId = useSessions((snapshot) => snapshot.byId);
		  const oeffne = import_react.useCallback((ereignis, sessionId) => {
		    if (!istEinfacherKlick(ereignis))
		      return;
		    ereignis.preventDefault();
		    openSession(sessionId);
		  }, [openSession]);
		  return /* @__PURE__ */ jsx_runtime.jsxs("main", {
		    className: "pmh-ws",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-ws__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("h1", {
		            className: "pmh-ws__title",
		            children: t("title")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-ws__lead",
		            children: t("lead")
		          })
		        ]
		      }),
		      items.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-ws__empty",
		        children: t("empty")
		      }) : null,
		      /* @__PURE__ */ jsx_runtime.jsx("ul", {
		        className: "pmh-ws__list",
		        children: items.map((bereich) => /* @__PURE__ */ jsx_runtime.jsxs("li", {
		          className: "pmh-ws__group",
		          children: [
		            /* @__PURE__ */ jsx_runtime.jsxs("div", {
		              className: "pmh-ws__groupHead",
		              children: [
		                /* @__PURE__ */ jsx_runtime.jsx("span", {
		                  className: "pmh-ws__name",
		                  title: bereich.path,
		                  children: bereich.title
		                }),
		                /* @__PURE__ */ jsx_runtime.jsx("button", {
		                  className: "pmh-ws__new",
		                  type: "button",
		                  onClick: () => newChat(bereich.workspaceId),
		                  children: t("newChat")
		                })
		              ]
		            }),
		            /* @__PURE__ */ jsx_runtime.jsx("p", {
		              className: "pmh-ws__path",
		              title: bereich.path,
		              children: bereich.path
		            }),
		            bereich.sessionIds.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		              className: "pmh-ws__none",
		              children: t("noSessions")
		            }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		              className: "pmh-ws__sessions",
		              children: bereich.sessionIds.map((sessionId) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		                children: /* @__PURE__ */ jsx_runtime.jsx("a", {
		                  className: "pmh-ws__session",
		                  href: chatHref(sessionId),
		                  title: `${zeilentitel(byId[sessionId], t)} — ${t("openTab")}`,
		                  onClick: (ereignis) => oeffne(ereignis, sessionId),
		                  children: zeilentitel(byId[sessionId], t)
		                })
		              }, sessionId))
		            })
		          ]
		        }, bereich.workspaceId))
		      })
		    ]
		  });
		}
		function OpenInNewTabRow({ sessionId, useMenuOpenState, openSession, t }) {
		  const [, setzeOffen] = useMenuOpenState();
		  return /* @__PURE__ */ jsx_runtime.jsx("a", {
		    className: "pmh-tabitem",
		    role: "menuitem",
		    href: chatHref(sessionId),
		    title: t("openTab"),
		    onClick: (ereignis) => {
		      if (!istEinfacherKlick(ereignis))
		        return;
		      ereignis.preventDefault();
		      setzeOffen(false);
		      openSession(sessionId);
		    },
		    children: t("openTab")
		  });
		}
		function WorkspacesIcon({ size = 20 }) {
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
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "3.5",
		        y: "3.5",
		        width: "7",
		        height: "7",
		        rx: "1.4"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "13.5",
		        y: "3.5",
		        width: "7",
		        height: "7",
		        rx: "1.4"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "3.5",
		        y: "13.5",
		        width: "7",
		        height: "7",
		        rx: "1.4"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "13.5",
		        y: "13.5",
		        width: "7",
		        height: "7",
		        rx: "1.4",
		        strokeDasharray: "2.4 2.2"
		      })
		    ]
		  });
		}
		function apply(ctx) {
		  ctx.effect(() => ctx.locale.register(NS, "de", DE), "tabs: Texte de");
		  ctx.effect(() => ctx.locale.register(NS, "en", EN), "tabs: Texte en");
		  ctx.effect(() => {
		    const stil = document.createElement("style");
		    stil.dataset.pmhTabs = "";
		    stil.textContent = CSS;
		    document.head.append(stil);
		    return () => stil.remove();
		  }, "tabs: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  const openSession = (sessionId) => {
		    ctx.uiWorkspace.openSession(sessionId);
		  };
		  const newChat = (workspaceId) => {
		    ctx.uiWorkspace.startSession(workspaceId);
		    close();
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close, openSession, newChat })
		    }, WorkspacesPanel);
		  });
		  ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
		    name: "sidebar.workspaces.session.menu.item",
		    id: "pmh.open-in-new-tab",
		    order: 600,
		    locale: NS,
		    inject: () => ({ openSession })
		  }, OpenInNewTabRow));
		  ctx.effect(() => installAdresse(ctx), "tabs: Adresse und Verlauf");
		}
		function installAdresse(ctx) {
		  const ort = globalThis.location;
		  const verlauf = globalThis.history;
		  if (ort === undefined || verlauf === undefined)
		    return () => {};
		  const eigen = ort.pathname === "/" || ort.pathname === PFAD_UEBERSICHT || ort.pathname === PFAD_CHAT || ort.pathname.startsWith(`${PFAD_CHAT}/`);
		  if (!eigen)
		    return () => {};
		  const liste = ctx.sessions.list;
		  let entsorgt = false;
		  let naechsterSchreibvorgang = "replace";
		  let gewuenscht = null;
		  let geoeffnet = false;
		  let bewaffnet = false;
		  let startGehalten = null;
		  let versuche = 0;
		  let fertigGesehen = 0;
		  const lebt = () => !entsorgt;
		  const adresse = () => hrefFor({
		    panelId: ctx.layout.panelInfo.getSnapshot().activePanelId,
		    sessionId: gewuenscht ?? mainSessionId(liste.getSnapshot().byId)
		  });
		  const schreibe = () => {
		    if (!bewaffnet || entsorgt)
		      return;
		    const neu = adresse();
		    if (gleichesZiel(ort.pathname, neu))
		      return;
		    try {
		      if (naechsterSchreibvorgang === "replace")
		        verlauf.replaceState({}, "", neu);
		      else
		        verlauf.pushState({}, "", neu);
		    } catch {}
		    naechsterSchreibvorgang = "push";
		  };
		  const oeffneAusAdresse = () => {
		    if (gewuenscht === null)
		      return;
		    const id = gewuenscht;
		    const stand = liste.getSnapshot();
		    if (stand.phase !== "ready")
		      return;
		    const gehalten = mainSessionId(stand.byId);
		    fertigGesehen += 1;
		    if (startGehalten === null && gehalten !== null)
		      startGehalten = gehalten;
		    if (stand.byId[id] === undefined) {
		      if (fertigGesehen >= 3) {
		        gewuenscht = null;
		        bewaffnet = true;
		        schreibe();
		      }
		      return;
		    }
		    const nutzerwahl = geoeffnet && gehalten !== id && gehalten !== startGehalten;
		    if (gehalten === id || nutzerwahl) {
		      gewuenscht = null;
		      bewaffnet = true;
		      schreibe();
		      return;
		    }
		    if (versuche < 3) {
		      versuche += 1;
		      geoeffnet = true;
		      ctx.uiWorkspace.openSession(id);
		    }
		  };
		  const abPanel = ctx.layout.panelInfo.subscribe(() => {
		    oeffneAusAdresse();
		    schreibe();
		  });
		  const abListe = liste.subscribe(() => {
		    oeffneAusAdresse();
		    schreibe();
		  });
		  const zurueck = () => {
		    if (entsorgt)
		      return;
		    const neu = parsePfad(ort.pathname);
		    if (neu.ansicht === "uebersicht") {
		      oeffnePanel(ctx, lebt);
		      return;
		    }
		    ctx.layout.selectPanel(null);
		    if (neu.sessionId !== null && neu.sessionId !== "") {
		      gewuenscht = neu.sessionId;
		      geoeffnet = false;
		      oeffneAusAdresse();
		    }
		  };
		  globalThis.addEventListener("popstate", zurueck);
		  let start = parsePfad(ort.pathname);
		  const alias = aliasZiel(ort.search);
		  if (alias !== undefined) {
		    try {
		      verlauf.replaceState({}, "", alias);
		    } catch {}
		    start = parsePfad(alias);
		  }
		  if (start.ansicht === "chat" && start.sessionId === null) {
		    bewaffnet = true;
		    schreibe();
		  }
		  if (start.ansicht === "uebersicht") {
		    oeffnePanel(ctx, lebt);
		    bewaffnet = true;
		    schreibe();
		  } else if (start.sessionId !== null && start.sessionId !== "") {
		    gewuenscht = start.sessionId;
		    oeffneAusAdresse();
		  } else {
		    bewaffnet = true;
		    schreibe();
		  }
		  return () => {
		    entsorgt = true;
		    abPanel();
		    abListe();
		    globalThis.removeEventListener("popstate", zurueck);
		  };
		}
		function oeffnePanel(ctx, lebt, rest = 20) {
		  try {
		    ctx.layout.selectPanel(PANEL_ID);
		  } catch {
		    if (rest <= 0 || !lebt()) {
		      console.warn(`[tabs] Das Panel "${PANEL_ID}" ist nicht eingehängt — "?w" bleibt ohne Wirkung.`);
		      return;
		    }
		    setTimeout(() => {
		      if (lebt())
		        oeffnePanel(ctx, lebt, rest - 1);
		    }, 50);
		  }
		}
		var CSS = `
		.pmh-ws{
		  box-sizing:border-box;height:100%;min-height:0;overflow:auto;
		  padding:28px 32px 48px;color:inherit;font:inherit;
		}
		.pmh-ws__head{max-width:920px;margin:0 auto 20px}
		.pmh-ws__title{margin:0 0 8px;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em}
		.pmh-ws__lead{margin:0;max-width:64ch;font-size:13px;line-height:1.55;opacity:.62}
		.pmh-ws__empty{max-width:920px;margin:16px auto;font-size:13px;opacity:.62}
		.pmh-ws__list{list-style:none;max-width:920px;margin:0 auto;padding:0;display:flex;flex-direction:column;gap:14px}
		.pmh-ws__group{
		  border:1px solid rgba(128,128,128,.22);border-radius:12px;padding:14px 16px;
		  border-color:color-mix(in srgb, currentColor 16%, transparent);
		  background:color-mix(in srgb, currentColor 3%, transparent);
		}
		.pmh-ws__groupHead{display:flex;align-items:baseline;gap:12px;justify-content:space-between}
		.pmh-ws__name{font-size:14px;font-weight:600;letter-spacing:-.005em}
		.pmh-ws__path{
		  margin:4px 0 10px;font-size:11px;line-height:1.4;opacity:.5;
		  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
		}
		.pmh-ws__new{
		  flex:none;border:1px solid rgba(128,128,128,.3);border-radius:8px;background:transparent;
		  color:inherit;font:inherit;font-size:11px;line-height:1;padding:7px 10px;cursor:pointer;
		  border-color:color-mix(in srgb, currentColor 22%, transparent);
		}
		.pmh-ws__new:hover{border-color:color-mix(in srgb, currentColor 45%, transparent)}
		.pmh-ws__none{margin:0;font-size:12px;opacity:.5}
		.pmh-ws__sessions{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
		.pmh-ws__session{
		  display:block;padding:6px 8px;margin:0 -8px;border-radius:7px;
		  color:inherit;text-decoration:none;font-size:13px;line-height:1.45;
		  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
		}
		.pmh-ws__session:hover{background:color-mix(in srgb, currentColor 8%, transparent)}
		.pmh-tabitem{
		  display:block;width:100%;box-sizing:border-box;padding:6px 10px;border-radius:6px;
		  color:inherit;text-decoration:none;font:inherit;font-size:13px;line-height:1.4;
		  cursor:pointer;white-space:nowrap;
		}
		.pmh-tabitem:hover,.pmh-tabitem:focus-visible{background:color-mix(in srgb, currentColor 8%, transparent)}
		/*
		 * **Die Sitzungszeile ist ein Link — sie soll nicht wie einer aussehen.**
		 *
		 * Seit dem 28.10.2026 trägt sie ein a-Tag mit href auf /c/… (Patch auf
		 * dsh-client-ui-workspace, SessionNodeItem: div wird a). Ein Anker bringt die
		 * Standardfarbe und den Strich des Browsers mit; beides gehört hier nicht hin, weil
		 * die Zeile weiter aussieht wie die Zeilen des Kerns. Der Selektor greift nur auf
		 * Zeilen mit Adresse — ein späterer eigener Browser braucht diese Regel nicht mehr.
		 */
		a[data-row-key^="session:"]{color:inherit;text-decoration:none}
		a[data-row-key^="session:"]:hover,a[data-row-key^="session:"]:focus-visible{text-decoration:none}
		`;

		return module.exports;
	}
});
