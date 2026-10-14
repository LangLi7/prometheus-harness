/**
 * Browser-Hälfte. ERZEUGT von `scripts/client-buendel.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/client/select-contrast/src/index.ts`.
 *
 * Der Umschlag ist die Form des Kerns (`window.__ModuleLoader__.load`), gemessen an
 * `@deepseek-ai/dsh-client-locale/lib/client.js`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/client-select-contrast",
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

		// packages/client/select-contrast/src/index.ts
		var exports_src = {};
		__export(exports_src, {
		  REGEL: () => REGEL,
		  STIL_ID: () => STIL_ID,
		  apply: () => apply,
		  inject: () => inject,
		  name: () => name
		});
		module.exports = __toCommonJS(exports_src);
		var name = "select-contrast";
		var inject = [];
		var REGEL = `
		select option,
		select optgroup {
		  background-color: var(--dsw-alias-bg-layer-2, Canvas);
		  color: var(--dsw-alias-label-primary, CanvasText);
		}
		`.trim();
		var STIL_ID = "pmh-select-contrast";
		function apply(ctx) {
		  const dokument = globalThis.document;
		  if (dokument === undefined)
		    return;
		  ctx.effect(() => {
		    const vorhanden = dokument.getElementById(STIL_ID);
		    if (vorhanden !== null)
		      vorhanden.remove();
		    const stil = dokument.createElement("style");
		    stil.id = STIL_ID;
		    stil.textContent = REGEL;
		    dokument.head.append(stil);
		    return () => {
		      stil.remove();
		    };
		  }, "select-contrast: Kontrast nativer Auswahlfenster");
		}

		return module.exports;
	}
});
