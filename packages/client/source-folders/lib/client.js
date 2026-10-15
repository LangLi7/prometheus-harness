window.__ModuleLoader__.load({
  id: "@prometheus-harness/client-source-folders",
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

// packages/client/source-folders/src/client.tsx
var exports_client = {};
__export(exports_client, {
  QuellordnerSchicht: () => QuellordnerSchicht,
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(exports_client);
var import_react = require("react");

// packages/client/source-folders/src/dialog.tsx
var jsx_runtime = require("react/jsx-runtime");
var TEXTE = {
  titel: "Quellordner",
  name: "Name",
  quellordner: "Quellordner",
  primaer: "Primär",
  hinzufuegen: "Ordner hinzufügen",
  entfernen: "Entfernen",
  schliessen: "Schließen",
  lesen: "Nur lesen",
  schreiben: "Lesen und schreiben",
  arbeitsplatzHinweis: 'Der Arbeitsplatz läßt sich weder entfernen noch auf „nur lesen" stellen.'
};
function Ordnerzeile({
  ordner,
  beiEntfernen,
  beiZugriff,
  beschaeftigt
}) {
  return /* @__PURE__ */ jsx_runtime.jsxs("li", {
    className: "pmh-ordner-zeile",
    "data-primaer": ordner.istPrimaer ? "ja" : "nein",
    children: [
      /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "pmh-ordner-pfad",
        title: ordner.pfad,
        children: ordner.pfad
      }),
      ordner.bezeichnung === undefined ? null : /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "pmh-ordner-bezeichnung",
        children: ordner.bezeichnung
      }),
      ordner.istPrimaer ? /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "pmh-ordner-primaer",
        "aria-label": TEXTE.primaer,
        children: TEXTE.primaer
      }) : /* @__PURE__ */ jsx_runtime.jsx("span", {
        className: "pmh-ordner-zugriff",
        children: ordner.zugriff === "schreiben" ? TEXTE.schreiben : TEXTE.lesen
      }),
      ordner.istPrimaer ? null : /* @__PURE__ */ jsx_runtime.jsxs(jsx_runtime.Fragment, {
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "pmh-ordner-zugriff-schalten",
            disabled: beschaeftigt,
            onClick: () => {
              beiZugriff?.(ordner.id, ordner.zugriff === "schreiben" ? "lesen" : "schreiben");
            },
            children: ordner.zugriff === "schreiben" ? TEXTE.lesen : TEXTE.schreiben
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "pmh-ordner-entfernen",
            "aria-label": `${TEXTE.entfernen}: ${ordner.pfad}`,
            disabled: beschaeftigt,
            onClick: () => {
              beiEntfernen?.(ordner.id);
            },
            children: "×"
          })
        ]
      })
    ]
  });
}
function QuellordnerDialog(eigenschaften) {
  const beschaeftigt = eigenschaften.beschaeftigt === true;
  const sortiert = [...eigenschaften.ordner].sort((a, b) => Number(b.istPrimaer) - Number(a.istPrimaer));
  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
    className: "pmh-quellordner",
    role: "dialog",
    "aria-label": TEXTE.titel,
    children: [
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "pmh-quellordner-kopf",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("h2", {
            className: "pmh-quellordner-titel",
            children: TEXTE.titel
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "pmh-quellordner-schliessen",
            "aria-label": TEXTE.schliessen,
            disabled: beschaeftigt,
            onClick: () => {
              eigenschaften.beiSchliessen?.();
            },
            children: "×"
          })
        ]
      }),
      eigenschaften.fehler === undefined ? null : /* @__PURE__ */ jsx_runtime.jsx("p", {
        className: "pmh-quellordner-fehler",
        role: "alert",
        children: eigenschaften.fehler
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("label", {
        className: "pmh-quellordner-name",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("span", {
            children: TEXTE.name
          }),
          /* @__PURE__ */ jsx_runtime.jsx("input", {
            type: "text",
            value: eigenschaften.name,
            disabled: beschaeftigt,
            onChange: (e) => {
              eigenschaften.beiName?.(e.target.value);
            }
          })
        ]
      }),
      /* @__PURE__ */ jsx_runtime.jsxs("div", {
        className: "pmh-quellordner-liste",
        children: [
          /* @__PURE__ */ jsx_runtime.jsx("h3", {
            children: TEXTE.quellordner
          }),
          /* @__PURE__ */ jsx_runtime.jsx("ul", {
            children: sortiert.map((ordner) => /* @__PURE__ */ jsx_runtime.jsx(Ordnerzeile, {
              ordner,
              beiEntfernen: eigenschaften.beiEntfernen,
              beiZugriff: eigenschaften.beiZugriff,
              beschaeftigt
            }, ordner.id))
          }),
          /* @__PURE__ */ jsx_runtime.jsx("p", {
            className: "pmh-quellordner-hinweis",
            children: TEXTE.arbeitsplatzHinweis
          }),
          /* @__PURE__ */ jsx_runtime.jsx("button", {
            type: "button",
            className: "pmh-quellordner-hinzufuegen",
            disabled: beschaeftigt,
            onClick: () => {
              eigenschaften.beiHinzufuegen?.();
            },
            children: TEXTE.hinzufuegen
          })
        ]
      })
    ]
  });
}

