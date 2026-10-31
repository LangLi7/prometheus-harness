/**
 * Browser-Hälfte. ERZEUGT von `scripts/client-buendel.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/client/world-switch/src/index.ts`.
 *
 * Der Umschlag ist die Form des Kerns (`window.__ModuleLoader__.load`), gemessen an
 * `@deepseek-ai/dsh-client-locale/lib/client.js`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/client-world-switch",
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

		// packages/client/world-switch/src/index.ts
		var exports_src = {};
		__export(exports_src, {
		  ARRIVAL_KEY: () => ARRIVAL_KEY,
		  ARRIVAL_VALUE: () => ARRIVAL_VALUE,
		  ETIKETT: () => ETIKETT,
		  FRIST_MS: () => FRIST_MS,
		  MARKE: () => MARKE,
		  MERKMAL: () => MERKMAL,
		  WORLD_PATH: () => WORLD_PATH,
		  apply: () => apply,
		  inject: () => inject,
		  istEinfacherKlick: () => istEinfacherKlick,
		  name: () => name,
		  sprache: () => sprache,
		  trifftMarke: () => trifftMarke,
		  weltZiel: () => weltZiel
		});
		module.exports = __toCommonJS(exports_src);
		var name = "world-switch";
		var inject = [];
		var WORLD_PATH = "/universe";
		var ARRIVAL_KEY = "pmh.world.arrival";
		var ARRIVAL_VALUE = "os";
		function weltZiel(herkunft) {
		  const basis = herkunft !== undefined && herkunft !== "" ? herkunft.replace(/\/+$/u, "") : "";
		  return `${basis}${WORLD_PATH}/`;
		}
		var MARKE = '[class*="_brandIdentity"]';
		var ETIKETT = {
		  de: "Zur Welt",
		  en: "To the world"
		};
		var MERKMAL = "data-pmh-welt-schalter";
		var FRIST_MS = 30000;
		function sprache(dokument, browser) {
		  const ausDokument = dokument?.documentElement?.lang;
		  const quelle = (ausDokument && ausDokument !== "" ? ausDokument : browser ?? "").toLowerCase();
		  return quelle.startsWith("de") ? "de" : "en";
		}
		function istEinfacherKlick(ereignis) {
		  if (ereignis.defaultPrevented === true)
		    return false;
		  if ((ereignis.button ?? 0) !== 0)
		    return false;
		  return ereignis.ctrlKey !== true && ereignis.metaKey !== true && ereignis.shiftKey !== true && ereignis.altKey !== true;
		}
		function trifftMarke(pfad, ziel) {
		  for (const knoten of pfad) {
		    const k = knoten;
		    if (typeof k?.matches === "function" && k.matches(MARKE))
		      return true;
		  }
		  const z = ziel;
		  return typeof z?.closest === "function" && z.closest(MARKE) !== null;
		}
		function merkeAnkunft(speicher) {
		  try {
		    speicher?.setItem(ARRIVAL_KEY, ARRIVAL_VALUE);
		  } catch {}
		}
		function geheInDieWelt(ort, speicher) {
		  if (ort === undefined)
		    return;
		  const ziel = weltZiel(ort.origin);
		  merkeAnkunft(speicher);
		  if (typeof ort.assign === "function")
		    ort.assign(ziel);
		  else
		    ort.href = ziel;
		}
		function apply(ctx) {
		  const dokument = globalThis.document;
		  if (dokument === undefined)
		    return;
		  ctx.effect(() => {
		    const klick = (ereignis) => {
		      if (!istEinfacherKlick(ereignis))
		        return;
		      const pfad = typeof ereignis.composedPath === "function" ? ereignis.composedPath() : [];
		      if (!trifftMarke(pfad, ereignis.target))
		        return;
		      beschrifte(dokument);
		      ereignis.stopPropagation();
		      ereignis.preventDefault();
		      geheInDieWelt(globalThis.location, globalThis.localStorage);
		    };
		    dokument.addEventListener("click", klick, true);
		    let frist;
		    const beobachter = new MutationObserver(() => {
		      if (!beschrifte(dokument))
		        return;
		      beobachter.disconnect();
		      if (frist !== undefined)
		        clearTimeout(frist);
		      frist = undefined;
		    });
		    if (!beschrifte(dokument)) {
		      beobachter.observe(dokument.documentElement ?? dokument, { childList: true, subtree: true });
		      frist = setTimeout(() => {
		        beobachter.disconnect();
		        frist = undefined;
		      }, FRIST_MS);
		    }
		    return () => {
		      dokument.removeEventListener("click", klick, true);
		      beobachter.disconnect();
		      if (frist !== undefined)
		        clearTimeout(frist);
		      frist = undefined;
		    };
		  }, "world-switch: die Marke oben links wechselt in die Welt");
		}
		function beschrifte(dokument) {
		  const marke = dokument.querySelector(MARKE);
		  const knopf = marke?.closest?.("button");
		  if (!knopf)
		    return false;
		  const text = ETIKETT[sprache(dokument, globalThis.navigator?.language)];
		  if (knopf.getAttribute(MERKMAL) === text)
		    return true;
		  knopf.setAttribute(MERKMAL, text);
		  knopf.setAttribute("aria-label", text);
		  knopf.setAttribute("title", text);
		  return true;
		}

		return module.exports;
	}
});
