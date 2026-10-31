/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/launcher/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/launcher/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/launcher",
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
		  StarterPanel: () => StarterPanel,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");
		var jsx_runtime = require("react/jsx-runtime");
		var PANEL_ID = "launcher";
		var ENTRY_ID = "pmh-launcher";
		var NS = "launcher";
		var inject = ["slots", "locale", "layout", "configForms"];
		function liesListe(config) {
		  const roh = config?.entries;
		  const eintraege = Array.isArray(roh) ? roh.filter((id) => typeof id === "string" && id.trim() !== "") : [];
		  return { eintraege };
		}
		function StarterPanel({ close, t, form, beschriftung }) {
		  const [config, setConfig] = import_react.useState(form.getSnapshot().value);
		  import_react.useEffect(() => {
		    return form.subscribe(() => setConfig(form.getSnapshot().value));
		  }, [form]);
		  const { eintraege } = liesListe(config);
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-sl",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("header", {
		        className: "pmh-sl__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("div", {
		            className: "pmh-sl__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsx(StarterIcon, {
		                size: 20
		              }),
		              /* @__PURE__ */ jsx_runtime.jsxs("div", {
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-sl__kicker",
		                    children: "LAUNCHER"
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("h2", {
		                    className: "pmh-sl__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          close !== undefined && /* @__PURE__ */ jsx_runtime.jsx("button", {
		            type: "button",
		            className: "pmh-sl__btn",
		            onClick: close,
		            children: t("close")
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-sl__scroll",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-sl__intro",
		            children: t("intro")
		          }),
		          eintraege.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		            className: "pmh-sl__leer",
		            children: t("empty")
		          }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		            className: "pmh-sl__liste",
		            children: eintraege.map((id) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		              children: /* @__PURE__ */ jsx_runtime.jsxs("button", {
		                type: "button",
		                className: "pmh-sl__eintrag",
		                onClick: () => globalThis.dispatchEvent(new CustomEvent("pmh-launcher:oeffne", { detail: id })),
		                children: [
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-sl__punkt",
		                    "aria-hidden": "true"
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-sl__name",
		                    children: beschriftung(id)
		                  }),
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-sl__kennung",
		                    children: id
		                  })
		                ]
		              })
		            }, id))
		          })
		        ]
		      })
		    ]
		  });
		}
		function StarterIcon({ size = 16 }) {
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
		        x: "4",
		        y: "4",
		        width: "7",
		        height: "7",
		        rx: "1.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "13",
		        y: "4",
		        width: "7",
		        height: "7",
		        rx: "1.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "4",
		        y: "13",
		        width: "7",
		        height: "7",
		        rx: "1.6"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("rect", {
		        x: "13",
		        y: "13",
		        width: "7",
		        height: "7",
		        rx: "1.6"
		      })
		    ]
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  const form = ctx.configForms.get(ENTRY_ID);
		  const beschriftung = (id) => {
		    try {
		      const fremd = ctx.locale.bind(id)("panel");
		      return typeof fremd === "string" && fremd !== "" && fremd !== "panel" ? fremd : id;
		    } catch {
		      return id;
		    }
		  };
		  ctx.effect(() => {
		    const zuhoerer = (ereignis) => {
		      const id = ereignis.detail;
		      if (typeof id !== "string" || id === "")
		        return;
		      ctx.layout.selectPanel(id);
		    };
		    globalThis.addEventListener("pmh-launcher:oeffne", zuhoerer);
		    return () => globalThis.removeEventListener("pmh-launcher:oeffne", zuhoerer);
		  }, "launcher: Klick öffnet das Panel");
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhLauncher = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "launcher: Stil");
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close: () => ctx.layout.selectPanel(null), form, beschriftung })
		    }, StarterPanel);
		  });
		  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
		    name: "sidebar.panellist",
		    id: PANEL_ID,
		    order: 10,
		    label: () => t("panel"),
		    locale: NS
		  }, StarterIcon));
		}
		var CSS = `
		.pmh-sl{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;background:#0b0a12;color:#eceef8;font:13px/1.45 "Segoe UI","SF Pro Text",system-ui,sans-serif}
		.pmh-sl__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-sl__brand{display:flex;align-items:center;gap:11px;color:#cfd3ea}
		.pmh-sl__kicker{font:9px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:rgba(207,211,234,.5)}
		.pmh-sl__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f4f5fb}
		.pmh-sl__btn{appearance:none;border:1px solid rgba(207,211,234,.22);background:rgba(22,22,36,.6);color:#eceef8;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer}
		.pmh-sl__btn:hover{border-color:rgba(207,211,234,.55)}
		.pmh-sl__scroll{flex:1;min-height:0;overflow:auto;padding:16px 20px 24px}
		.pmh-sl__intro{margin:0 0 14px;max-width:80ch;color:rgba(236,238,248,.55);font-size:12px}
		.pmh-sl__leer{margin:12px 0;color:rgba(236,238,248,.45)}
		.pmh-sl__liste{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px;max-width:640px}
		.pmh-sl__eintrag{display:grid;grid-template-columns:14px minmax(0,1fr) auto;align-items:center;gap:10px;width:100%;padding:11px 13px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.022);color:#eceef8;text-align:left;cursor:pointer;transition:border-color .16s ease,background .16s ease}
		.pmh-sl__eintrag:hover{border-color:rgba(207,211,234,.45);background:rgba(255,255,255,.05)}
		.pmh-sl__punkt{width:8px;height:8px;border-radius:50%;background:rgba(207,211,234,.55)}
		.pmh-sl__name{font-size:13px}
		.pmh-sl__kennung{font:9.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;color:rgba(236,238,248,.35)}
		`;

		return module.exports;
	}
});