// packages/client/source-folders/src/state.ts
var CSRF_KEKS = "pmh_csrf";
function wertAusKeks(kekse, name) {
  for (const stueck of kekse.split(";")) {
    const gleich = stueck.indexOf("=");
    if (gleich === -1)
      continue;
    if (stueck.slice(0, gleich).trim() !== name)
      continue;
    const wert = stueck.slice(gleich + 1).trim();
    if (wert === "")
      return;
    try {
      return decodeURIComponent(wert);
    } catch {
      return wert;
    }
  }
  return;
}
function csrfWert(kekse) {
  const quelle = kekse ?? globalThis.document?.cookie;
  if (quelle === undefined)
    return;
  return wertAusKeks(quelle, CSRF_KEKS);
}
function arbeitsbereichId(bereiche, sitzung) {
  if (sitzung !== undefined) {
    const eigener = bereiche.find((b) => b.sessionIds.includes(sitzung));
    if (eigener !== undefined)
      return eigener.workspaceId;
  }
  return bereiche[0]?.workspaceId;
}

// packages/client/source-folders/src/paths.ts
var PFAD_ORDNER = "/api/pmh/ordner";
var PFAD_ORDNER_ANLEGEN = "/api/pmh/ordner/anlegen";
var PFAD_ORDNER_ZUGRIFF = "/api/pmh/ordner/zugriff";
var PFAD_ORDNER_ENTFERNEN = "/api/pmh/ordner/entfernen";
var CSRF_KOPF = "x-pmh-csrf";

class QuellordnerFehler extends Error {
  code;
  status;
  constructor(meldung, code, status) {
    super(meldung);
    this.code = code;
    this.status = status;
    this.name = "QuellordnerFehler";
  }
}
async function liesHuelle(antwort, weg) {
  let koerper;
  try {
    koerper = await antwort.json();
  } catch {
    throw new QuellordnerFehler(`${weg}: Die Antwort war kein JSON.`, "kein-json", antwort.status);
  }
  const huelle = koerper;
  if (huelle.ok === true)
    return huelle.value;
  const code = typeof huelle.error?.code === "string" ? huelle.error.code : "unbekannt";
  const meldung = typeof huelle.error?.message === "string" ? huelle.error.message : `${weg}: Der Server hat abgelehnt.`;
  throw new QuellordnerFehler(meldung, code, antwort.status);
}
function kopfMitCsrf(optionen) {
  const wert = optionen.csrf();
  if (wert === undefined || wert.trim() === "") {
    throw new QuellordnerFehler("Es ist kein CSRF-Wert da — der ändernde Aufruf wird GAR NICHT gesendet.", "csrf-fehlt", 0);
  }
  return { [CSRF_KOPF]: wert, "content-type": "application/json" };
}
async function listeOrdner(workspaceId, optionen) {
  const abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung));
  const antwort = await abruf(`${PFAD_ORDNER}?workspace=${encodeURIComponent(workspaceId)}`, {
    method: "GET"
  });
  const wert = await liesHuelle(antwort, PFAD_ORDNER);
  return { ordner: wert.ordner ?? [], wurzeln: wert.wurzeln ?? [] };
}
async function legeOrdnerAn(eingabe, optionen) {
  const abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung));
  const koerper = { workspaceId: eingabe.workspaceId, pfad: eingabe.pfad };
  if (eingabe.zugriff !== undefined)
    koerper["zugriff"] = eingabe.zugriff;
  if (eingabe.bezeichnung !== undefined && eingabe.bezeichnung.trim() !== "") {
    koerper["bezeichnung"] = eingabe.bezeichnung.trim();
  }
  const antwort = await abruf(PFAD_ORDNER_ANLEGEN, {
    method: "POST",
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify(koerper)
  });
  return await liesHuelle(antwort, PFAD_ORDNER_ANLEGEN);
}
async function setzeZugriff(id, zugriff, optionen) {
  const abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung));
  const antwort = await abruf(PFAD_ORDNER_ZUGRIFF, {
    method: "POST",
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify({ id, zugriff })
  });
  return await liesHuelle(antwort, PFAD_ORDNER_ZUGRIFF);
}
async function entferneOrdner(id, optionen) {
  const abruf = optionen.abruf ?? ((adresse, einstellung) => fetch(adresse, einstellung));
  const antwort = await abruf(PFAD_ORDNER_ENTFERNEN, {
    method: "POST",
    headers: kopfMitCsrf(optionen),
    body: JSON.stringify({ id })
  });
  await liesHuelle(antwort, PFAD_ORDNER_ENTFERNEN);
}

