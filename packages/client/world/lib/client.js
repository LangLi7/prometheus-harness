/**
 * Browser-Hälfte. ERZEUGT von `packages/client/world/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/client/world/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/client-world",
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

		// packages/client/world/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  PANEL_ID: () => PANEL_ID,
		  WorldIcon: () => WorldIcon,
		  WorldPanel: () => WorldPanel,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);

		// packages/client/world/src/locales.ts
		var DE = {
		  panel: "Welt",
		  title: "Die Welt",
		  subtitle: "Die echte Universe-App als Panel — dieselbe Oberfläche, dieselbe Logik, ein Wechsel.",
		  chat: "Zum Chat",
		  refresh: "Aktualisieren",
		  loading: "wird gelesen …",
		  obsidian: "Obsidian",
		  graphify: "Graphify",
		  notes: "Notizen",
		  nodes: "Knoten",
		  edges: "Kanten",
		  openLinks: "offene Verweise",
		  vault: "Vault",
		  command: "Befehl",
		  output: "Ausgabe",
		  available: "bereit",
		  missing: "fehlt",
		  error: "Fehler",
		  level: "Ebene",
		  zoom: "Zoom",
		  planes: "Flächen",
		  time: "Zeit",
		  pause: "Pause",
		  resume: "Weiter",
		  reset: "Reset",
		  complete: "Komplett",
		  stage3d: "3D",
		  dragHint: "Ziehen = drehen · Rad = zoomen",
		  sceneError: "3D nicht verfügbar",
		  hint: "Die Quellen werden vom Host gelesen; die Welt zeichnet sie später als Knoten und Kanten."
		};
		var EN = {
		  panel: "World",
		  title: "The world",
		  subtitle: "The real Universe app as a panel — same surface, same logic, one switch.",
		  chat: "To the chat",
		  refresh: "Refresh",
		  loading: "reading …",
		  obsidian: "Obsidian",
		  graphify: "Graphify",
		  notes: "Notes",
		  nodes: "Nodes",
		  edges: "Edges",
		  openLinks: "open links",
		  vault: "Vault",
		  command: "Command",
		  output: "Output",
		  available: "ready",
		  missing: "missing",
		  error: "Error",
		  level: "Level",
		  zoom: "Zoom",
		  planes: "planes",
		  time: "Time",
		  pause: "Pause",
		  resume: "Resume",
		  reset: "Reset",
		  complete: "Complete",
		  stage3d: "3D",
		  dragHint: "Drag = rotate · Wheel = zoom",
		  sceneError: "3D not available",
		  hint: "The host reads the sources; the world will draw them as nodes and edges later."
		};

		// packages/client/world/src/index.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "world";
		var NS = "world";
		var inject = ["slots", "locale", "layout"];
		function WorldPanel({ close, t }) {
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-world",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("iframe", {
		        className: "pmh-world__frame",
		        src: "/universe/",
		        title: t("title"),
		        allow: "fullscreen",
		        onLoad: (event) => {
		          try {
		            if (event.currentTarget.contentWindow?.location.pathname === "/")
		              close();
		          } catch {}
		        }
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("div", {
		        className: "pmh-world__float",
		        children: /* @__PURE__ */ jsx_runtime.jsx("button", {
		          className: "pmh-world__control",
		          type: "button",
		          onClick: close,
		          children: t("chat")
		        })
		      })
		    ]
		  });
		}
		function WorldIcon({ size = 20 }) {
		  return /* @__PURE__ */ jsx_runtime.jsxs("svg", {
		    "aria-hidden": "true",
		    width: size,
		    height: size,
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.4",
		    strokeLinecap: "round",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("ellipse", {
		        cx: "12",
		        cy: "12",
		        rx: "9",
		        ry: "3.6",
		        transform: "rotate(-24 12 12)"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("ellipse", {
		        cx: "12",
		        cy: "12",
		        rx: "4.2",
		        ry: "8.6",
		        transform: "rotate(-24 12 12)"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "12",
		        cy: "12",
		        r: "2.1",
		        fill: "currentColor",
		        stroke: "none"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("circle", {
		        cx: "19.2",
		        cy: "8.2",
		        r: "1.2",
		        fill: "currentColor",
		        stroke: "none"
		      })
		    ]
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => ctx.locale.register(NS, "de", DE), "world: Texte de");
		  ctx.effect(() => ctx.locale.register(NS, "en", EN), "world: Texte en");
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhWorld = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "world: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close })
		    }, WorldPanel);
		  });
		  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
		    name: "sidebar.panellist",
		    id: PANEL_ID,
		    order: 10,
		    label: () => t("panel"),
		    locale: NS
		  }, WorldIcon));
		}
		var CSS = `
		.pmh-world{
		  position:relative;width:100%;height:100%;min-height:0;overflow:hidden;
		  background:#05060c;
		}
		.pmh-world__frame{display:block;width:100%;height:100%;border:0;background:#05060c}
		.pmh-world__float{position:absolute;top:10px;right:10px;z-index:6;display:flex;gap:6px}
		.pmh-world__control{
		  border:1px solid rgba(180,170,230,.28);background:rgba(12,10,20,.72);
		  color:rgba(240,242,255,.92);border-radius:9px;padding:6px 10px;
		  font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;
		  backdrop-filter:blur(6px);
		}
		.pmh-world__control:hover{border-color:rgba(190,170,255,.65);background:rgba(28,22,44,.85)}
		`;

		return module.exports;
	}
});
