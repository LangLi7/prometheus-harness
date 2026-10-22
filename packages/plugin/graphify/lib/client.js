/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/graphify/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/graphify/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/graphify",
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

		// packages/plugin/graphify/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  ENTRY_ID: () => ENTRY_ID,
		  GraphifyIcon: () => GraphifyIcon,
		  GraphifyPanel: () => GraphifyPanel,
		  PANEL_CSS: () => PANEL_CSS,
		  PANEL_ID: () => PANEL_ID,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react2 = require("react");

		// packages/plugin/graphify/src/graph-view.tsx
		var import_react = require("react");

		// packages/plugin/graphify/src/view.ts
		var STANDARD_REIHENFOLGE = 12;
		var STANDARD_GRENZE = 160;
		var GRENZE_MIN = 20;
		var GRENZE_MAX = 400;
		function zahlIn(wert, vorgabe, min, max) {
		  if (typeof wert !== "number" || !Number.isFinite(wert))
		    return vorgabe;
		  return Math.min(max, Math.max(min, Math.round(wert)));
		}
		function liesAnsicht(config) {
		  const flaeche = config?.surface;
		  const oberflaeche = flaeche === "plugins" || flaeche === "both" || flaeche === "none" || flaeche === "sidebar" ? flaeche : "sidebar";
		  const modusRoh = config?.view;
		  const modus = modusRoh === "graph" || modusRoh === "list" || modusRoh === "split" ? modusRoh : "split";
		  const ebeneRoh = config?.level;
		  const ebene = ebeneRoh === "gruppe" || ebeneRoh === "nachbarschaft" || ebeneRoh === "gesamt" ? ebeneRoh : "gesamt";
		  const tiefeRoh = zahlIn(config?.depth, 2, 1, 3);
		  const tiefe = tiefeRoh === 1 ? 1 : tiefeRoh === 3 ? 3 : 2;
		  const inspektorRoh = config?.inspector;
		  const inspektor = inspektorRoh === "below" || inspektorRoh === "off" || inspektorRoh === "right" ? inspektorRoh : "right";
		  const roh = config?.label;
		  const beschriftung = typeof roh === "string" && roh.trim() !== "" ? roh.trim() : undefined;
		  return {
		    oberflaeche,
		    reihenfolge: zahlIn(config?.order, STANDARD_REIHENFOLGE, 0, 999),
		    beschriftung,
		    modus,
		    ebene,
		    tiefe,
		    grenze: zahlIn(config?.limit, STANDARD_GRENZE, GRENZE_MIN, GRENZE_MAX),
		    beschriftungen: config?.labels !== false,
		    farbe: config?.colour === "kind" ? "kind" : "community",
		    bewegung: config?.motion !== false,
		    inspektor
		  };
		}
		var LEERER_INDEX = {
		  byId: new Map,
		  degree: new Map,
		  neighbours: new Map
		};
		function baueIndex(graph) {
		  const byId = new Map;
		  for (const knoten of graph.nodes)
		    byId.set(knoten.id, knoten);
		  const degree = new Map;
		  const nachbarn = new Map;
		  const merke = (id, anderer) => {
		    let menge = nachbarn.get(id);
		    if (menge === undefined) {
		      menge = new Set;
		      nachbarn.set(id, menge);
		    }
		    menge.add(anderer);
		  };
		  for (const kante of graph.edges) {
		    if (kante.from === kante.to)
		      continue;
		    degree.set(kante.from, (degree.get(kante.from) ?? 0) + 1);
		    degree.set(kante.to, (degree.get(kante.to) ?? 0) + 1);
		    merke(kante.from, kante.to);
		    merke(kante.to, kante.from);
		  }
		  const neighbours = new Map;
		  for (const [id, menge] of nachbarn) {
		    neighbours.set(id, [...menge].sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b)));
		  }
		  return { byId, degree, neighbours };
		}
		function hubs(index, anzahl) {
		  return [...index.degree.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, Math.max(0, anzahl)).map(([id]) => id);
		}
		var LEERE_GEMEINSCHAFTEN = { liste: [], nach: new Map };
		function baueGemeinschaften(index) {
		  const eimer = new Map;
		  const nach = new Map;
		  for (const knoten of index.byId.values()) {
		    if (knoten.community === undefined)
		      continue;
		    nach.set(knoten.id, knoten.community);
		    const liste2 = eimer.get(knoten.community);
		    if (liste2 === undefined)
		      eimer.set(knoten.community, [knoten.id]);
		    else
		      liste2.push(knoten.id);
		  }
		  const liste = [];
		  for (const [id, members] of eimer) {
		    members.sort((a, b) => (index.degree.get(b) ?? 0) - (index.degree.get(a) ?? 0) || a.localeCompare(b));
		    const top = members[0];
		    if (top === undefined)
		      continue;
		    liste.push({ id, members, top });
		  }
		  liste.sort((a, b) => b.members.length - a.members.length || a.id - b.id);
		  return { liste, nach };
		}
		function kantenIn(graph, gewaehlt) {
		  const edges = [];
		  for (const kante of graph.edges) {
		    if (kante.from === kante.to)
		      continue;
		    if (gewaehlt.has(kante.from) && gewaehlt.has(kante.to))
		      edges.push(kante);
		  }
		  return edges;
		}
		function auswahl(graph, index, ids, gekuerzt, fokus) {
		  const nodes = [];
		  const gewaehlt = new Set;
		  for (const id of ids) {
		    const knoten = index.byId.get(id);
		    if (knoten === undefined)
		      continue;
		    gewaehlt.add(id);
		    nodes.push(knoten);
		  }
		  return {
		    nodes,
		    edges: kantenIn(graph, gewaehlt),
		    fokus,
		    gekuerzt: gekuerzt || graph.nodes.length > nodes.length
		  };
		}
		function schneideGesamt(graph, index, gemeinschaften, grenze) {
		  const erlaubt = Math.max(1, Math.round(grenze));
		  const gruppen = gemeinschaften.liste.filter((gruppe) => gruppe.members.length >= 2).slice(0, 16);
		  if (gruppen.length === 0)
		    return auswahl(graph, index, hubs(index, erlaubt), true, null);
		  const pro = Math.max(2, Math.floor(erlaubt / gruppen.length));
		  const ids = [];
		  for (const gruppe of gruppen) {
		    ids.push(...wachseInGruppe(index, gruppe, pro));
		    if (ids.length >= erlaubt)
		      break;
		  }
		  return auswahl(graph, index, ids.slice(0, erlaubt), true, null);
		}
		function wachseInGruppe(index, gruppe, anzahl) {
		  const mitglieder = new Set(gruppe.members);
		  const gewaehlt = [];
		  const gesehen = new Set;
		  const warteschlange = [gruppe.top];
		  gesehen.add(gruppe.top);
		  for (let kopf = 0;kopf < warteschlange.length && gewaehlt.length < anzahl; kopf += 1) {
		    const id = warteschlange[kopf];
		    if (id === undefined)
		      continue;
		    gewaehlt.push(id);
		    for (const nachbar of index.neighbours.get(id) ?? []) {
		      if (!mitglieder.has(nachbar) || gesehen.has(nachbar))
		        continue;
		      gesehen.add(nachbar);
		      warteschlange.push(nachbar);
		    }
		  }
		  for (const id of gruppe.members) {
		    if (gewaehlt.length >= anzahl)
		      break;
		    if (gesehen.has(id))
		      continue;
		    gesehen.add(id);
		    gewaehlt.push(id);
		  }
		  return gewaehlt;
		}
		function schneideGruppe(graph, index, gemeinschaften, gruppe, grenze) {
		  const erlaubt = Math.max(1, Math.round(grenze));
		  const eintrag = gemeinschaften.liste.find((kandidat) => kandidat.id === gruppe);
		  if (eintrag === undefined)
		    return LEERER_AUSSCHNITT;
		  const ids = eintrag.members.slice(0, erlaubt);
		  return auswahl(graph, index, ids, eintrag.members.length > ids.length, eintrag.top);
		}
		var LEERER_AUSSCHNITT = { nodes: [], edges: [], fokus: null, gekuerzt: false };
		function schneideAusschnitt(graph, index, fokus, tiefe, grenze) {
		  const erlaubt = Math.max(1, Math.round(grenze));
		  const wurzeln = [];
		  if (fokus !== null && index.byId.has(fokus))
		    wurzeln.push(fokus);
		  else
		    wurzeln.push(...hubs(index, Math.min(8, erlaubt)));
		  const distanz = new Map;
		  const reihenfolge = [];
		  const warteschlange = [];
		  for (const wurzel of wurzeln) {
		    if (distanz.has(wurzel))
		      continue;
		    distanz.set(wurzel, 0);
		    reihenfolge.push(wurzel);
		    warteschlange.push(wurzel);
		  }
		  let gekuerzt = false;
		  const maxTiefe = Math.max(1, Math.round(tiefe));
		  const direkte = Math.max(1, Math.ceil(erlaubt * 0.45));
		  for (let kopf = 0;kopf < warteschlange.length; kopf += 1) {
		    const id = warteschlange[kopf];
		    if (id === undefined)
		      continue;
		    const tiefeJetzt = distanz.get(id) ?? 0;
		    if (tiefeJetzt >= maxTiefe)
		      continue;
		    const nachbarn = index.neighbours.get(id) ?? [];
		    const liste = tiefeJetzt === 0 && maxTiefe >= 2 && nachbarn.length > direkte ? nachbarn.slice(0, direkte) : nachbarn;
		    for (const nachbar of liste) {
		      if (distanz.has(nachbar))
		        continue;
		      if (reihenfolge.length >= erlaubt) {
		        gekuerzt = true;
		        break;
		      }
		      distanz.set(nachbar, tiefeJetzt + 1);
		      reihenfolge.push(nachbar);
		      warteschlange.push(nachbar);
		    }
		  }
		  if (fokus !== null && index.byId.has(fokus) && reihenfolge.length < erlaubt) {
		    for (const nachbar of index.neighbours.get(fokus) ?? []) {
		      if (reihenfolge.length >= erlaubt) {
		        gekuerzt = true;
		        break;
		      }
		      if (distanz.has(nachbar))
		        continue;
		      distanz.set(nachbar, 1);
		      reihenfolge.push(nachbar);
		    }
		  }
		  return auswahl(graph, index, reihenfolge, gekuerzt, fokus !== null && index.byId.has(fokus) ? fokus : null);
		}
		var GRUPPEN_FARBEN = [
		  "#5b8def",
		  "#e8833a",
		  "#d9534f",
		  "#3fae9f",
		  "#8fc93a",
		  "#d9b34a",
		  "#a97bd6",
		  "#e06fa0",
		  "#4fc3d9",
		  "#8f9bb3",
		  "#c47a5a",
		  "#63b36f"
		];
		function farbeNachGruppe(community) {
		  if (community === undefined || !Number.isFinite(community))
		    return "#6b7c8f";
		  const stelle = (Math.trunc(community) % GRUPPEN_FARBEN.length + GRUPPEN_FARBEN.length) % GRUPPEN_FARBEN.length;
		  return GRUPPEN_FARBEN[stelle] ?? "#6b7c8f";
		}
		function farbeNachArt(kind) {
		  if (kind === "file")
		    return "#4fc3d9";
		  if (kind === "symbol")
		    return "#8fe3c6";
		  return "#8f9bb3";
		}
		function farbeFuer(knoten, regel) {
		  return regel === "kind" ? farbeNachArt(knoten.kind) : farbeNachGruppe(knoten.community);
		}
		function streuung(id) {
		  let hash = 2166136261;
		  for (let stelle = 0;stelle < id.length; stelle += 1) {
		    hash ^= id.charCodeAt(stelle);
		    hash = Math.imul(hash, 16777619);
		  }
		  return (hash >>> 0) / 4294967296;
		}
		function startPunkt(id, platz, gesamt) {
		  const goldener = 2.399963229728653;
		  const anteil = (platz + 0.5) / Math.max(1, gesamt);
		  const radius = 250 * Math.sqrt(anteil);
		  const winkel = platz * goldener + streuung(id) * 0.7;
		  return { x: Math.cos(winkel) * radius, y: Math.sin(winkel) * radius };
		}

		// packages/plugin/graphify/src/sim.ts
		var ABSTOSSUNG = 9000;
		var FEDER = 0.045;
		var RUHELAENGE = 48;
		var SCHWERKRAFT = 0.0015;
		var GRUPPENZUG = 0.01;
		var DAEMPFUNG = 0.84;
		var MAX_TEMPO = 16;
		var ABSTAND = 480;
		function baueSim(knoten, kanten) {
		  const stelle = new Map;
		  const nodes = knoten.map((eintrag, platz) => {
		    stelle.set(eintrag.id, platz);
		    const punkt = startPunkt(eintrag.id, platz, knoten.length);
		    return {
		      id: eintrag.id,
		      label: eintrag.label,
		      kind: eintrag.kind,
		      community: eintrag.community,
		      degree: 0,
		      x: punkt.x,
		      y: punkt.y,
		      vx: 0,
		      vy: 0,
		      fix: false
		    };
		  });
		  const edges = [];
		  const grade = new Array(nodes.length).fill(0);
		  for (const kante of kanten) {
		    const a = stelle.get(kante.from);
		    const b = stelle.get(kante.to);
		    if (a === undefined || b === undefined || a === b)
		      continue;
		    edges.push({ a, b });
		    grade[a] = (grade[a] ?? 0) + 1;
		    grade[b] = (grade[b] ?? 0) + 1;
		  }
		  for (const [platz, knoten2] of nodes.entries()) {
		    knoten2.degree = grade[platz] ?? 0;
		  }
		  return {
		    nodes,
		    edges,
		    fx: new Float64Array(nodes.length),
		    fy: new Float64Array(nodes.length),
		    ticks: 0
		  };
		}
		function schritt(sim) {
		  const { nodes, edges, fx, fy } = sim;
		  const anzahl = nodes.length;
		  if (anzahl === 0)
		    return;
		  fx.fill(0);
		  fy.fill(0);
		  for (let a = 0;a < anzahl; a += 1) {
		    const ka = nodes[a];
		    if (ka === undefined)
		      continue;
		    for (let b = a + 1;b < anzahl; b += 1) {
		      const kb = nodes[b];
		      if (kb === undefined)
		        continue;
		      let dx = ka.x - kb.x;
		      let dy = ka.y - kb.y;
		      let abstand2 = dx * dx + dy * dy;
		      if (abstand2 > ABSTAND * ABSTAND)
		        continue;
		      if (abstand2 < 0.01) {
		        dx = (a + 1) % 7 - 3;
		        dy = (b + 1) % 5 - 2;
		        abstand2 = dx * dx + dy * dy;
		      }
		      const abstand = Math.sqrt(abstand2);
		      const staerke = ABSTOSSUNG / abstand2;
		      const x = dx / abstand * staerke;
		      const y = dy / abstand * staerke;
		      fx[a] = (fx[a] ?? 0) + x;
		      fy[a] = (fy[a] ?? 0) + y;
		      fx[b] = (fx[b] ?? 0) - x;
		      fy[b] = (fy[b] ?? 0) - y;
		    }
		  }
		  for (const kante of edges) {
		    const ka = nodes[kante.a];
		    const kb = nodes[kante.b];
		    if (ka === undefined || kb === undefined)
		      continue;
		    const dx = kb.x - ka.x;
		    const dy = kb.y - ka.y;
		    const abstand = Math.sqrt(dx * dx + dy * dy) || 0.01;
		    const staerke = (abstand - RUHELAENGE) * FEDER;
		    const x = dx / abstand * staerke;
		    const y = dy / abstand * staerke;
		    fx[kante.a] = (fx[kante.a] ?? 0) + x;
		    fy[kante.a] = (fy[kante.a] ?? 0) + y;
		    fx[kante.b] = (fx[kante.b] ?? 0) - x;
		    fy[kante.b] = (fy[kante.b] ?? 0) - y;
		  }
		  const gruppen = new Map;
		  for (const knoten of nodes) {
		    if (knoten.community === undefined)
		      continue;
		    let gruppe = gruppen.get(knoten.community);
		    if (gruppe === undefined) {
		      gruppe = { x: 0, y: 0, n: 0 };
		      gruppen.set(knoten.community, gruppe);
		    }
		    gruppe.x += knoten.x;
		    gruppe.y += knoten.y;
		    gruppe.n += 1;
		  }
		  for (const [stelle, knoten] of nodes.entries()) {
		    let x = (fx[stelle] ?? 0) - knoten.x * SCHWERKRAFT;
		    let y = (fy[stelle] ?? 0) - knoten.y * SCHWERKRAFT;
		    if (knoten.community !== undefined) {
		      const gruppe = gruppen.get(knoten.community);
		      if (gruppe !== undefined && gruppe.n > 1) {
		        x += (gruppe.x / gruppe.n - knoten.x) * GRUPPENZUG;
		        y += (gruppe.y / gruppe.n - knoten.y) * GRUPPENZUG;
		      }
		    }
		    knoten.vx = (knoten.vx + x) * DAEMPFUNG;
		    knoten.vy = (knoten.vy + y) * DAEMPFUNG;
		    const tempo = Math.hypot(knoten.vx, knoten.vy);
		    if (tempo > MAX_TEMPO) {
		      const faktor = MAX_TEMPO / tempo;
		      knoten.vx *= faktor;
		      knoten.vy *= faktor;
		    }
		  }
		  for (const knoten of nodes) {
		    if (knoten.fix) {
		      knoten.vx = 0;
		      knoten.vy = 0;
		      continue;
		    }
		    knoten.x += knoten.vx;
		    knoten.y += knoten.vy;
		    if (!Number.isFinite(knoten.x) || !Number.isFinite(knoten.y)) {
		      knoten.x = 0;
		      knoten.y = 0;
		      knoten.vx = 0;
		      knoten.vy = 0;
		    }
		  }
		  sim.ticks += 1;
		}
		function grenzen(sim, anteil = 0) {
		  if (sim.nodes.length === 0)
		    return { minX: -1, minY: -1, maxX: 1, maxY: 1 };
		  const xs = sim.nodes.map((knoten) => knoten.x).sort((a, b) => a - b);
		  const ys = sim.nodes.map((knoten) => knoten.y).sort((a, b) => a - b);
		  const ab = Math.min(0.2, Math.max(0, anteil));
		  const unten = Math.floor(xs.length * ab);
		  const oben = Math.max(unten, xs.length - 1 - unten);
		  const minX = xs[unten] ?? 0;
		  const maxX = xs[oben] ?? 0;
		  const minY = ys[unten] ?? 0;
		  const maxY = ys[oben] ?? 0;
		  return { minX, minY, maxX, maxY };
		}

		// packages/plugin/graphify/src/graph-view.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var TREFFER = 13;
		var VORLAUF = 360;
		function GraphCanvas({
		  ausschnitt,
		  farbe,
		  beschriftungen,
		  bewegung,
		  gewaehlt,
		  onSelect,
		  seed,
		  t
		}) {
		  const huelle = import_react.useRef(null);
		  const leinwand = import_react.useRef(null);
		  const sim = import_react.useRef(null);
		  const sicht = import_react.useRef({ k: 1, x: 0, y: 0 });
		  const kasten = import_react.useRef({ w: 0, h: 0 });
		  const zeiger = import_react.useRef(null);
		  const griff = import_react.useRef(null);
		  const waerme = import_react.useRef(0);
		  const schmutzig = import_react.useRef(true);
		  const brauchtFit = import_react.useRef(true);
		  const zeichneRef = import_react.useRef(() => {
		    return;
		  });
		  const [zoom, setZoom] = import_react.useState(1);
		  const passeEin = import_react.useCallback((layout, breite, hoehe) => {
		    const raum = grenzen(layout, 0.02);
		    const weit = Math.max(1, raum.maxX - raum.minX);
		    const hoch = Math.max(1, raum.maxY - raum.minY);
		    const rand = 46;
		    const k = Math.max(0.06, Math.min((breite - rand * 2) / weit, (hoehe - rand * 2) / hoch, 2.4));
		    sicht.current = {
		      k,
		      x: -((raum.minX + raum.maxX) / 2) * k,
		      y: -((raum.minY + raum.maxY) / 2) * k
		    };
		    setZoom(k);
		  }, []);
		  const passt = import_react.useCallback(() => {
		    const layout = sim.current;
		    const { w, h } = kasten.current;
		    if (layout === null || w === 0 || h === 0)
		      return;
		    passeEin(layout, w, h);
		    schmutzig.current = true;
		  }, [passeEin]);
		  const zoome = import_react.useCallback((faktor) => {
		    const k = Math.max(0.06, Math.min(4, sicht.current.k * faktor));
		    sicht.current = { ...sicht.current, k };
		    setZoom(k);
		    schmutzig.current = true;
		  }, []);
		  const welt = import_react.useCallback((mx, my) => {
		    const { w, h } = kasten.current;
		    const { k, x, y } = sicht.current;
		    return { x: (mx - w / 2 - x) / k, y: (my - h / 2 - y) / k };
		  }, []);
		  const treffer = import_react.useCallback((mx, my) => {
		    const layout = sim.current;
		    if (layout === null)
		      return null;
		    const { w, h } = kasten.current;
		    const { k, x, y } = sicht.current;
		    let bestes = null;
		    let naehe = TREFFER;
		    for (const [stelle, knoten] of layout.nodes.entries()) {
		      const px = knoten.x * k + w / 2 + x;
		      const py = knoten.y * k + h / 2 + y;
		      const abstand = Math.hypot(px - mx, py - my);
		      if (abstand < naehe) {
		        naehe = abstand;
		        bestes = stelle;
		      }
		    }
		    return bestes;
		  }, []);
		  const zeichne = import_react.useCallback(() => {
		    const el = leinwand.current;
		    const layout = sim.current;
		    if (el === null)
		      return;
		    const ctx = el.getContext("2d");
		    if (ctx === null)
		      return;
		    const { w, h } = kasten.current;
		    const dpr = window.devicePixelRatio || 1;
		    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		    ctx.clearRect(0, 0, w, h);
		    if (layout === null || layout.nodes.length === 0)
		      return;
		    const { k, x: sx, y: sy } = sicht.current;
		    const mitteX = w / 2 + sx;
		    const mitteY = h / 2 + sy;
		    const stelleVon = new Map;
		    const px = [];
		    const py = [];
		    for (const [stelle, knoten] of layout.nodes.entries()) {
		      stelleVon.set(knoten.id, stelle);
		      px.push(knoten.x * k + mitteX);
		      py.push(knoten.y * k + mitteY);
		    }
		    const zeigerKnoten = zeiger.current === null ? null : treffer(zeiger.current.x, zeiger.current.y);
		    const gewaehltStelle = gewaehlt === null ? undefined : stelleVon.get(gewaehlt);
		    ctx.fillStyle = "rgba(143,227,198,.055)";
		    const raster = 46;
		    for (let gx = mitteX % raster - raster;gx < w; gx += raster) {
		      for (let gy = mitteY % raster - raster;gy < h; gy += raster) {
		        ctx.fillRect(gx, gy, 1, 1);
		      }
		    }
		    ctx.lineWidth = 1;
		    ctx.strokeStyle = "rgba(143,227,198,.15)";
		    ctx.beginPath();
		    for (const kante of layout.edges) {
		      const a = kante.a;
		      const b = kante.b;
		      if (a === gewaehltStelle || b === gewaehltStelle)
		        continue;
		      const ax = px[a];
		      const ay = py[a];
		      const bx = px[b];
		      const by = py[b];
		      if (ax === undefined || ay === undefined || bx === undefined || by === undefined)
		        continue;
		      ctx.moveTo(ax, ay);
		      ctx.lineTo(bx, by);
		    }
		    ctx.stroke();
		    if (gewaehltStelle !== undefined) {
		      ctx.strokeStyle = "rgba(88,224,174,.42)";
		      ctx.lineWidth = 1.2;
		      ctx.beginPath();
		      for (const kante of layout.edges) {
		        if (kante.a !== gewaehltStelle && kante.b !== gewaehltStelle)
		          continue;
		        const a = kante.a;
		        const b = kante.b;
		        const ax = px[a];
		        const ay = py[a];
		        const bx = px[b];
		        const by = py[b];
		        if (ax === undefined || ay === undefined || bx === undefined || by === undefined)
		          continue;
		        ctx.moveTo(ax, ay);
		        ctx.lineTo(bx, by);
		      }
		      ctx.stroke();
		    }
		    for (const [stelle, knoten] of layout.nodes.entries()) {
		      const x = px[stelle];
		      const y = py[stelle];
		      if (x === undefined || y === undefined)
		        continue;
		      const radius = 2.3 + Math.min(5.8, Math.sqrt(knoten.degree) * 0.85);
		      ctx.beginPath();
		      ctx.arc(x, y, radius, 0, Math.PI * 2);
		      ctx.fillStyle = farbeFuer(knoten, farbe);
		      ctx.fill();
		      if (stelle === gewaehltStelle) {
		        ctx.strokeStyle = "#f2fff9";
		        ctx.lineWidth = 1.5;
		        ctx.beginPath();
		        ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
		        ctx.stroke();
		      } else if (stelle === zeigerKnoten) {
		        ctx.strokeStyle = "rgba(255,255,255,.55)";
		        ctx.lineWidth = 1;
		        ctx.beginPath();
		        ctx.arc(x, y, radius + 2.5, 0, Math.PI * 2);
		        ctx.stroke();
		      }
		    }
		    const kandidaten = layout.nodes.map((knoten, stelle) => ({ knoten, stelle })).filter(({ knoten, stelle }) => stelle === gewaehltStelle || stelle === zeigerKnoten || beschriftungen && knoten.degree >= 7).sort((a, b) => b.knoten.degree - a.knoten.degree).slice(0, 18);
		    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
		    ctx.textBaseline = "middle";
		    const belegt = [];
		    for (const { knoten, stelle } of kandidaten) {
		      const x = px[stelle];
		      const y = py[stelle];
		      if (x === undefined || y === undefined)
		        continue;
		      const breite = ctx.measureText(knoten.label).width;
		      const radius = 2.3 + Math.min(5.8, Math.sqrt(knoten.degree) * 0.85);
		      const links = x + radius + 5;
		      const oben2 = y - 5;
		      const kollision = belegt.some((feld) => links < feld.x + feld.w + 4 && links + breite + 4 > feld.x && oben2 < feld.y + feld.h && oben2 + 11 > feld.y);
		      if (kollision && stelle !== gewaehltStelle && stelle !== zeigerKnoten)
		        continue;
		      belegt.push({ x: links, y: oben2, w: breite, h: 11 });
		      ctx.fillStyle = stelle === gewaehltStelle ? "#f2fff9" : stelle === zeigerKnoten ? "#d8fff1" : "rgba(233,243,240,.66)";
		      ctx.fillText(knoten.label, links, y + 0.5);
		    }
		  }, [beschriftungen, farbe, gewaehlt, treffer]);
		  import_react.useEffect(() => {
		    zeichneRef.current = zeichne;
		    schmutzig.current = true;
		  }, [zeichne]);
		  import_react.useEffect(() => {
		    const el = huelle.current;
		    if (el === null)
		      return;
		    const beobachter = new ResizeObserver((eintraege) => {
		      const feld = eintraege[0]?.contentRect;
		      if (feld === undefined)
		        return;
		      const breite = Math.max(1, feld.width);
		      const hoehe = Math.max(1, feld.height);
		      kasten.current = { w: breite, h: hoehe };
		      const canvas = leinwand.current;
		      if (canvas !== null) {
		        const dpr = window.devicePixelRatio || 1;
		        canvas.width = Math.round(breite * dpr);
		        canvas.height = Math.round(hoehe * dpr);
		      }
		      const layout = sim.current;
		      if (layout !== null && brauchtFit.current) {
		        passeEin(layout, breite, hoehe);
		        brauchtFit.current = false;
		      }
		      schmutzig.current = true;
		    });
		    beobachter.observe(el);
		    return () => beobachter.disconnect();
		  }, [passeEin]);
		  import_react.useEffect(() => {
		    const layout = baueSim(ausschnitt.nodes, ausschnitt.edges);
		    sim.current = layout;
		    if (bewegung) {
		      for (let i = 0;i < 90; i += 1)
		        schritt(layout);
		      waerme.current = 1;
		    } else {
		      for (let i = 0;i < VORLAUF; i += 1)
		        schritt(layout);
		      waerme.current = 0;
		    }
		    const { w, h } = kasten.current;
		    if (w > 0 && h > 0) {
		      passeEin(layout, w, h);
		      brauchtFit.current = false;
		    } else {
		      brauchtFit.current = true;
		    }
		    schmutzig.current = true;
		  }, [ausschnitt, seed, bewegung, passeEin]);
		  import_react.useEffect(() => {
		    let rahmen = 0;
		    let weiter = true;
		    const takt = () => {
		      if (!weiter)
		        return;
		      if (!document.hidden) {
		        const layout = sim.current;
		        const zieht = griff.current !== null;
		        if (layout !== null && (waerme.current > 0 || zieht)) {
		          schritt(layout);
		          waerme.current = Math.max(0, waerme.current * 0.986);
		          if (waerme.current < 0.004 && !zieht)
		            waerme.current = 0;
		          schmutzig.current = true;
		        }
		        if (schmutzig.current) {
		          zeichneRef.current();
		          schmutzig.current = false;
		        }
		      }
		      rahmen = requestAnimationFrame(takt);
		    };
		    rahmen = requestAnimationFrame(takt);
		    return () => {
		      weiter = false;
		      cancelAnimationFrame(rahmen);
		    };
		  }, []);
		  const zeige = (mx, my) => {
		    zeiger.current = { x: mx, y: my };
		    const el = leinwand.current;
		    if (el !== null) {
		      const naehe = treffer(mx, my);
		      el.style.cursor = naehe === null ? "grab" : "pointer";
		    }
		    schmutzig.current = true;
		  };
		  const unten = (event) => {
		    const el = leinwand.current;
		    if (el === null)
		      return;
		    const feld = el.getBoundingClientRect();
		    const mx = event.clientX - feld.left;
		    const my = event.clientY - feld.top;
		    const naehe = treffer(mx, my);
		    el.setPointerCapture(event.pointerId);
		    if (naehe === null) {
		      griff.current = { art: "flaeche", mx, my, bewegt: false };
		      el.style.cursor = "grabbing";
		    } else {
		      griff.current = { art: "knoten", stelle: naehe, mx, my, bewegt: false };
		      const knoten = sim.current?.nodes[naehe];
		      if (knoten !== undefined)
		        knoten.fix = true;
		      waerme.current = Math.max(waerme.current, 0.45);
		    }
		  };
		  const bewege = (event) => {
		    const el = leinwand.current;
		    if (el === null)
		      return;
		    const feld = el.getBoundingClientRect();
		    const mx = event.clientX - feld.left;
		    const my = event.clientY - feld.top;
		    const jetzt = griff.current;
		    if (jetzt === null) {
		      zeige(mx, my);
		      return;
		    }
		    const dx = mx - jetzt.mx;
		    const dy = my - jetzt.my;
		    if (Math.abs(dx) + Math.abs(dy) > 3)
		      jetzt.bewegt = true;
		    if (jetzt.art === "flaeche") {
		      sicht.current = { ...sicht.current, x: sicht.current.x + dx, y: sicht.current.y + dy };
		    } else {
		      const knoten = sim.current?.nodes[jetzt.stelle];
		      if (knoten !== undefined) {
		        const ziel = welt(mx, my);
		        knoten.x = ziel.x;
		        knoten.y = ziel.y;
		        knoten.vx = 0;
		        knoten.vy = 0;
		      }
		    }
		    jetzt.mx = mx;
		    jetzt.my = my;
		    zeiger.current = { x: mx, y: my };
		    schmutzig.current = true;
		  };
		  const oben = (event) => {
		    const el = leinwand.current;
		    const jetzt = griff.current;
		    griff.current = null;
		    if (el !== null) {
		      if (el.hasPointerCapture(event.pointerId))
		        el.releasePointerCapture(event.pointerId);
		      el.style.cursor = "grab";
		    }
		    if (jetzt === null)
		      return;
		    if (jetzt.art === "knoten") {
		      const knoten = sim.current?.nodes[jetzt.stelle];
		      if (knoten !== undefined)
		        knoten.fix = false;
		      if (!jetzt.bewegt) {
		        const id = knoten?.id;
		        if (id !== undefined)
		          onSelect(id);
		      }
		      waerme.current = Math.max(waerme.current, 0.25);
		    }
		    schmutzig.current = true;
		  };
		  import_react.useEffect(() => {
		    const el = leinwand.current;
		    if (el === null)
		      return;
		    const behandeln = (event) => {
		      event.preventDefault();
		      const feld = el.getBoundingClientRect();
		      const mx = event.clientX - feld.left;
		      const my = event.clientY - feld.top;
		      const { w, h } = kasten.current;
		      const vorher = sicht.current;
		      const punkt = {
		        x: (mx - w / 2 - vorher.x) / vorher.k,
		        y: (my - h / 2 - vorher.y) / vorher.k
		      };
		      const k = Math.max(0.06, Math.min(4, vorher.k * Math.exp(-event.deltaY * 0.0014)));
		      sicht.current = { k, x: mx - w / 2 - punkt.x * k, y: my - h / 2 - punkt.y * k };
		      setZoom(k);
		      schmutzig.current = true;
		    };
		    el.addEventListener("wheel", behandeln, { passive: false });
		    return () => el.removeEventListener("wheel", behandeln);
		  }, []);
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-gf__leinwand",
		    ref: huelle,
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsx("canvas", {
		        ref: leinwand,
		        className: "pmh-gf__canvas",
		        onPointerDown: unten,
		        onPointerMove: bewege,
		        onPointerUp: oben,
		        onPointerCancel: oben,
		        onPointerLeave: () => {
		          zeiger.current = null;
		          const el = leinwand.current;
		          if (el !== null)
		            el.style.cursor = "grab";
		          schmutzig.current = true;
		        },
		        role: "application",
		        "aria-label": t("graph")
		      }),
		      ausschnitt.nodes.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-gf__leinwandleer",
		        children: t("noNodes")
		      }) : null,
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-gf__zoombar",
		        role: "group",
		        "aria-label": t("zoom"),
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            type: "button",
		            onClick: () => zoome(1.35),
		            title: t("zoomIn"),
		            "aria-label": t("zoomIn"),
		            children: "+"
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            type: "button",
		            onClick: () => zoome(1 / 1.35),
		            title: t("zoomOut"),
		            "aria-label": t("zoomOut"),
		            children: "−"
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            type: "button",
		            onClick: passt,
		            title: t("fit"),
		            "aria-label": t("fit"),
		            children: "⤢"
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("span", {
		        className: "pmh-gf__zoomwert",
		        children: [
		          Math.round(zoom * 100),
		          " %"
		        ]
		      })
		    ]
		  });
		}

		// packages/plugin/graphify/src/index.tsx
		var jsx_runtime2 = require("react/jsx-runtime");
		var PANEL_ID = "graphify";
		var ENTRY_ID = "pmh-graphify";
		var NS = "graphify";
		var inject = ["slots", "locale", "layout", "configForms"];
		async function hole(url) {
		  const antwort = await fetch(url, { headers: { accept: "application/json" } });
		  if (!antwort.ok)
		    throw new Error(`HTTP ${antwort.status}`);
		  return await antwort.json();
		}
		function useAnsicht(form) {
		  const [roh, setRoh] = import_react2.useState(() => form?.getSnapshot().value);
		  import_react2.useEffect(() => {
		    if (form === undefined)
		      return;
		    setRoh(form.getSnapshot().value);
		    return form.subscribe(() => setRoh(form.getSnapshot().value));
		  }, [form]);
		  return import_react2.useMemo(() => liesAnsicht(roh), [roh]);
		}
		function SetupBox({
		  setup,
		  laeuft,
		  ausgabe,
		  onInstall,
		  onModus,
		  t
		}) {
		  const letzte = setup.installiert;
		  const text = ausgabe !== "" ? ausgabe : [letzte?.output, letzte?.error].filter((teil) => typeof teil === "string" && teil.trim() !== "").join(`
		`);
		  return /* @__PURE__ */ jsx_runtime2.jsxs("section", {
		    className: "pmh-gf__setup",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__setupkopf",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("b", {
		            children: t("setupTitle")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("span", {
		            children: t("setupMissing")
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__setupzeile",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("span", {
		            className: "pmh-gf__setupweg",
		            children: [
		              t("setupMethod"),
		              ": ",
		              /* @__PURE__ */ jsx_runtime2.jsx("code", {
		                children: setup.method === "none" ? t("setupNone") : setup.method
		              })
		            ]
		          }),
		          setup.installable ? /* @__PURE__ */ jsx_runtime2.jsx("button", {
		            className: "pmh-gf__btn pmh-gf__btn--run",
		            type: "button",
		            onClick: onInstall,
		            disabled: laeuft,
		            children: laeuft ? t("setupInstalling") : t("setupInstall")
		          }) : null,
		          /* @__PURE__ */ jsx_runtime2.jsxs("label", {
		            className: "pmh-gf__setupauto",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("input", {
		                type: "checkbox",
		                checked: setup.modus === "auto",
		                onChange: (event) => onModus(event.target.checked ? "auto" : "ask")
		              }),
		              t("setupAuto")
		            ]
		          })
		        ]
		      }),
		      setup.hinweise.length > 0 ? /* @__PURE__ */ jsx_runtime2.jsx("ul", {
		        className: "pmh-gf__setuphilfe",
		        children: setup.hinweise.map((zeile) => /* @__PURE__ */ jsx_runtime2.jsx("li", {
		          children: zeile
		        }, zeile))
		      }) : null,
		      text === "" ? null : /* @__PURE__ */ jsx_runtime2.jsx("pre", {
		        className: "pmh-gf__setupausgabe",
		        children: text.slice(0, 4000)
		      })
		    ]
		  });
		}
		function GraphifyPanel({ close, form, t }) {
		  const [status, setStatus] = import_react2.useState(null);
		  const [graph, setGraph] = import_react2.useState(null);
		  const [fehler, setFehler] = import_react2.useState(null);
		  const [laden, setLaden] = import_react2.useState(true);
		  const [neu, setNeu] = import_react2.useState(0);
		  const [suche, setSuche] = import_react2.useState("");
		  const [gewaehlt, setGewaehlt] = import_react2.useState(null);
		  const [lauf, setLauf] = import_react2.useState("idle");
		  const [ausgabe, setAusgabe] = import_react2.useState("");
		  const [datei, setDatei] = import_react2.useState(null);
		  const [dateiLaden, setDateiLaden] = import_react2.useState(false);
		  const [dateiFehler, setDateiFehler] = import_react2.useState(null);
		  const [dateiGeaendert, setDateiGeaendert] = import_react2.useState(false);
		  const [startBearbeiten, setStartBearbeiten] = import_react2.useState(false);
		  const [seed, setSeed] = import_react2.useState(0);
		  const [setup, setSetup] = import_react2.useState(null);
		  const [setupLaeuft, setSetupLaeuft] = import_react2.useState(false);
		  const [setupAusgabe, setSetupAusgabe] = import_react2.useState("");
		  const anzeige = useAnsicht(form);
		  const [tiefe, setTiefe] = import_react2.useState(anzeige.tiefe);
		  const [beschriftungen, setBeschriftungen] = import_react2.useState(anzeige.beschriftungen);
		  const [bewegung, setBewegung] = import_react2.useState(anzeige.bewegung);
		  const [farbe, setFarbe] = import_react2.useState(anzeige.farbe);
		  const [ebene, setEbene] = import_react2.useState(anzeige.ebene);
		  const [gruppe, setGruppe] = import_react2.useState(null);
		  import_react2.useEffect(() => {
		    setTiefe(anzeige.tiefe);
		    setBeschriftungen(anzeige.beschriftungen);
		    setBewegung(anzeige.bewegung);
		    setFarbe(anzeige.farbe);
		    setEbene(anzeige.ebene);
		  }, [anzeige.tiefe, anzeige.beschriftungen, anzeige.bewegung, anzeige.farbe, anzeige.ebene]);
		  import_react2.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    setFehler(null);
		    Promise.all([
		      hole("/api/world/graphify/status"),
		      hole("/api/world/graphify/graph"),
		      hole("/api/world/graphify/setup").catch(() => null)
		    ]).then(([neuerStatus, neuerGraph, neuesSetup]) => {
		      if (ab)
		        return;
		      setStatus(neuerStatus);
		      setGraph(neuerGraph);
		      setSetup(neuesSetup);
		    }).catch((problem) => {
		      if (ab)
		        return;
		      setFehler(problem instanceof Error ? problem.message : String(problem));
		    }).finally(() => {
		      if (!ab)
		        setLaden(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [neu]);
		  const index = import_react2.useMemo(() => graph === null ? LEERER_INDEX : baueIndex(graph), [graph]);
		  const gemeinschaften = import_react2.useMemo(() => graph === null ? LEERE_GEMEINSCHAFTEN : baueGemeinschaften(index), [graph, index]);
		  const gruppen = import_react2.useMemo(() => {
		    const menge = new Set;
		    for (const knoten of graph?.nodes ?? []) {
		      if (knoten.community !== undefined)
		        menge.add(knoten.community);
		    }
		    return menge;
		  }, [graph]);
		  import_react2.useEffect(() => {
		    if (graph === null || graph.nodes.length === 0)
		      return;
		    if (gewaehlt !== null && index.byId.has(gewaehlt))
		      return;
		    setGewaehlt(hubs(index, 1)[0] ?? graph.nodes[0]?.id ?? null);
		  }, [graph, index, gewaehlt]);
		  import_react2.useEffect(() => {
		    setDatei(null);
		    setDateiFehler(null);
		  }, [gewaehlt]);
		  const starte = async () => {
		    setLauf("laeuft");
		    setAusgabe("");
		    try {
		      const antwort = await fetch("/api/world/graphify/run", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify({ mode: "update" })
		      });
		      const daten = await antwort.json();
		      const text = [daten.output, daten.stderr, daten.error].filter(Boolean).join(`
		`);
		      setAusgabe(text.length > 0 ? text : `exit ${daten.exitCode ?? "?"}`);
		      setLauf(daten.ok ? "fertig" : "fehler");
		      if (daten.ok)
		        setNeu((n) => n + 1);
		    } catch (problem) {
		      setAusgabe(problem instanceof Error ? problem.message : String(problem));
		      setLauf("fehler");
		    }
		  };
		  const installiere = async () => {
		    setSetupLaeuft(true);
		    setSetupAusgabe("");
		    try {
		      const antwort = await fetch("/api/world/graphify/setup", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify({})
		      });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${antwort.status}`);
		      const daten = await antwort.json();
		      setSetup(daten);
		      const ergebnis = daten.installiert;
		      const text = [ergebnis?.output, ergebnis?.error].filter((teil) => typeof teil === "string" && teil.trim() !== "").join(`
		`);
		      setSetupAusgabe(text.length > 0 ? text : ergebnis?.ok === true ? t("setupDone") : t("setupFailed"));
		      if (ergebnis?.ok === true)
		        setNeu((n) => n + 1);
		    } catch (problem) {
		      setSetupAusgabe(problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setSetupLaeuft(false);
		    }
		  };
		  const setzeSetupModus = async (modus) => {
		    try {
		      const antwort = await fetch("/api/world/graphify/config", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify({ setup: modus })
		      });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${antwort.status}`);
		      setSetup((alt) => alt === null ? alt : { ...alt, modus });
		    } catch (problem) {
		      setSetupAusgabe(problem instanceof Error ? problem.message : String(problem));
		    }
		  };
		  const hubsListe = import_react2.useMemo(() => {
		    if (graph === null)
		      return [];
		    return hubs(index, 8).map((id) => index.byId.get(id)).filter((knoten) => knoten !== undefined);
		  }, [graph, index]);
		  const sichtbar = import_react2.useMemo(() => {
		    const begriff = suche.trim().toLowerCase();
		    const gesehen = new Set;
		    const liste = [];
		    for (const knoten of graph?.nodes ?? []) {
		      if (begriff.length > 0) {
		        const heu = `${knoten.label} ${knoten.kind ?? ""} ${knoten.path ?? ""}`.toLowerCase();
		        if (!heu.includes(begriff))
		          continue;
		      }
		      const schluessel = `${knoten.label}|${knoten.path ?? ""}`;
		      if (gesehen.has(schluessel))
		        continue;
		      gesehen.add(schluessel);
		      liste.push(knoten);
		      if (liste.length >= 300)
		        break;
		    }
		    return liste;
		  }, [graph, suche]);
		  const gewaehltKnoten = gewaehlt === null ? null : index.byId.get(gewaehlt) ?? null;
		  const gruppeAktuell = import_react2.useMemo(() => {
		    if (ebene !== "gruppe")
		      return null;
		    if (gruppe !== null)
		      return gruppe;
		    if (gewaehltKnoten?.community !== undefined)
		      return gewaehltKnoten.community;
		    return gemeinschaften.liste[0]?.id ?? null;
		  }, [ebene, gruppe, gewaehltKnoten, gemeinschaften]);
		  const ausschnitt = import_react2.useMemo(() => graph === null ? LEERER_AUSSCHNITT : ebene === "gesamt" ? schneideGesamt(graph, index, gemeinschaften, anzeige.grenze) : ebene === "gruppe" && gruppeAktuell !== null ? schneideGruppe(graph, index, gemeinschaften, gruppeAktuell, anzeige.grenze) : schneideAusschnitt(graph, index, gewaehlt, tiefe, anzeige.grenze), [graph, index, gemeinschaften, ebene, gruppeAktuell, gewaehlt, tiefe, anzeige.grenze]);
		  const nachbarn = import_react2.useMemo(() => {
		    if (gewaehlt === null)
		      return [];
		    const ids = index.neighbours.get(gewaehlt) ?? [];
		    const liste = [];
		    for (const id of ids.slice(0, 24)) {
		      const knoten = index.byId.get(id);
		      if (knoten !== undefined)
		        liste.push(knoten);
		    }
		    return liste;
		  }, [index, gewaehlt]);
		  const legende = import_react2.useMemo(() => {
		    const zaehler = new Map;
		    for (const knoten of ausschnitt.nodes) {
		      if (knoten.community === undefined)
		        continue;
		      const grad = index.degree.get(knoten.id) ?? 0;
		      const eintrag = zaehler.get(knoten.community);
		      if (eintrag === undefined) {
		        zaehler.set(knoten.community, { anzahl: 1, top: knoten.id, grad });
		      } else {
		        eintrag.anzahl += 1;
		        if (grad > eintrag.grad) {
		          eintrag.grad = grad;
		          eintrag.top = knoten.id;
		        }
		      }
		    }
		    return [...zaehler.entries()].sort((a, b) => b[1].anzahl - a[1].anzahl || a[0] - b[0]).slice(0, 6).map(([id, eintrag]) => ({
		      id,
		      anzahl: eintrag.anzahl,
		      top: eintrag.top,
		      farbe: farbeNachGruppe(id)
		    }));
		  }, [ausschnitt, index]);
		  import_react2.useEffect(() => {
		    if (datei === null)
		      setDateiGeaendert(false);
		  }, [datei]);
		  const waehle = (id) => {
		    if (dateiGeaendert && !window.confirm(t("discardConfirm")))
		      return;
		    setGewaehlt(id);
		    if (ebene === "gruppe") {
		      const eigene = gemeinschaften.nach.get(id);
		      if (eigene !== undefined && eigene !== gruppeAktuell)
		        setGruppe(eigene);
		    }
		  };
		  const wechsleEbene = (naechste) => {
		    if (naechste === "gruppe") {
		      setGruppe(gewaehltKnoten?.community ?? gemeinschaften.liste[0]?.id ?? null);
		    }
		    setEbene(naechste);
		  };
		  const oeffneLegende = (eintrag) => {
		    if (dateiGeaendert && !window.confirm(t("discardConfirm")))
		      return;
		    if (ebene === "gesamt") {
		      setGruppe(eintrag.id);
		      setEbene("gruppe");
		      setGewaehlt(eintrag.top);
		      return;
		    }
		    waehle(eintrag.top);
		  };
		  const schliessePanel = () => {
		    if (dateiGeaendert && !window.confirm(t("discardConfirm")))
		      return;
		    close?.();
		  };
		  const oeffneDatei = async (bearbeiten = false) => {
		    if (gewaehltKnoten?.path === undefined)
		      return;
		    setStartBearbeiten(bearbeiten);
		    setDateiLaden(true);
		    setDateiFehler(null);
		    try {
		      const antwort = await hole(`/api/world/graphify/file?path=${encodeURIComponent(gewaehltKnoten.path)}`);
		      setDatei(antwort);
		    } catch (problem) {
		      setDatei(null);
		      setDateiFehler(problem instanceof Error ? problem.message : String(problem));
		    } finally {
		      setDateiLaden(false);
		    }
		  };
		  const zeigtListe = anzeige.modus !== "graph";
		  const zeigtGraph = anzeige.modus !== "list";
		  const zeigtDetail = anzeige.inspektor !== "off";
		  return /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		    className: "pmh-gf",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsxs("header", {
		        className: "pmh-gf__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx(GraphifyIcon, {
		                size: 22
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                className: "pmh-gf__brandtext",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                    className: "pmh-gf__kicker",
		                    children: "CODE GRAPH"
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("h2", {
		                    className: "pmh-gf__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__actions",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                className: status?.available ? "pmh-gf__dot is-on" : "pmh-gf__dot"
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                className: "pmh-gf__state",
		                children: status?.available ? status.command : t("noCli")
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-gf__btn pmh-gf__btn--run",
		                type: "button",
		                onClick: () => void starte(),
		                disabled: lauf === "laeuft",
		                children: lauf === "laeuft" ? t("running") : t("run")
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-gf__btn",
		                type: "button",
		                onClick: () => setNeu((n) => n + 1),
		                disabled: laden,
		                children: t("refresh")
		              }),
		              close === undefined ? null : /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-gf__btn pmh-gf__btn--ghost",
		                type: "button",
		                onClick: schliessePanel,
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__stats",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: status?.nodes ?? graph?.nodes.length ?? 0
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("nodes")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: status?.edges ?? graph?.edges.length ?? 0
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("edges")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: gruppen.size
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("communities")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("div", {
		            className: "pmh-gf__pfad",
		            title: status?.graphFile,
		            children: status?.graphFile ?? "—"
		          })
		        ]
		      }),
		      ausgabe.length > 0 ? /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: lauf === "fehler" ? "pmh-gf__ausgabe is-fehler" : "pmh-gf__ausgabe",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("strong", {
		            children: t("output")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("pre", {
		            children: ausgabe.slice(0, 6000)
		          })
		        ]
		      }) : null,
		      setup !== null && setup.cli === null ? /* @__PURE__ */ jsx_runtime2.jsx(SetupBox, {
		        setup,
		        laeuft: setupLaeuft,
		        ausgabe: setupAusgabe,
		        onInstall: () => void installiere(),
		        onModus: (modus) => void setzeSetupModus(modus),
		        t
		      }) : null,
		      fehler !== null ? /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__fehler",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("strong", {
		            children: t("error")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("span", {
		            children: fehler
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		            className: "pmh-gf__btn",
		            type: "button",
		            onClick: () => setNeu((n) => n + 1),
		            children: t("retry")
		          })
		        ]
		      }) : (graph?.nodes.length ?? 0) === 0 ? /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__leerbox",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx(GraphifyIcon, {
		            size: 30
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("p", {
		            children: laden ? t("loading") : t("empty")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("code", {
		            children: t("hint")
		          })
		        ]
		      }) : /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__body",
		        "data-view": anzeige.modus,
		        "data-inspector": anzeige.inspektor,
		        children: [
		          zeigtListe ? /* @__PURE__ */ jsx_runtime2.jsxs("aside", {
		            className: "pmh-gf__list",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsxs("label", {
		                className: "pmh-gf__search",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx(SearchIcon, {}),
		                  /* @__PURE__ */ jsx_runtime2.jsx("input", {
		                    type: "search",
		                    value: suche,
		                    onChange: (event) => setSuche(event.target.value),
		                    placeholder: t("search"),
		                    "aria-label": t("search")
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                className: "pmh-gf__items",
		                children: sichtbar.map((knoten) => /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                  type: "button",
		                  className: knoten.id === gewaehlt ? "pmh-gf__item is-aktiv" : "pmh-gf__item",
		                  onClick: () => waehle(knoten.id),
		                  title: knoten.path ?? knoten.label,
		                  children: [
		                    /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                      className: "pmh-gf__itemname",
		                      children: knoten.label
		                    }),
		                    /* @__PURE__ */ jsx_runtime2.jsxs("span", {
		                      className: "pmh-gf__itemmeta",
		                      children: [
		                        knoten.kind ?? "—",
		                        " · ",
		                        index.degree.get(knoten.id) ?? 0
		                      ]
		                    })
		                  ]
		                }, knoten.id))
		              })
		            ]
		          }) : null,
		          zeigtGraph ? /* @__PURE__ */ jsx_runtime2.jsxs("section", {
		            className: "pmh-gf__stage",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                className: "pmh-gf__graphbar",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                    className: "pmh-gf__seg pmh-gf__seg--ebene",
		                    role: "group",
		                    "aria-label": t("level"),
		                    children: ["gesamt", "gruppe", "nachbarschaft"].map((wert) => /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                      type: "button",
		                      "aria-pressed": ebene === wert,
		                      title: wert === "gesamt" ? t("overviewHint") : wert === "gruppe" ? t("groupHint") : t("neighbourhoodHint"),
		                      onClick: () => wechsleEbene(wert),
		                      children: wert === "gesamt" ? t("overview") : wert === "gruppe" ? t("group") : t("neighbourhood")
		                    }, wert))
		                  }),
		                  ebene === "nachbarschaft" ? /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                    className: "pmh-gf__seg",
		                    role: "group",
		                    "aria-label": t("depth"),
		                    children: [1, 2, 3].map((wert) => /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                      type: "button",
		                      "aria-pressed": tiefe === wert,
		                      title: `${t("depth")} ${wert}`,
		                      onClick: () => setTiefe(wert),
		                      children: wert
		                    }, wert))
		                  }) : null,
		                  /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                    type: "button",
		                    className: beschriftungen ? "pmh-gf__toggle is-on" : "pmh-gf__toggle",
		                    "aria-pressed": beschriftungen,
		                    onClick: () => setBeschriftungen((alt) => !alt),
		                    children: t("labels")
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                    type: "button",
		                    className: bewegung ? "pmh-gf__toggle is-on" : "pmh-gf__toggle",
		                    "aria-pressed": bewegung,
		                    onClick: () => setBewegung((alt) => !alt),
		                    children: t("motion")
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsxs("label", {
		                    className: "pmh-gf__farbe",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                        children: t("colour")
		                      }),
		                      /* @__PURE__ */ jsx_runtime2.jsxs("select", {
		                        value: farbe,
		                        onChange: (event) => setFarbe(event.target.value === "kind" ? "kind" : "community"),
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsx("option", {
		                            value: "community",
		                            children: t("colourCommunity")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("option", {
		                            value: "kind",
		                            children: t("colourKind")
		                          })
		                        ]
		                      })
		                    ]
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                    type: "button",
		                    className: "pmh-gf__btn",
		                    onClick: () => setSeed((s) => s + 1),
		                    children: t("arrange")
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsxs("span", {
		                    className: "pmh-gf__graphmeta",
		                    children: [
		                      ebene === "gruppe" && gruppeAktuell !== null ? `${t("group")} ${gruppeAktuell} · ` : "",
		                      t("cut"),
		                      " ",
		                      ausschnitt.nodes.length,
		                      " ",
		                      t("of"),
		                      " ",
		                      index.byId.size,
		                      ausschnitt.gekuerzt ? ` · ${t("truncated")}` : ""
		                    ]
		                  })
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx(GraphCanvas, {
		                ausschnitt,
		                farbe,
		                beschriftungen,
		                bewegung,
		                gewaehlt,
		                onSelect: waehle,
		                seed,
		                t
		              }),
		              legende.length > 0 ? /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                className: "pmh-gf__legende",
		                "aria-label": t("legend"),
		                children: legende.map((eintrag) => /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                  type: "button",
		                  title: `${eintrag.anzahl} ${t("nodes")}`,
		                  onClick: () => oeffneLegende(eintrag),
		                  children: [
		                    /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                      className: "pmh-gf__legendenpunkt",
		                      style: { background: eintrag.farbe }
		                    }),
		                    "#",
		                    eintrag.id
		                  ]
		                }, eintrag.id))
		              }) : null
		            ]
		          }) : null,
		          zeigtDetail ? /* @__PURE__ */ jsx_runtime2.jsxs("aside", {
		            className: "pmh-gf__detail",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                className: "pmh-gf__hubs",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                    className: "pmh-gf__hubshead",
		                    children: t("hubs")
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                    className: "pmh-gf__hubsrow",
		                    children: hubsListe.map((knoten) => /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                      type: "button",
		                      className: knoten.id === gewaehlt ? "pmh-gf__hub is-aktiv" : "pmh-gf__hub",
		                      onClick: () => waehle(knoten.id),
		                      title: knoten.label,
		                      children: [
		                        /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                          children: knoten.label
		                        }),
		                        /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                          children: index.degree.get(knoten.id) ?? 0
		                        })
		                      ]
		                    }, knoten.id))
		                  })
		                ]
		              }),
		              gewaehltKnoten === null ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                className: "pmh-gf__leer",
		                children: t("select")
		              }) : /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                className: "pmh-gf__knoten",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                    className: "pmh-gf__knotenkopf",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                        className: "pmh-gf__knotenname",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsx("h3", {
		                            children: gewaehltKnoten.label
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("code", {
		                            children: gewaehltKnoten.id
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                        className: "pmh-gf__kopfright",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsxs("span", {
		                            className: "pmh-gf__badge",
		                            children: [
		                              t("degree"),
		                              " ",
		                              index.degree.get(gewaehltKnoten.id) ?? 0
		                            ]
		                          }),
		                          gewaehltKnoten.path !== undefined ? /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		                            children: [
		                              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                                className: "pmh-gf__btn pmh-gf__btn--file",
		                                type: "button",
		                                onClick: () => void oeffneDatei(),
		                                children: t("openFile")
		                              }),
		                              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                                className: "pmh-gf__btn",
		                                type: "button",
		                                onClick: () => void oeffneDatei(true),
		                                children: t("edit")
		                              })
		                            ]
		                          }) : null
		                        ]
		                      })
		                    ]
		                  }),
		                  dateiLaden ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                    className: "pmh-gf__leer",
		                    children: t("loadingFile")
		                  }) : dateiFehler !== null ? /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                    className: "pmh-gf__dateifehler",
		                    children: [
		                      /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                        children: t("fileError")
		                      }),
		                      /* @__PURE__ */ jsx_runtime2.jsx("code", {
		                        children: dateiFehler
		                      }),
		                      /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                        className: "pmh-gf__btn",
		                        type: "button",
		                        onClick: () => void oeffneDatei(),
		                        children: t("retry")
		                      })
		                    ]
		                  }) : datei !== null ? /* @__PURE__ */ jsx_runtime2.jsx(CodeView, {
		                    datei,
		                    startEdit: startBearbeiten,
		                    onClose: () => {
		                      setDatei(null);
		                      setStartBearbeiten(false);
		                    },
		                    onSaved: (neuerInhalt) => setDatei(neuerInhalt),
		                    onDirty: setDateiGeaendert,
		                    t
		                  }) : /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		                    children: [
		                      /* @__PURE__ */ jsx_runtime2.jsxs("dl", {
		                        className: "pmh-gf__daten",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                            children: [
		                              /* @__PURE__ */ jsx_runtime2.jsx("dt", {
		                                children: t("kind")
		                              }),
		                              /* @__PURE__ */ jsx_runtime2.jsx("dd", {
		                                children: gewaehltKnoten.kind ?? "—"
		                              })
		                            ]
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                            children: [
		                              /* @__PURE__ */ jsx_runtime2.jsx("dt", {
		                                children: t("path")
		                              }),
		                              /* @__PURE__ */ jsx_runtime2.jsx("dd", {
		                                children: gewaehltKnoten.path ?? "—"
		                              })
		                            ]
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                            children: [
		                              /* @__PURE__ */ jsx_runtime2.jsx("dt", {
		                                children: t("community")
		                              }),
		                              /* @__PURE__ */ jsx_runtime2.jsx("dd", {
		                                children: gewaehltKnoten.community ?? "—"
		                              })
		                            ]
		                          })
		                        ]
		                      }),
		                      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                        className: "pmh-gf__nachbarn",
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                            className: "pmh-gf__hubshead",
		                            children: t("degree")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                            className: "pmh-gf__chips",
		                            children: nachbarn.length === 0 ? /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                              className: "pmh-gf__leer",
		                              children: "—"
		                            }) : nachbarn.map((knoten) => /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                              type: "button",
		                              className: knoten.id === gewaehlt ? "pmh-gf__chip is-aktiv" : "pmh-gf__chip",
		                              onClick: () => waehle(knoten.id),
		                              title: knoten.path ?? knoten.label,
		                              children: knoten.label
		                            }, knoten.id))
		                          })
		                        ]
		                      })
		                    ]
		                  })
		                ]
		              })
		            ]
		          }) : null
		        ]
		      })
		    ]
		  });
		}
		function GraphifyItem({ view, t, form }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime2.jsx("span", {
		      children: t("panel")
		    });
		  return /* @__PURE__ */ jsx_runtime2.jsx(GraphifyPanel, {
		    t,
		    ...form === undefined ? {} : { form }
		  });
		}
		function escapeHtml(text) {
		  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		}
		function highlight(code, language) {
		  if (language === "markdown")
		    return escapeHtml(code);
		  const muster = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|class|interface|type|import|from|export|return|if|else|for|while|new|async|await|throw|try|catch|switch|case|break|continue|extends|implements|public|private|protected|readonly|static|this|true|false|null|undefined|void|number|string|boolean|in|of|as|default)\b|\b\d+(?:\.\d+)?\b/g;
		  let aus = "";
		  let letzte = 0;
		  let treffer;
		  while ((treffer = muster.exec(code)) !== null) {
		    aus += escapeHtml(code.slice(letzte, treffer.index));
		    const token = treffer[0];
		    const art = token.startsWith("//") || token.startsWith("/*") || token.startsWith("#") ? "kommentar" : /^["'`]/.test(token) ? "text" : /^\d/.test(token) ? "zahl" : "wort";
		    aus += `<span class="pmh-gf__tok-${art}">${escapeHtml(token)}</span>`;
		    letzte = treffer.index + token.length;
		  }
		  return aus + escapeHtml(code.slice(letzte));
		}
		function CodeView({
		  datei,
		  startEdit,
		  onClose,
		  onSaved,
		  onDirty,
		  t
		}) {
		  const [bearbeiten, setBearbeiten] = import_react2.useState(startEdit);
		  const [entwurf, setEntwurf] = import_react2.useState(datei.content);
		  const [speichert, setSpeichert] = import_react2.useState(false);
		  const [hinweis, setHinweis] = import_react2.useState(null);
		  import_react2.useEffect(() => {
		    setEntwurf(datei.content);
		    setBearbeiten(startEdit);
		    setHinweis(null);
		  }, [datei.path, startEdit]);
		  const anzahl = bearbeiten ? Math.max(1, entwurf.split(`
		`).length) : Math.max(1, datei.lines);
		  const zeilen = Array.from({ length: anzahl }, (_, index) => index + 1);
		  const geaendert = bearbeiten && entwurf !== datei.content;
		  import_react2.useEffect(() => {
		    onDirty(geaendert);
		  }, [geaendert, onDirty]);
		  const verwerfen = () => {
		    setBearbeiten(false);
		    setEntwurf(datei.content);
		    setHinweis(null);
		  };
		  const schliesseDatei = () => {
		    if (geaendert && !window.confirm(t("discardConfirm")))
		      return;
		    onClose();
		  };
		  const speichere = async () => {
		    setSpeichert(true);
		    setHinweis(null);
		    try {
		      const antwort = await fetch("/api/world/graphify/file", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify({ path: datei.path, content: entwurf })
		      });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${antwort.status}`);
		      const daten = await antwort.json();
		      onSaved({ ...datei, content: entwurf, lines: daten.lines ?? anzahl });
		      setBearbeiten(false);
		      setHinweis(t("saved"));
		    } catch (problem) {
		      setHinweis(`${t("saveError")}: ${problem instanceof Error ? problem.message : String(problem)}`);
		    } finally {
		      setSpeichert(false);
		    }
		  };
		  return /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		    className: "pmh-gf__datei",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__dateikopf",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__dateiname",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                className: "pmh-gf__lang",
		                children: datei.language
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("code", {
		                children: datei.path
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsxs("span", {
		                className: "pmh-gf__zeilen",
		                children: [
		                  anzahl,
		                  " ",
		                  t("lines")
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-gf__dateiaktionen",
		            children: [
		              bearbeiten ? /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                    className: "pmh-gf__btn pmh-gf__btn--file",
		                    type: "button",
		                    onClick: () => void speichere(),
		                    disabled: speichert,
		                    children: speichert ? t("loadingFile") : t("save")
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                    className: "pmh-gf__btn",
		                    type: "button",
		                    onClick: verwerfen,
		                    children: t("discard")
		                  })
		                ]
		              }) : /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-gf__btn",
		                type: "button",
		                onClick: () => {
		                  setEntwurf(datei.content);
		                  setBearbeiten(true);
		                  setHinweis(null);
		                },
		                children: t("edit")
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-gf__btn",
		                type: "button",
		                onClick: schliesseDatei,
		                children: t("closeFile")
		              })
		            ]
		          })
		        ]
		      }),
		      bearbeiten ? /* @__PURE__ */ jsx_runtime2.jsx("textarea", {
		        className: "pmh-gf__editor",
		        value: entwurf,
		        onChange: (event) => setEntwurf(event.target.value),
		        onKeyDown: (event) => {
		          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
		            event.preventDefault();
		            speichere();
		          }
		        },
		        spellCheck: false,
		        "aria-label": t("edit")
		      }) : /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-gf__codewrap",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("div", {
		            className: "pmh-gf__gutter",
		            "aria-hidden": "true",
		            children: zeilen.map((nummer) => /* @__PURE__ */ jsx_runtime2.jsx("span", {
		              children: nummer
		            }, nummer))
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("pre", {
		            className: "pmh-gf__codepre",
		            children: /* @__PURE__ */ jsx_runtime2.jsx("code", {
		              dangerouslySetInnerHTML: { __html: highlight(datei.content, datei.language) }
		            })
		          })
		        ]
		      }),
		      hinweis !== null ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		        className: hinweis.startsWith(t("saveError")) ? "pmh-gf__hinweis is-fehler" : "pmh-gf__hinweis",
		        children: hinweis
		      }) : null
		    ]
		  });
		}
		function GraphifyIcon({ size = 20 }) {
		  return /* @__PURE__ */ jsx_runtime2.jsxs("svg", {
		    "aria-hidden": "true",
		    width: size,
		    height: size,
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.3",
		    strokeLinecap: "round",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M6 7.2 12 4l6 3.2M6 7.2v8.6L12 20l6-4.2V7.2M12 4v16",
		        opacity: ".55"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("circle", {
		        cx: "6",
		        cy: "7.2",
		        r: "2.1",
		        fill: "currentColor",
		        stroke: "none"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("circle", {
		        cx: "18",
		        cy: "7.2",
		        r: "2.1",
		        fill: "currentColor",
		        stroke: "none"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("circle", {
		        cx: "12",
		        cy: "20",
		        r: "2.1",
		        fill: "currentColor",
		        stroke: "none"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("circle", {
		        cx: "12",
		        cy: "4",
		        r: "1.3",
		        fill: "currentColor",
		        stroke: "none"
		      })
		    ]
		  });
		}
		function SearchIcon() {
		  return /* @__PURE__ */ jsx_runtime2.jsxs("svg", {
		    "aria-hidden": "true",
		    width: "14",
		    height: "14",
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.6",
		    strokeLinecap: "round",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsx("circle", {
		        cx: "10.5",
		        cy: "10.5",
		        r: "6.5"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "m15.5 15.5 4.5 4.5"
		      })
		    ]
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhGraphify = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "graphify: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  let eintrag;
		  const einstellungen = () => {
		    eintrag ??= ctx.configForms.get(ENTRY_ID);
		    return eintrag;
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close, form: einstellungen() })
		    }, GraphifyPanel);
		  });
		  ctx.effect(() => {
		    const form = einstellungen();
		    let abgemeldet = [];
		    let zuletzt = "";
		    const anmelden = () => {
		      const anzeige = liesAnsicht(form.getSnapshot().value);
		      const schluessel = JSON.stringify({
		        oberflaeche: anzeige.oberflaeche,
		        reihenfolge: anzeige.reihenfolge,
		        beschriftung: anzeige.beschriftung
		      });
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
		        }, GraphifyIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS,
		          inject: () => ({ form: einstellungen() })
		        }, GraphifyItem)));
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
		  }, "graphify: Anzeige nach den Einstellungen");
		}
		var CSS = `
		.pmh-gf,.pmh-gf *{box-sizing:border-box}
		.pmh-gf{
		  display:flex;flex-direction:column;height:100%;width:100%;max-width:100%;min-width:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 10% 0%,#0d1a1b 0%,#080d10 55%,#07090b 100%);
		  color:#e9f3f0;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-gf__head{display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-gf__brand{display:flex;align-items:center;gap:11px;color:#8fe3c6}
		.pmh-gf__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-gf__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(143,227,198,.55)}
		.pmh-gf__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f0fbf7}
		.pmh-gf__actions{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap;justify-content:flex-end}
		.pmh-gf__dot{width:6px;height:6px;border-radius:50%;background:#5f8f80;box-shadow:0 0 0 4px rgba(95,143,128,.12)}
		.pmh-gf__dot.is-on{background:#58e0ae;box-shadow:0 0 0 4px rgba(88,224,174,.12)}
		.pmh-gf__state{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.5);white-space:nowrap}
		.pmh-gf__btn{
		  appearance:none;border:1px solid rgba(143,227,198,.2);background:rgba(14,30,28,.55);
		  color:#e6f7f1;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  cursor:pointer;transition:border-color .18s ease,background .18s ease;
		}
		.pmh-gf__btn:hover:not(:disabled){border-color:rgba(143,227,198,.6);background:rgba(24,48,44,.7)}
		.pmh-gf__btn:disabled{opacity:.45;cursor:default}
		.pmh-gf__btn--run{background:rgba(88,224,174,.14);border-color:rgba(88,224,174,.35);color:#c8ffe9}
		.pmh-gf__btn--ghost{border-color:transparent;background:transparent;color:rgba(233,243,240,.6)}
		.pmh-gf__stats{display:flex;align-items:center;flex-wrap:wrap;gap:12px 22px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
		.pmh-gf__stat{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
		.pmh-gf__stat b{font:600 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f2fff9}
		.pmh-gf__stat span{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.48);letter-spacing:.04em}
		.pmh-gf__pfad{margin-left:auto;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.5)}
		.pmh-gf__ausgabe{margin:12px 20px 0;padding:10px 12px;border:1px solid rgba(143,227,198,.18);border-radius:9px;background:rgba(8,18,16,.65);font:10.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.7)}
		.pmh-gf__ausgabe.is-fehler{border-color:rgba(255,120,120,.28);background:rgba(45,16,20,.45);color:#ffdada}
		.pmh-gf__ausgabe strong{display:block;margin-bottom:5px;color:rgba(143,227,198,.75);font-weight:600;letter-spacing:.08em}
		.pmh-gf__ausgabe pre{margin:0;max-height:160px;overflow:auto;white-space:pre-wrap}
		.pmh-gf__fehler{display:flex;align-items:center;gap:12px;margin:18px 20px;padding:12px 14px;border:1px solid rgba(255,120,120,.25);border-radius:10px;background:rgba(60,20,30,.35);color:#ffd9d9}
		.pmh-gf__body{display:grid;flex:1;min-width:0;width:100%;min-height:0;grid-template-rows:minmax(0,1fr)}
		.pmh-gf__body[data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr) minmax(280px,330px);grid-template-areas:"list stage detail"}
		.pmh-gf__body[data-view="graph"]{grid-template-columns:minmax(0,1fr) minmax(280px,340px);grid-template-areas:"stage detail"}
		.pmh-gf__body[data-view="list"]{grid-template-columns:minmax(220px,300px) minmax(0,1fr);grid-template-areas:"list detail"}
		.pmh-gf__body[data-inspector="off"][data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr);grid-template-areas:"list stage"}
		.pmh-gf__body[data-inspector="off"][data-view="graph"]{grid-template-columns:minmax(0,1fr);grid-template-areas:"stage"}
		.pmh-gf__body[data-inspector="off"][data-view="list"]{grid-template-columns:minmax(0,1fr);grid-template-areas:"list"}
		.pmh-gf__body[data-inspector="below"][data-view="split"]{grid-template-columns:minmax(210px,260px) minmax(0,1fr);grid-template-rows:minmax(220px,1fr) auto;grid-template-areas:"list stage" "detail detail"}
		.pmh-gf__body[data-inspector="below"][data-view="graph"]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(220px,1fr) auto;grid-template-areas:"stage" "detail"}
		.pmh-gf__body[data-inspector="below"][data-view="list"]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(200px,1fr) auto;grid-template-areas:"list" "detail"}
		.pmh-gf__list{grid-area:list;display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.06)}
		.pmh-gf__search{display:flex;align-items:center;gap:8px;margin:12px 12px 8px;padding:7px 9px;border:1px solid rgba(143,227,198,.16);border-radius:8px;color:rgba(233,243,240,.5);background:rgba(6,14,12,.5)}
		.pmh-gf__search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#e9f3f0;font:12px/1.3 "Segoe UI", system-ui, sans-serif}
		.pmh-gf__search input::placeholder{color:rgba(233,243,240,.35)}
		.pmh-gf__items{flex:1;min-height:0;overflow:auto;padding:2px 8px 12px}
		.pmh-gf__item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:7px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:#dfeee8;cursor:pointer}
		.pmh-gf__item:hover{background:rgba(88,224,174,.06)}
		.pmh-gf__item.is-aktiv{background:rgba(88,224,174,.12);border-color:rgba(143,227,198,.22)}
		.pmh-gf__itemname{font-size:12.5px;font-weight:500;color:#f0fbf7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__itemmeta{font:10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.38);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__stage{grid-area:stage;display:flex;flex-direction:column;min-width:0;min-height:0;position:relative}
		.pmh-gf__graphbar{display:flex;align-items:center;gap:7px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap}
		.pmh-gf__seg{display:inline-flex;border:1px solid rgba(143,227,198,.2);border-radius:8px;overflow:hidden}
		.pmh-gf__seg button{appearance:none;border:0;background:rgba(14,30,28,.55);color:rgba(233,243,240,.6);width:26px;height:24px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer}
		.pmh-gf__seg button + button{border-left:1px solid rgba(143,227,198,.14)}
		.pmh-gf__seg button[aria-pressed="true"]{background:rgba(88,224,174,.18);color:#c8ffe9}
		.pmh-gf__seg--ebene button{width:auto;padding:0 9px}
		.pmh-gf__toggle{appearance:none;border:1px solid rgba(143,227,198,.18);background:rgba(14,30,28,.4);color:rgba(233,243,240,.62);border-radius:8px;padding:5px 9px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer}
		.pmh-gf__toggle.is-on{border-color:rgba(88,224,174,.45);background:rgba(88,224,174,.12);color:#c8ffe9}
		.pmh-gf__farbe{display:inline-flex;align-items:center;gap:6px;color:rgba(233,243,240,.5);font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace}
		.pmh-gf__farbe select{appearance:none;border:1px solid rgba(143,227,198,.18);background:rgba(8,18,16,.8);color:#dff7ee;border-radius:7px;padding:4px 8px;font:10.5px/1 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
		.pmh-gf__graphmeta{margin-left:auto;flex:1 1 150px;font:10px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.38);text-align:right;overflow-wrap:anywhere}
		.pmh-gf__leinwand{position:relative;flex:1;min-height:0}
		.pmh-gf__canvas{display:block;width:100%;height:100%;cursor:grab;touch-action:none}
		.pmh-gf__canvas:active{cursor:grabbing}
		.pmh-gf__leinwandleer{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;color:rgba(233,243,240,.42);font-size:12px;pointer-events:none}
		.pmh-gf__zoombar{position:absolute;right:10px;bottom:10px;display:flex;gap:4px;padding:4px;border:1px solid rgba(143,227,198,.16);border-radius:9px;background:rgba(6,14,12,.82);backdrop-filter:blur(6px)}
		.pmh-gf__zoombar button{appearance:none;border:0;background:transparent;color:rgba(233,243,240,.7);width:24px;height:24px;border-radius:6px;cursor:pointer;font:13px/1 ui-monospace, SFMono-Regular, Menlo, monospace}
		.pmh-gf__zoombar button:hover{background:rgba(88,224,174,.14);color:#c8ffe9}
		.pmh-gf__zoomwert{position:absolute;right:12px;bottom:44px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.55);pointer-events:none}
		.pmh-gf__legende{position:absolute;left:12px;bottom:12px;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid rgba(143,227,198,.12);border-radius:9px;background:rgba(6,14,12,.72);backdrop-filter:blur(6px)}
		.pmh-gf__legende button{display:flex;align-items:center;gap:6px;appearance:none;border:0;background:transparent;color:rgba(233,243,240,.58);font:9.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;padding:2px 4px;border-radius:5px;cursor:pointer}
		.pmh-gf__legende button:hover{background:rgba(88,224,174,.12);color:#dff7ee}
		.pmh-gf__legendenpunkt{width:8px;height:8px;border-radius:2px;flex:none}
		.pmh-gf__detail{grid-area:detail;min-height:0;overflow:auto;padding:16px 18px;border-left:1px solid rgba(255,255,255,.06)}
		.pmh-gf__body[data-inspector="below"] .pmh-gf__detail{border-left:0;border-top:1px solid rgba(255,255,255,.06);max-height:42vh}
		.pmh-gf__hubs{margin-bottom:18px}
		.pmh-gf__hubshead{display:block;margin-bottom:8px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.14em;text-transform:uppercase;color:rgba(143,227,198,.55)}
		.pmh-gf__hubsrow{display:flex;flex-wrap:wrap;gap:6px}
		.pmh-gf__hub{display:inline-flex;align-items:center;gap:7px;max-width:240px;border:1px solid rgba(143,227,198,.16);border-radius:999px;background:rgba(10,24,21,.5);color:#dff7ee;padding:5px 9px;font:11px/1.2 "Segoe UI", system-ui, sans-serif;cursor:pointer}
		.pmh-gf__hub:hover{border-color:rgba(143,227,198,.5)}
		.pmh-gf__hub.is-aktiv{border-color:rgba(88,224,174,.55);background:rgba(88,224,174,.14)}
		.pmh-gf__hub span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__hub b{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
		.pmh-gf__knotenkopf{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px;flex-wrap:wrap}
		.pmh-gf__knotenname{min-width:0}
		.pmh-gf__knotenkopf h3{margin:0 0 4px;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#f2fff9;word-break:break-word}
		.pmh-gf__knotenkopf code{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.6);word-break:break-all}
		.pmh-gf__badge{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.08em;color:rgba(143,227,198,.7);border:1px solid rgba(143,227,198,.18);border-radius:999px;padding:5px 8px;white-space:nowrap}
		.pmh-gf__daten{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 18px;padding:12px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.02)}
		.pmh-gf__daten div{min-width:0}
		.pmh-gf__daten dt{margin:0 0 3px;font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(233,243,240,.4)}
		.pmh-gf__daten dd{margin:0;font:11.5px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__chips{display:flex;flex-wrap:wrap;gap:5px}
		.pmh-gf__chip{appearance:none;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:4px 8px;font:10.5px/1.2 "Segoe UI", system-ui, sans-serif;color:rgba(233,243,240,.65);background:rgba(255,255,255,.02);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__chip:hover{border-color:rgba(143,227,198,.45);color:#dff7ee}
		.pmh-gf__chip.is-aktiv{border-color:rgba(88,224,174,.5);background:rgba(88,224,174,.12);color:#c8ffe9}
		.pmh-gf__leerbox{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;flex:1;color:rgba(233,243,240,.45);padding:40px 20px}
		.pmh-gf__leerbox p{margin:0;font-size:12px}
		.pmh-gf__leerbox code{font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.65);border:1px solid rgba(143,227,198,.14);border-radius:7px;padding:6px 9px;background:rgba(8,18,16,.6)}
		.pmh-gf__kopfright{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
		.pmh-gf__btn--file{border-color:rgba(143,227,198,.35);background:rgba(88,224,174,.1);color:#c8ffe9}
		.pmh-gf__datei{margin-top:2px}
		.pmh-gf__dateikopf{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:10px;padding:9px 11px;border:1px solid rgba(143,227,198,.16);border-radius:9px;background:rgba(8,18,16,.55)}
		.pmh-gf__dateiname{display:flex;align-items:center;gap:9px;min-width:0;flex-wrap:wrap}
		.pmh-gf__dateiname code{font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-gf__lang{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.1em;text-transform:uppercase;color:#8fe3c6;border:1px solid rgba(143,227,198,.25);border-radius:4px;padding:4px 6px}
		.pmh-gf__zeilen{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.4)}
		.pmh-gf__codewrap{display:grid;grid-template-columns:auto minmax(0,1fr);max-height:58vh;overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(4,10,9,.78)}
		.pmh-gf__gutter{position:sticky;left:0;display:flex;flex-direction:column;padding:12px 9px 12px 12px;border-right:1px solid rgba(255,255,255,.06);background:rgba(6,14,12,.9);text-align:right;user-select:none;font:11px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(143,227,198,.28)}
		.pmh-gf__codepre{margin:0;padding:12px 16px 12px 12px;font:11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.82);white-space:pre;tab-size:2}
		.pmh-gf__tok-kommentar{color:#6e8f86;font-style:italic}
		.pmh-gf__tok-text{color:#e4c88f}
		.pmh-gf__tok-zahl{color:#a8c7ff}
		.pmh-gf__tok-wort{color:#8fe3c6}
		.pmh-gf__dateiaktionen{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
		.pmh-gf__editor{display:block;width:100%;min-height:56vh;resize:vertical;border:1px solid rgba(143,227,198,.2);border-radius:10px;background:rgba(4,10,9,.78);color:rgba(233,243,240,.9);padding:13px 16px;font:11.5px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none;tab-size:2}
		.pmh-gf__editor:focus{border-color:rgba(143,227,198,.55);box-shadow:0 0 0 3px rgba(88,224,174,.08)}
		.pmh-gf__hinweis{margin:10px 0 0;font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
		.pmh-gf__hinweis.is-fehler{color:#ffb4b4}
		.pmh-gf__dateifehler{margin:10px 0;padding:12px;border:1px solid rgba(255,120,120,.25);border-radius:9px;background:rgba(45,16,20,.35);color:#ffdada;font-size:12px}
		.pmh-gf__dateifehler code{display:block;margin:6px 0 10px;font:10.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,218,218,.7)}
		.pmh-gf__leer{margin:14px 0;color:rgba(233,243,240,.42);font-size:12px}
		.pmh-gf__setup{margin:12px 20px 0;padding:12px 14px;border:1px solid rgba(232,178,74,.3);border-radius:10px;background:rgba(48,36,12,.32);display:flex;flex-direction:column;gap:9px}
		.pmh-gf__setupkopf{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;color:#f4e3bb}
		.pmh-gf__setupkopf b{font-size:12.5px}
		.pmh-gf__setupkopf span{font-size:11.5px;color:rgba(244,227,187,.68)}
		.pmh-gf__setupzeile{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
		.pmh-gf__setupweg{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.65)}
		.pmh-gf__setupweg code{color:#ffd98a}
		.pmh-gf__setupauto{display:inline-flex;align-items:center;gap:6px;font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.7);cursor:pointer}
		.pmh-gf__setupauto input{accent-color:#e8b24a;margin:0}
		.pmh-gf__setuphilfe{margin:0;padding-left:18px;font:10.5px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(244,227,187,.62)}
		.pmh-gf__setupausgabe{margin:0;max-height:170px;overflow:auto;white-space:pre-wrap;font:10px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(233,243,240,.68);background:rgba(0,0,0,.28);border-radius:7px;padding:8px 10px}
		@media (max-width:1150px){
		  .pmh-gf__body[data-view="split"]{grid-template-columns:minmax(180px,210px) minmax(0,1fr) minmax(230px,270px)}
		  .pmh-gf__body[data-view="graph"]{grid-template-columns:minmax(0,1fr) minmax(230px,270px)}
		}
		@media (max-width:900px){
		  .pmh-gf__body[data-view]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(260px,1fr) auto;grid-template-areas:"stage" "detail"}
		  .pmh-gf__body[data-view="list"]{grid-template-areas:"list" "detail"}
		  .pmh-gf__body[data-view="split"]{grid-template-areas:"stage" "list" "detail"}
		  .pmh-gf__body[data-inspector="off"][data-view="split"]{grid-template-areas:"stage" "list"}
		  .pmh-gf__body[data-inspector="off"][data-view="graph"]{grid-template-areas:"stage"}
		  .pmh-gf__body[data-inspector="off"][data-view="list"]{grid-template-areas:"list"}
		  .pmh-gf__list{border-right:0;border-top:1px solid rgba(255,255,255,.06);max-height:38vh}
		  .pmh-gf__detail{border-left:0;max-height:44vh}
		  .pmh-gf__state{display:none}
		  .pmh-gf__pfad{max-width:100%;margin-left:0}
		  .pmh-gf__stats{flex-wrap:wrap;gap:12px 18px}
		  .pmh-gf__legende{display:none}
		}
		`;
		var PANEL_CSS = CSS;

		return module.exports;
	}
});
