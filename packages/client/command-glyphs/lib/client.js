window.__ModuleLoader__.load({
  id: "@prometheus-harness/client-command-glyphs",
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

// packages/client/command-glyphs/src/index.ts
var exports_src = {};
__export(exports_src, {
  CARDS: () => CARDS,
  GAUGE: () => GAUGE,
  GLYPHS: () => GLYPHS,
  PICTURE: () => PICTURE,
  SERVICE: () => SERVICE,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(exports_src);
var import_react = require("react");
var name = "command-glyphs";
var inject = [];
var RASTER = 16;
var STRICHSTAERKE = 1;
function zeichne(was, formen) {
  function Zeichen({ size = RASTER }) {
    return import_react.createElement("svg", {
      width: size,
      height: size,
      viewBox: `0 0 ${String(RASTER)} ${String(RASTER)}`,
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": "true",
      strokeWidth: STRICHSTAERKE
    }, formen.map((form, index) => import_react.createElement(form.element, { key: index, ...form.merkmale })));
  }
  Zeichen.displayName = `Glyph(${was})`;
  return Zeichen;
}
var PICTURE_FORMS = [
  { element: "rect", merkmale: { x: 2.5, y: 2.5, width: 11, height: 11, rx: 2, stroke: "currentColor" } },
  { element: "circle", merkmale: { cx: 5.9, cy: 5.9, r: 1.15, stroke: "currentColor" } },
  {
    element: "path",
    merkmale: {
      d: "M3.5 11.6 6.2 8.4 8.7 11.6 10.9 9.2 12.9 11.6",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  }
];
var CARD_FORMS = [
  { element: "rect", merkmale: { x: 2.5, y: 2.5, width: 5, height: 5, rx: 1.2, fill: "currentColor", stroke: "none" } },
  { element: "rect", merkmale: { x: 8.5, y: 2.5, width: 5, height: 5, rx: 1.2, stroke: "currentColor" } },
  { element: "rect", merkmale: { x: 2.5, y: 8.5, width: 5, height: 5, rx: 1.2, stroke: "currentColor" } },
  { element: "rect", merkmale: { x: 8.5, y: 8.5, width: 5, height: 5, rx: 1.2, stroke: "currentColor" } }
];
var GAUGE_FORMS = [
  {
    element: "path",
    merkmale: {
      d: "M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096",
      stroke: "currentColor"
    }
  },
  { element: "path", merkmale: { d: "M8 8.49994L11.6114 4.88855", stroke: "currentColor" } },
  {
    element: "path",
    merkmale: {
      d: "M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z",
      fill: "currentColor"
    }
  }
];
var PICTURE = zeichne("Bild", PICTURE_FORMS);
var CARDS = zeichne("Karten", CARD_FORMS);
var GAUGE = zeichne("Messuhr", GAUGE_FORMS);
var GLYPHS = new Map([
  ["bild", PICTURE],
  ["image", PICTURE],
  ["ui", CARDS],
  ["usage", GAUGE],
  ["verbrauch", GAUGE]
]);
var SERVICE = "pmhCommandGlyphs";
function apply(ctx) {
  const dienst = {
    for: (befehl) => GLYPHS.get(befehl)
  };
  ctx.provide(SERVICE, dienst);
}

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