// packages/client/source-folders/src/client.tsx
var jsx_runtime2 = require("react/jsx-runtime");
var name = "source-folders";
var inject = ["slots", "workspaces", "sessions"];
function QuellordnerSchicht({
  optionen,
  arbeitsbereich,
  waehleVerzeichnis
}) {
  const [offen, setOffen] = import_react.useState(false);
  const [ordner, setOrdner] = import_react.useState([]);
  const [fehler, setFehler] = import_react.useState(undefined);
  const [runde, setRunde] = import_react.useState(0);
  import_react.useEffect(() => {
    if (!offen)
      return;
    const bereich = arbeitsbereich();
    if (bereich === undefined) {
      setFehler("Es gibt keinen Arbeitsbereich — es kann nichts angezeigt werden.");
      return;
    }
    let gilt = true;
    listeOrdner(bereich, optionen).then((liste) => {
      if (gilt) {
        setOrdner(liste.ordner);
        setFehler(undefined);
      }
    }).catch((e) => {
      if (gilt)
        setFehler(e instanceof Error ? e.message : "Die Ordner ließen sich nicht laden.");
    });
    return () => {
      gilt = false;
    };
  }, [offen, runde, arbeitsbereich, optionen]);
  const aendern = (tu) => {
    setFehler(undefined);
    tu().then(() => {
      setRunde((r) => r + 1);
    }).catch((e) => {
      setFehler(e instanceof Error ? e.message : "Die Änderung ließ sich nicht ausführen.");
    });
  };
  if (!offen) {
    return /* @__PURE__ */ jsx_runtime2.jsx("button", {
      type: "button",
      className: "pmh-quellordner-knopf",
      onClick: () => {
        if (optionen.csrf() === undefined) {
          setFehler("Kein CSRF-Wert in der Seite (Keks pmh_csrf) — es kann nichts geändert werden.");
        }
        setOffen(true);
      },
      children: "Quellordner"
    });
  }
  return /* @__PURE__ */ jsx_runtime2.jsx(QuellordnerDialog, {
    name: "",
    ordner,
    ...fehler === undefined ? {} : { fehler },
    beiZugriff: (id, zugriff) => {
      aendern(() => setzeZugriff(id, zugriff, optionen));
    },
    beiEntfernen: (id) => {
      aendern(() => entferneOrdner(id, optionen));
    },
    beiHinzufuegen: () => {
      const bereich = arbeitsbereich();
      if (bereich === undefined) {
        setFehler("Es gibt keinen Arbeitsbereich — es kann kein Ordner eingetragen werden.");
        return;
      }
      setFehler(undefined);
      waehleVerzeichnis().then(async (pfad) => {
        if (pfad === null)
          return;
        await legeOrdnerAn({ workspaceId: bereich, pfad }, optionen);
        setRunde((r) => r + 1);
      }).catch((e) => {
        setFehler(e instanceof Error ? e.message : "Der Ordner ließ sich nicht eintragen.");
      });
    },
    beiSchliessen: () => {
      setOffen(false);
    }
  });
}
function apply(ctx) {
  const kern = ctx;
  kern.slots.inject("shell.overlay", () => kern.slots.register({
    name: "shell.overlay",
    id: "source-folders",
    label: "Quellordner",
    inject: () => ({
      optionen: { csrf: csrfWert },
      arbeitsbereich: () => arbeitsbereichId(kern.workspaces.list.getSnapshot().items, kern.sessions.list.getSnapshot().current),
      waehleVerzeichnis: () => kern.workspaces.pickDirectory()
    })
  }, QuellordnerSchicht));
}

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
