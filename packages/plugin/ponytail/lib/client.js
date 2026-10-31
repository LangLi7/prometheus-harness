/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/ponytail/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/ponytail/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/ponytail",
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
		  PonytailPill: () => PonytailPill,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");
		var jsx_runtime = require("react/jsx-runtime");
		var WEG = "/api/pmh/ponytail";
		var MODI = ["off", "lite", "full", "ultra"];
		function naechster(modus) {
		  return MODI[(MODI.indexOf(modus) + 1) % MODI.length] ?? "full";
		}
		function istModus(wert) {
		  return typeof wert === "string" && MODI.includes(wert);
		}
		function PonytailPill() {
		  const [modus, setModus] = import_react.useState("off");
		  const [fehler, setFehler] = import_react.useState(null);
		  const letzteStufe = import_react.useRef("full");
		  const [bereit, setBereit] = import_react.useState(false);
		  import_react.useEffect(() => {
		    let ab = false;
		    fetch(WEG, { headers: { accept: "application/json" } }).then(async (antwort) => {
		      if (!antwort.ok)
		        throw new Error(`HTTP ${String(antwort.status)}`);
		      const daten = await antwort.json();
		      const gelesen = daten.modus;
		      if (!ab && istModus(gelesen)) {
		        setModus(gelesen);
		        if (gelesen !== "off")
		          letzteStufe.current = gelesen;
		      }
		    }).catch((problem) => {
		      if (!ab)
		        setFehler(problem instanceof Error ? problem.message : String(problem));
		    }).finally(() => {
		      if (!ab)
		        setBereit(true);
		    });
		    return () => {
		      ab = true;
		    };
		  }, []);
		  const setze = async (neu) => {
		    const vorher = modus;
		    setModus(neu);
		    if (neu !== "off")
		      letzteStufe.current = neu;
		    setFehler(null);
		    try {
		      const antwort = await fetch(WEG, {
		        method: "POST",
		        headers: { "content-type": "application/json", accept: "application/json" },
		        body: JSON.stringify({ modus: neu })
		      });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${String(antwort.status)}`);
		    } catch (problem) {
		      setModus(vorher);
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    }
		  };
		  const an = modus !== "off";
		  const titel = fehler !== null ? `Ponytail: ${fehler}` : `Ponytail ${modus} · Klick: ${an ? "aus" : "an"} · Alt+Klick: Stufe`;
		  return /* @__PURE__ */ jsx_runtime.jsxs("button", {
		    type: "button",
		    className: `pmh-pt${an ? " is-an" : ""}`,
		    "data-modus": modus,
		    "aria-pressed": an,
		    "aria-label": titel,
		    title: titel,
		    disabled: !bereit,
		    onClick: (ereignis) => {
		      const neu = ereignis.altKey ? naechster(modus) : an ? "off" : letzteStufe.current;
		      setze(neu);
		    },
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("i", {
		        className: "pmh-pt__dot",
		        "aria-hidden": "true"
		      }),
		      /* @__PURE__ */ jsx_runtime.jsx("span", {
		        className: "pmh-pt__name",
		        children: "Pony"
		      }),
		      an && /* @__PURE__ */ jsx_runtime.jsx("span", {
		        className: "pmh-pt__stufe",
		        children: modus
		      })
		    ]
		  });
		}
		function apply(ctx) {
		  ctx.effect(() => {
		    const stil = document.createElement("style");
		    stil.dataset.pmhPonytail = "";
		    stil.textContent = CSS;
		    document.head.append(stil);
		    return () => stil.remove();
		  }, "ponytail: Stil");
		  ctx.slots.inject("conversation.input.left", () => ctx.slots.register({ name: "conversation.input.left", id: "pmh-ponytail", order: 12 }, PonytailPill));
		}
		var inject = ["slots"];
		var CSS = `
		.pmh-pt{
		  display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;
		  border:1px solid rgba(255,255,255,.09);border-radius:999px;
		  background:rgba(255,255,255,.03);color:rgba(236,238,248,.55);
		  font:11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;
		  cursor:pointer;transition:border-color .16s ease,background .16s ease,color .16s ease;
		}
		.pmh-pt:hover:not(:disabled){border-color:rgba(233,198,143,.32);color:#efe6d5}
		.pmh-pt:focus-visible{outline:2px solid rgba(233,198,143,.55);outline-offset:2px}
		.pmh-pt:disabled{opacity:.35;cursor:default}
		.pmh-pt__dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.22);flex:none}
		.pmh-pt__name{letter-spacing:.02em}
		.pmh-pt__stufe{
		  padding:1px 5px;border-radius:999px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;
		  color:#e9c68f;background:rgba(233,198,143,.1);border:1px solid rgba(233,198,143,.22);
		}
		.pmh-pt.is-an{color:#f2ead9;border-color:rgba(233,198,143,.28);background:rgba(233,198,143,.06)}
		.pmh-pt.is-an .pmh-pt__dot{background:#e9c68f;box-shadow:0 0 0 3px rgba(233,198,143,.14)}
		.pmh-pt[data-modus="ultra"] .pmh-pt__dot{background:#d98f5a;box-shadow:0 0 0 3px rgba(217,143,90,.16)}
		`;

		return module.exports;
	}
});
