/**
 * Browser-Hälfte. ERZEUGT von `packages/plugin/obsidian/build.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/plugin/obsidian/src/index.tsx`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/obsidian",
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

		// packages/plugin/obsidian/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  ENTRY_ID: () => ENTRY_ID,
		  ObsidianGem: () => ObsidianGem,
		  ObsidianIcon: () => ObsidianIcon,
		  ObsidianPanel: () => ObsidianPanel,
		  PANEL_ID: () => PANEL_ID,
		  TAB_ID: () => TAB_ID,
		  TAB_KIND: () => TAB_KIND,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react2 = require("react");

		// packages/plugin/obsidian/src/GraphView.tsx
		var import_react = require("react");

		// packages/plugin/obsidian/src/graph.ts
		var HOECHSTENS = 400;
		function baueAusschnitt(graph, mitte, tiefe = 1, hoechstens = HOECHSTENS) {
		  const notizen = graph.nodes.filter((knoten2) => knoten2.kind === "note");
		  const gesamt = notizen.length;
		  if (mitte === null || !notizen.some((knoten2) => knoten2.id === mitte)) {
		    return { knoten: [], kanten: [], gesamt, gekappt: false };
		  }
		  const nachbarn = new Map;
		  for (const kante of graph.edges) {
		    if (kante.from === kante.to)
		      continue;
		    const a = nachbarn.get(kante.from);
		    if (a === undefined)
		      nachbarn.set(kante.from, [kante.to]);
		    else
		      a.push(kante.to);
		    const b = nachbarn.get(kante.to);
		    if (b === undefined)
		      nachbarn.set(kante.to, [kante.from]);
		    else
		      b.push(kante.from);
		  }
		  const abstand = new Map([[mitte, 0]]);
		  const reihe = [mitte];
		  let gekappt = false;
		  while (reihe.length > 0) {
		    const hier = reihe.shift();
		    if (hier === undefined)
		      break;
		    const d = abstand.get(hier) ?? 0;
		    if (d >= tiefe)
		      continue;
		    for (const ziel of nachbarn.get(hier) ?? []) {
		      if (abstand.has(ziel))
		        continue;
		      if (abstand.size >= hoechstens) {
		        gekappt = true;
		        continue;
		      }
		      abstand.set(ziel, d + 1);
		      reihe.push(ziel);
		    }
		  }
		  const bekannt = new Map(notizen.map((knoten2) => [knoten2.id, knoten2]));
		  const kanten = graph.edges.filter((kante) => abstand.has(kante.from) && abstand.has(kante.to) && kante.from !== kante.to).map((kante) => ({ von: kante.from, nach: kante.to }));
		  const grad = new Map;
		  for (const kante of kanten) {
		    grad.set(kante.von, (grad.get(kante.von) ?? 0) + 1);
		    grad.set(kante.nach, (grad.get(kante.nach) ?? 0) + 1);
		  }
		  const knoten = [...abstand.entries()].map(([id, tiefe2]) => {
		    const quelle = bekannt.get(id);
		    return {
		      id,
		      label: quelle?.label ?? id,
		      path: quelle?.path ?? null,
		      grad: grad.get(id) ?? 0,
		      mitte: id === mitte,
		      tiefe: tiefe2
		    };
		  }).sort((a, b) => Number(b.mitte) - Number(a.mitte) || b.grad - a.grad || a.label.localeCompare(b.label, "de"));
		  return { knoten, kanten, gesamt, gekappt };
		}
		function nachbarschaft(graph, id) {
		  if (id === null)
		    return { eingehend: [], ausgehend: [] };
		  const bekannt = new Map(graph.nodes.map((knoten) => [knoten.id, knoten]));
		  const eingehend = new Set;
		  const ausgehend = new Set;
		  for (const kante of graph.edges) {
		    if (kante.to === id && kante.from !== id)
		      eingehend.add(kante.from);
		    if (kante.from === id && kante.to !== id)
		      ausgehend.add(kante.to);
		  }
		  const sammle = (ids) => [...ids].map((kennung) => bekannt.get(kennung)).filter((knoten) => knoten !== undefined).sort((a, b) => a.label.localeCompare(b.label, "de"));
		  return { eingehend: sammle(eingehend), ausgehend: sammle(ausgehend) };
		}
		function streuung(text) {
		  let h = 2166136261;
		  for (let i = 0;i < text.length; i += 1) {
		    h ^= text.charCodeAt(i);
		    h = Math.imul(h, 16777619) >>> 0;
		  }
		  return h / 4294967295;
		}
		var ABSTOSSUNG = 2600;
		var FEDER = 0.035;
		var RUHELAENGE = 70;
		var SCHWERKRAFT = 0.006;
		var DAEMPFUNG = 0.86;
		var MAX_TEMPO = 14;
		function starteLauf(ausschnitt, breite = 760, hoehe = 460) {
		  const mx = breite / 2;
		  const my = hoehe / 2;
		  const radius = Math.min(breite, hoehe) * 0.36;
		  const knoten = ausschnitt.knoten.map((knoten2) => {
		    const s = streuung(knoten2.id);
		    const winkel = s * Math.PI * 2;
		    const r = radius * (0.5 + 0.5 * streuung(`${knoten2.id}#`));
		    const x = knoten2.mitte ? mx : mx + Math.cos(winkel) * r;
		    const y = knoten2.mitte ? my : my + Math.sin(winkel) * r;
		    return {
		      ...knoten2,
		      x,
		      y,
		      vx: 0,
		      vy: 0,
		      r: knoten2.mitte ? 9 : 3.5 + Math.min(6, Math.sqrt(knoten2.grad) * 1.6),
		      fest: knoten2.mitte
		    };
		  });
		  const index = new Map(knoten.map((k, i) => [k.id, i]));
		  const kanten = ausschnitt.kanten.map((kante) => ({ a: index.get(kante.von), b: index.get(kante.nach) })).filter((kante) => kante.a !== undefined && kante.b !== undefined);
		  return { knoten, kanten, breite, hoehe, ticks: 0 };
		}
		function schreibeSchritt(lauf) {
		  const { knoten, kanten, breite, hoehe } = lauf;
		  const n = knoten.length;
		  if (n === 0)
		    return;
		  const mx = breite / 2;
		  const my = hoehe / 2;
		  const fx = new Float64Array(n);
		  const fy = new Float64Array(n);
		  for (let i = 0;i < n; i += 1) {
		    const a = knoten[i];
		    if (a === undefined)
		      continue;
		    for (let j = i + 1;j < n; j += 1) {
		      const b = knoten[j];
		      if (b === undefined)
		        continue;
		      const dx = a.x - b.x;
		      const dy = a.y - b.y;
		      const d2 = dx * dx + dy * dy + 40;
		      const d = Math.sqrt(d2);
		      const kraft = ABSTOSSUNG / d2;
		      const ux = dx / d * kraft;
		      const uy = dy / d * kraft;
		      fx[i] += ux;
		      fy[i] += uy;
		      fx[j] -= ux;
		      fy[j] -= uy;
		    }
		  }
		  for (const kante of kanten) {
		    const a = knoten[kante.a];
		    const b = knoten[kante.b];
		    if (a === undefined || b === undefined)
		      continue;
		    const dx = b.x - a.x;
		    const dy = b.y - a.y;
		    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
		    const zug = (d - RUHELAENGE) * FEDER;
		    const ux = dx / d * zug;
		    const uy = dy / d * zug;
		    fx[kante.a] += ux;
		    fy[kante.a] += uy;
		    fx[kante.b] -= ux;
		    fy[kante.b] -= uy;
		  }
		  for (let i = 0;i < n; i += 1) {
		    const k = knoten[i];
		    if (k === undefined)
		      continue;
		    if (k.fest) {
		      k.vx = 0;
		      k.vy = 0;
		      continue;
		    }
		    fx[i] += (mx - k.x) * SCHWERKRAFT;
		    fy[i] += (my - k.y) * SCHWERKRAFT;
		    k.vx = (k.vx + fx[i]) * DAEMPFUNG;
		    k.vy = (k.vy + fy[i]) * DAEMPFUNG;
		    k.vx = Math.max(-MAX_TEMPO, Math.min(MAX_TEMPO, k.vx));
		    k.vy = Math.max(-MAX_TEMPO, Math.min(MAX_TEMPO, k.vy));
		    k.x += k.vx;
		    k.y += k.vy;
		    if (k.x < -40) {
		      k.x = -40;
		      k.vx = 0;
		    }
		    if (k.x > breite + 40) {
		      k.x = breite + 40;
		      k.vx = 0;
		    }
		    if (k.y < -40) {
		      k.y = -40;
		      k.vy = 0;
		    }
		    if (k.y > hoehe + 40) {
		      k.y = hoehe + 40;
		      k.vy = 0;
		    }
		  }
		  lauf.ticks += 1;
		}
		function istRuhig(lauf, grenze = 0.08) {
		  for (const k of lauf.knoten) {
		    if (k.fest)
		      continue;
		    if (Math.abs(k.vx) > grenze || Math.abs(k.vy) > grenze)
		      return false;
		  }
		  return true;
		}

		// packages/plugin/obsidian/src/GraphView.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var BREITE = 760;
		var HOEHE = 470;
		function GraphView({ graph, gewaehlt, onSelect, t }) {
		  const [weit, setWeit] = import_react.useState(false);
		  const [suche, setSuche] = import_react.useState("");
		  const leinwand = import_react.useRef(null);
		  const lauf = import_react.useRef(null);
		  const sicht = import_react.useRef({ k: 1, tx: 0, ty: 0 });
		  const ziehen = import_react.useRef(null);
		  const ueber = import_react.useRef(-1);
		  const schmutzig = import_react.useRef(true);
		  const mitte = import_react.useMemo(() => {
		    if (gewaehlt === null)
		      return null;
		    const treffer = graph.nodes.find((knoten) => knoten.path === gewaehlt || knoten.id === gewaehlt);
		    return treffer?.id ?? `obsidian:${gewaehlt}`;
		  }, [graph, gewaehlt]);
		  const ausschnitt = import_react.useMemo(() => baueAusschnitt(graph, mitte, weit ? Number.POSITIVE_INFINITY : 2), [graph, mitte, weit]);
		  const verweise = import_react.useMemo(() => nachbarschaft(graph, mitte), [graph, mitte]);
		  const trifft = import_react.useMemo(() => {
		    const begriff = suche.trim().toLowerCase();
		    if (begriff === "")
		      return null;
		    const treffer = new Set;
		    for (const knoten of ausschnitt.knoten) {
		      if (`${knoten.label} ${knoten.path ?? ""}`.toLowerCase().includes(begriff))
		        treffer.add(knoten.id);
		    }
		    return treffer;
		  }, [suche, ausschnitt]);
		  import_react.useEffect(() => {
		    lauf.current = starteLauf(ausschnitt, BREITE, HOEHE);
		    sicht.current = { k: 1, tx: 0, ty: 0 };
		    schmutzig.current = true;
		  }, [ausschnitt]);
		  import_react.useEffect(() => {
		    let raf = 0;
		    const zeichne = () => {
		      const canvas = leinwand.current;
		      const zustand = lauf.current;
		      if (canvas === null || zustand === null)
		        return;
		      const dpr = window.devicePixelRatio || 1;
		      const breite = canvas.clientWidth;
		      const hoehe = canvas.clientHeight;
		      if (breite === 0 || hoehe === 0)
		        return;
		      if (canvas.width !== Math.round(breite * dpr) || canvas.height !== Math.round(hoehe * dpr)) {
		        canvas.width = Math.round(breite * dpr);
		        canvas.height = Math.round(hoehe * dpr);
		      }
		      const ctx = canvas.getContext("2d");
		      if (ctx === null)
		        return;
		      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		      ctx.clearRect(0, 0, breite, hoehe);
		      const { k, tx, ty } = sicht.current;
		      ctx.save();
		      ctx.translate(tx, ty);
		      ctx.scale(k, k);
		      const fokus = ueber.current >= 0 ? zustand.knoten[ueber.current] : undefined;
		      const nachbar = new Set;
		      if (fokus !== undefined) {
		        for (const kante of zustand.kanten) {
		          const a = zustand.knoten[kante.a];
		          const b = zustand.knoten[kante.b];
		          if (a?.id === fokus.id && b !== undefined)
		            nachbar.add(b.id);
		          if (b?.id === fokus.id && a !== undefined)
		            nachbar.add(a.id);
		        }
		      }
		      for (const kante of zustand.kanten) {
		        const a = zustand.knoten[kante.a];
		        const b = zustand.knoten[kante.b];
		        if (a === undefined || b === undefined)
		          continue;
		        const aktiv = fokus !== undefined && (a.id === fokus.id || b.id === fokus.id);
		        const gedimmt = trifft !== null && !trifft.has(a.id) && !trifft.has(b.id) || fokus !== undefined && !aktiv;
		        ctx.strokeStyle = aktiv ? "rgba(196,175,255,0.75)" : gedimmt ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.13)";
		        ctx.lineWidth = (aktiv ? 1.5 : 0.8) / k;
		        ctx.beginPath();
		        ctx.moveTo(a.x, a.y);
		        ctx.lineTo(b.x, b.y);
		        ctx.stroke();
		      }
		      for (let i = 0;i < zustand.knoten.length; i += 1) {
		        const knoten = zustand.knoten[i];
		        if (knoten === undefined)
		          continue;
		        const gedimmt = trifft !== null && !trifft.has(knoten.id) || fokus !== undefined && knoten.id !== fokus.id && !nachbar.has(knoten.id);
		        const radius = knoten.r / Math.max(0.6, Math.sqrt(k));
		        ctx.beginPath();
		        ctx.arc(knoten.x, knoten.y, radius, 0, Math.PI * 2);
		        ctx.fillStyle = knoten.mitte ? "#c9b8ff" : gedimmt ? "rgba(190,190,210,0.18)" : fokus !== undefined && nachbar.has(knoten.id) ? "#e4dcff" : "rgba(200,200,220,0.62)";
		        ctx.fill();
		        if (knoten.mitte) {
		          ctx.strokeStyle = "#f2ecff";
		          ctx.lineWidth = 1.5 / k;
		          ctx.stroke();
		        }
		        const zeigeLabel = knoten.mitte || knoten.grad >= 4 || fokus?.id === knoten.id;
		        if (zeigeLabel && k > 0.55) {
		          const text = knoten.label.length > 28 ? `${knoten.label.slice(0, 27)}…` : knoten.label;
		          ctx.font = `${String(Math.round(11 / k))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
		          ctx.textAlign = "center";
		          ctx.fillStyle = gedimmt ? "rgba(236,238,248,0.18)" : "rgba(236,238,248,0.78)";
		          ctx.fillText(text, knoten.x, knoten.y + radius + 13 / k);
		        }
		      }
		      ctx.restore();
		    };
		    const schleife = () => {
		      const zustand = lauf.current;
		      if (zustand !== null && (!istRuhig(zustand) || ziehen.current !== null)) {
		        schreibeSchritt(zustand);
		        schmutzig.current = true;
		      }
		      if (schmutzig.current) {
		        zeichne();
		        schmutzig.current = false;
		      }
		      raf = requestAnimationFrame(schleife);
		    };
		    raf = requestAnimationFrame(schleife);
		    return () => cancelAnimationFrame(raf);
		  }, [trifft]);
		  const welt = (ereignis) => {
		    const canvas = leinwand.current;
		    if (canvas === null)
		      return { x: 0, y: 0 };
		    const kasten = canvas.getBoundingClientRect();
		    const { k, tx, ty } = sicht.current;
		    return { x: (ereignis.clientX - kasten.left - tx) / k, y: (ereignis.clientY - kasten.top - ty) / k };
		  };
		  const knotenUnter = (punkt) => {
		    const zustand = lauf.current;
		    if (zustand === null)
		      return -1;
		    for (let i = zustand.knoten.length - 1;i >= 0; i -= 1) {
		      const knoten = zustand.knoten[i];
		      if (knoten === undefined)
		        continue;
		      const dx = knoten.x - punkt.x;
		      const dy = knoten.y - punkt.y;
		      if (dx * dx + dy * dy <= (knoten.r + 6) ** 2)
		        return i;
		    }
		    return -1;
		  };
		  return /* @__PURE__ */ jsx_runtime.jsxs("div", {
		    className: "pmh-ob__graph",
		    children: [
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-ob__graphleiste",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: weit ? "pmh-ob__tool" : "pmh-ob__tool is-aktiv",
		            type: "button",
		            onClick: () => setWeit(false),
		            children: t("neighbourhood")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("button", {
		            className: weit ? "pmh-ob__tool is-aktiv" : "pmh-ob__tool",
		            type: "button",
		            onClick: () => setWeit(true),
		            children: t("wholeVault")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsx("input", {
		            className: "pmh-ob__graphsuche",
		            type: "search",
		            value: suche,
		            onChange: (ereignis) => setSuche(ereignis.target.value),
		            placeholder: t("search"),
		            "aria-label": t("search")
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("span", {
		            className: "pmh-ob__graphstand",
		            children: [
		              ausschnitt.knoten.length,
		              " / ",
		              ausschnitt.gesamt,
		              " ",
		              t("notes"),
		              ausschnitt.gekappt ? ` · ${t("truncated")}` : ""
		            ]
		          })
		        ]
		      }),
		      ausschnitt.knoten.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		        className: "pmh-ob__leer",
		        children: t("select")
		      }) : /* @__PURE__ */ jsx_runtime.jsx("canvas", {
		        ref: leinwand,
		        className: "pmh-ob__canvas",
		        role: "img",
		        "aria-label": t("graph"),
		        onPointerDown: (ereignis) => {
		          const punkt = welt(ereignis);
		          const index = knotenUnter(punkt);
		          ereignis.currentTarget.setPointerCapture?.(ereignis.pointerId);
		          if (index >= 0) {
		            const knoten = lauf.current?.knoten[index];
		            if (knoten !== undefined)
		              knoten.fest = true;
		            ziehen.current = { art: "knoten", index, x: punkt.x, y: punkt.y, bewegt: false };
		          } else {
		            ziehen.current = { art: "flaeche", index: -1, x: ereignis.clientX, y: ereignis.clientY, bewegt: false };
		          }
		          schmutzig.current = true;
		        },
		        onPointerMove: (ereignis) => {
		          const punkt = welt(ereignis);
		          const griff = ziehen.current;
		          if (griff !== null) {
		            griff.bewegt = true;
		            if (griff.art === "knoten") {
		              const knoten = lauf.current?.knoten[griff.index];
		              if (knoten !== undefined) {
		                knoten.x = punkt.x;
		                knoten.y = punkt.y;
		              }
		            } else {
		              sicht.current.tx += ereignis.clientX - griff.x;
		              sicht.current.ty += ereignis.clientY - griff.y;
		              griff.x = ereignis.clientX;
		              griff.y = ereignis.clientY;
		            }
		          } else {
		            ueber.current = knotenUnter(punkt);
		          }
		          schmutzig.current = true;
		        },
		        onPointerUp: (ereignis) => {
		          const griff = ziehen.current;
		          ziehen.current = null;
		          if (griff !== null && griff.art === "knoten") {
		            const knoten = lauf.current?.knoten[griff.index];
		            if (knoten !== undefined && !knoten.mitte)
		              knoten.fest = false;
		            if (!griff.bewegt) {
		              const pfad = knoten?.path;
		              if (pfad !== null && pfad !== undefined)
		                onSelect(pfad);
		            }
		          }
		          ereignis.currentTarget.releasePointerCapture?.(ereignis.pointerId);
		          schmutzig.current = true;
		        },
		        onPointerLeave: () => {
		          ueber.current = -1;
		          schmutzig.current = true;
		        },
		        onWheel: (ereignis) => {
		          const canvas = leinwand.current;
		          if (canvas === null)
		            return;
		          const kasten = canvas.getBoundingClientRect();
		          const sx = ereignis.clientX - kasten.left;
		          const sy = ereignis.clientY - kasten.top;
		          const alt = sicht.current.k;
		          const neu = Math.min(4, Math.max(0.25, alt * (ereignis.deltaY < 0 ? 1.12 : 0.89)));
		          sicht.current.tx = sx - (sx - sicht.current.tx) / alt * neu;
		          sicht.current.ty = sy - (sy - sicht.current.ty) / alt * neu;
		          sicht.current.k = neu;
		          schmutzig.current = true;
		        }
		      }),
		      /* @__PURE__ */ jsx_runtime.jsxs("div", {
		        className: "pmh-ob__verweise",
		        children: [
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("h4", {
		                children: [
		                  t("linksIn"),
		                  " ",
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-ob__zahl",
		                    children: verweise.eingehend.length
		                  })
		                ]
		              }),
		              verweise.eingehend.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-ob__leer",
		                children: t("none")
		              }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                children: verweise.eingehend.map((knoten) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		                  children: /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    onClick: () => knoten.path !== undefined && onSelect(knoten.path),
		                    title: knoten.path ?? knoten.label,
		                    children: knoten.label
		                  })
		                }, knoten.id))
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime.jsxs("section", {
		            children: [
		              /* @__PURE__ */ jsx_runtime.jsxs("h4", {
		                children: [
		                  t("linksOut"),
		                  " ",
		                  /* @__PURE__ */ jsx_runtime.jsx("span", {
		                    className: "pmh-ob__zahl",
		                    children: verweise.ausgehend.length
		                  })
		                ]
		              }),
		              verweise.ausgehend.length === 0 ? /* @__PURE__ */ jsx_runtime.jsx("p", {
		                className: "pmh-ob__leer",
		                children: t("none")
		              }) : /* @__PURE__ */ jsx_runtime.jsx("ul", {
		                children: verweise.ausgehend.map((knoten) => /* @__PURE__ */ jsx_runtime.jsx("li", {
		                  children: /* @__PURE__ */ jsx_runtime.jsx("button", {
		                    type: "button",
		                    onClick: () => knoten.path !== undefined && onSelect(knoten.path),
		                    title: knoten.path ?? knoten.label,
		                    children: knoten.label
		                  })
		                }, knoten.id))
		              })
		            ]
		          })
		        ]
		      })
		    ]
		  });
		}

		// packages/plugin/obsidian/src/index.tsx
		var jsx_runtime2 = require("react/jsx-runtime");
		var PANEL_ID = "obsidian";
		var ENTRY_ID = "pmh-obsidian";
		var NS = "obsidian";
		var STANDARD_REIHENFOLGE = 11;
		function liesAnzeige(config) {
		  const flaeche = config?.surface;
		  const oberflaeche = flaeche === "plugins" || flaeche === "both" || flaeche === "none" || flaeche === "sidebar" ? flaeche : "sidebar";
		  const platz = config?.order;
		  const reihenfolge = typeof platz === "number" && Number.isFinite(platz) ? platz : STANDARD_REIHENFOLGE;
		  const roh = config?.label;
		  const beschriftung = typeof roh === "string" && roh.trim() !== "" ? roh.trim() : undefined;
		  return { oberflaeche, reihenfolge, beschriftung };
		}
		var inject = ["slots", "locale", "layout", "configForms", "sidebarRight", "sidebarRightTabs"];
		var TAB_ID = "@prometheus-harness/obsidian";
		var TAB_KIND = "obsidian";
		async function hole(url) {
		  const antwort = await fetch(url, { headers: { accept: "application/json" } });
		  if (!antwort.ok)
		    throw new Error(`HTTP ${antwort.status}`);
		  return await antwort.json();
		}
		async function oeffneImProgramm(notiz) {
		  const antwort = await fetch("/api/world/obsidian/app/open", {
		    method: "POST",
		    headers: { "content-type": "application/json" },
		    body: JSON.stringify(notiz === undefined ? {} : { note: notiz })
		  });
		  const daten = await antwort.json().catch(() => ({}));
		  if (!antwort.ok)
		    throw new Error(daten.message ?? `HTTP ${antwort.status}`);
		  return daten.message ?? "";
		}
		function ObsidianPanel({ close, t }) {
		  const [status, setStatus] = import_react2.useState(null);
		  const [graph, setGraph] = import_react2.useState(null);
		  const [fehler, setFehler] = import_react2.useState(null);
		  const [laden, setLaden] = import_react2.useState(true);
		  const [neu, setNeu] = import_react2.useState(0);
		  const [suche, setSuche] = import_react2.useState("");
		  const [gewaehlt, setGewaehlt] = import_react2.useState(null);
		  const [inhalt, setInhalt] = import_react2.useState(null);
		  const [inhaltLaden, setInhaltLaden] = import_react2.useState(false);
		  const [inhaltFehler, setInhaltFehler] = import_react2.useState(null);
		  const [modus, setModus] = import_react2.useState("vorschau");
		  const [bearbeiten, setBearbeiten] = import_react2.useState(false);
		  const [entwurf, setEntwurf] = import_react2.useState("");
		  const [speichert, setSpeichert] = import_react2.useState(false);
		  const [hinweis, setHinweis] = import_react2.useState(null);
		  const [hinweisFehler, setHinweisFehler] = import_react2.useState(false);
		  const [app, setApp] = import_react2.useState(null);
		  const [vaultPfad, setVaultPfad] = import_react2.useState("");
		  const [waehlerLaeuft, setWaehlerLaeuft] = import_react2.useState(false);
		  const [oeffnet, setOeffnet] = import_react2.useState(false);
		  import_react2.useEffect(() => {
		    let ab = false;
		    setLaden(true);
		    setFehler(null);
		    Promise.all([
		      hole("/api/world/obsidian/status"),
		      hole("/api/world/obsidian/graph")
		    ]).then(([neuerStatus, neuerGraph]) => {
		      if (ab)
		        return;
		      setStatus(neuerStatus);
		      setGraph(neuerGraph);
		      const erste = neuerGraph.nodes.find((knoten) => knoten.kind === "note") ?? neuerGraph.nodes[0];
		      setGewaehlt((alt) => alt ?? erste?.path ?? erste?.id ?? null);
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
		  import_react2.useEffect(() => {
		    let ab = false;
		    hole("/api/world/obsidian/app").then((antwort) => {
		      if (!ab)
		        setApp(antwort);
		    }).catch(() => {
		      if (!ab)
		        setApp(null);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [neu]);
		  import_react2.useEffect(() => {
		    if (gewaehlt === null) {
		      setInhalt(null);
		      return;
		    }
		    let ab = false;
		    setInhaltLaden(true);
		    setInhaltFehler(null);
		    hole(`/api/world/obsidian/note?path=${encodeURIComponent(gewaehlt)}`).then((antwort) => {
		      if (!ab)
		        setInhalt(antwort.content);
		    }).catch((problem) => {
		      if (!ab) {
		        setInhalt(null);
		        setInhaltFehler(problem instanceof Error ? problem.message : String(problem));
		      }
		    }).finally(() => {
		      if (!ab)
		        setInhaltLaden(false);
		    });
		    return () => {
		      ab = true;
		    };
		  }, [gewaehlt]);
		  import_react2.useEffect(() => {
		    if (!bearbeiten)
		      setEntwurf(inhalt ?? "");
		  }, [inhalt, bearbeiten]);
		  import_react2.useEffect(() => {
		    setBearbeiten(false);
		    setHinweis(null);
		  }, [gewaehlt]);
		  const speichere = async () => {
		    if (gewaehlt === null)
		      return;
		    setSpeichert(true);
		    setHinweis(null);
		    try {
		      const antwort = await fetch("/api/world/obsidian/note", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify({ path: gewaehlt, content: entwurf })
		      });
		      if (!antwort.ok)
		        throw new Error(`HTTP ${antwort.status}`);
		      setInhalt(entwurf);
		      setBearbeiten(false);
		      setModus("vorschau");
		      setHinweis(t("saved"));
		      setHinweisFehler(false);
		    } catch (problem) {
		      setHinweis(`${t("saveError")}: ${problem instanceof Error ? problem.message : String(problem)}`);
		      setHinweisFehler(true);
		    } finally {
		      setSpeichert(false);
		    }
		  };
		  const setzeVault = async (anlegen) => {
		    const pfad = vaultPfad.trim();
		    if (pfad === "")
		      return;
		    setWaehlerLaeuft(true);
		    setHinweis(null);
		    setHinweisFehler(false);
		    try {
		      const antwort = await fetch("/api/world/obsidian/vault", {
		        method: "POST",
		        headers: { "content-type": "application/json" },
		        body: JSON.stringify(anlegen ? { path: pfad, anlegen: true } : { path: pfad })
		      });
		      const daten = await antwort.json().catch(() => ({}));
		      if (!antwort.ok)
		        throw new Error(daten.message ?? `HTTP ${antwort.status}`);
		      setNeu((n) => n + 1);
		    } catch (problem) {
		      setHinweis(`${t("vaultError")}: ${problem instanceof Error ? problem.message : String(problem)}`);
		      setHinweisFehler(true);
		    } finally {
		      setWaehlerLaeuft(false);
		    }
		  };
		  const oeffneInObsidian = async (notiz) => {
		    setOeffnet(true);
		    setHinweis(null);
		    setHinweisFehler(false);
		    try {
		      const meldung = await oeffneImProgramm(notiz ?? undefined);
		      setHinweis(meldung === "" ? t("opened") : meldung);
		    } catch (problem) {
		      setHinweis(`${t("openFailed")}: ${problem instanceof Error ? problem.message : String(problem)}`);
		      setHinweisFehler(true);
		    } finally {
		      setOeffnet(false);
		    }
		  };
		  const geaendert = bearbeiten && entwurf !== (inhalt ?? "");
		  const verwerfen = () => {
		    setBearbeiten(false);
		    setEntwurf(inhalt ?? "");
		    setHinweis(null);
		  };
		  const waehle = (ziel) => {
		    if (geaendert && !window.confirm(t("discardConfirm")))
		      return;
		    setGewaehlt(ziel);
		  };
		  const schliessePanel = () => {
		    if (geaendert && !window.confirm(t("discardConfirm")))
		      return;
		    close?.();
		  };
		  const notizen = (graph?.nodes ?? []).filter((knoten) => knoten.kind === "note");
		  const begriff = suche.trim().toLowerCase();
		  const sichtbar = begriff.length === 0 ? notizen : notizen.filter((knoten) => `${knoten.label} ${knoten.path ?? ""}`.toLowerCase().includes(begriff));
		  const gewaehlteNotiz = notizen.find((knoten) => (knoten.path ?? knoten.id) === gewaehlt) ?? null;
		  return /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		    className: "pmh-ob",
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsxs("header", {
		        className: "pmh-ob__head",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-ob__brand",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx(ObsidianIcon, {
		                size: 22
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                className: "pmh-ob__brandtext",
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                    className: "pmh-ob__kicker",
		                    children: "VAULT"
		                  }),
		                  /* @__PURE__ */ jsx_runtime2.jsx("h2", {
		                    className: "pmh-ob__title",
		                    children: t("title")
		                  })
		                ]
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-ob__actions",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                className: status?.available ? "pmh-ob__dot is-on" : "pmh-ob__dot"
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                className: "pmh-ob__state",
		                children: status?.available ? t("vault") : t("noVault")
		              }),
		              app?.verfuegbar === true && /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                className: "pmh-ob__btn pmh-ob__btn--app",
		                type: "button",
		                onClick: () => void oeffneInObsidian(),
		                disabled: oeffnet,
		                title: app.detail,
		                children: [
		                  /* @__PURE__ */ jsx_runtime2.jsx(ObsidianGem, {
		                    size: 13
		                  }),
		                  t("openInApp")
		                ]
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-ob__btn",
		                type: "button",
		                onClick: () => setNeu((n) => n + 1),
		                disabled: laden,
		                children: t("refresh")
		              }),
		              close !== undefined && /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                className: "pmh-ob__btn pmh-ob__btn--ghost",
		                type: "button",
		                onClick: schliessePanel,
		                children: t("close")
		              })
		            ]
		          })
		        ]
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-ob__stats",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-ob__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: status?.notes ?? "—"
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("notes")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-ob__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: status?.edges ?? "—"
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("edges")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		            className: "pmh-ob__stat",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsx("b", {
		                children: status?.openLinks ?? "—"
		              }),
		              /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                children: t("open")
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("div", {
		            className: "pmh-ob__pfad",
		            title: status?.vault ?? undefined,
		            children: status?.vault ?? status?.detail ?? "—"
		          })
		        ]
		      }),
		      status !== null && status.available === false ? /* @__PURE__ */ jsx_runtime2.jsxs("form", {
		        className: "pmh-ob__waehler",
		        onSubmit: (ereignis) => {
		          ereignis.preventDefault();
		          setzeVault(false);
		        },
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("label", {
		            htmlFor: "pmh-ob-vault",
		            children: t("vaultChoose")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("input", {
		            id: "pmh-ob-vault",
		            value: vaultPfad,
		            onChange: (ereignis) => setVaultPfad(ereignis.target.value),
		            placeholder: t("vaultPlaceholder"),
		            spellCheck: false
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		            className: "pmh-ob__btn",
		            type: "submit",
		            disabled: waehlerLaeuft || vaultPfad.trim() === "",
		            children: t("vaultUse")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		            className: "pmh-ob__btn pmh-ob__btn--app",
		            type: "button",
		            disabled: waehlerLaeuft || vaultPfad.trim() === "",
		            onClick: () => void setzeVault(true),
		            children: t("vaultCreate")
		          })
		        ]
		      }) : null,
		      fehler !== null ? /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-ob__fehler",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsx("strong", {
		            children: t("error")
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("span", {
		            children: fehler
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		            className: "pmh-ob__btn",
		            type: "button",
		            onClick: () => setNeu((n) => n + 1),
		            children: t("retry")
		          })
		        ]
		      }) : /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		        className: "pmh-ob__body",
		        children: [
		          /* @__PURE__ */ jsx_runtime2.jsxs("aside", {
		            className: "pmh-ob__list",
		            children: [
		              /* @__PURE__ */ jsx_runtime2.jsxs("label", {
		                className: "pmh-ob__search",
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
		                className: "pmh-ob__items",
		                children: laden && notizen.length === 0 ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                  className: "pmh-ob__leer",
		                  children: t("loading")
		                }) : sichtbar.length === 0 ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                  className: "pmh-ob__leer",
		                  children: begriff.length > 0 ? "—" : t("empty")
		                }) : sichtbar.map((knoten) => /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                  type: "button",
		                  className: (knoten.path ?? knoten.id) === gewaehlt ? "pmh-ob__item is-aktiv" : "pmh-ob__item",
		                  onClick: () => waehle(knoten.path ?? knoten.id),
		                  title: knoten.path ?? knoten.label,
		                  children: [
		                    /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                      className: "pmh-ob__itemname",
		                      children: knoten.label
		                    }),
		                    /* @__PURE__ */ jsx_runtime2.jsx("span", {
		                      className: "pmh-ob__itempfad",
		                      children: knoten.path ?? knoten.kind ?? ""
		                    })
		                  ]
		                }, knoten.id))
		              })
		            ]
		          }),
		          /* @__PURE__ */ jsx_runtime2.jsx("section", {
		            className: "pmh-ob__detail",
		            children: gewaehlteNotiz === null ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		              className: "pmh-ob__leer",
		              children: t("select")
		            }) : /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		              children: [
		                /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                  className: "pmh-ob__detailkopf",
		                  children: [
		                    /* @__PURE__ */ jsx_runtime2.jsxs("div", {
		                      children: [
		                        /* @__PURE__ */ jsx_runtime2.jsx("h3", {
		                          children: gewaehlteNotiz.label
		                        }),
		                        /* @__PURE__ */ jsx_runtime2.jsx("code", {
		                          children: gewaehlteNotiz.path ?? gewaehlteNotiz.id
		                        })
		                      ]
		                    }),
		                    /* @__PURE__ */ jsx_runtime2.jsx("div", {
		                      className: "pmh-ob__tools",
		                      role: "group",
		                      "aria-label": t("content"),
		                      children: bearbeiten ? /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: "pmh-ob__tool is-aktiv",
		                            type: "button",
		                            onClick: () => void speichere(),
		                            disabled: speichert,
		                            children: speichert ? t("loading") : t("save")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: "pmh-ob__tool",
		                            type: "button",
		                            onClick: verwerfen,
		                            children: t("discard")
		                          })
		                        ]
		                      }) : /* @__PURE__ */ jsx_runtime2.jsxs(jsx_runtime2.Fragment, {
		                        children: [
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: modus === "vorschau" ? "pmh-ob__tool is-aktiv" : "pmh-ob__tool",
		                            type: "button",
		                            onClick: () => setModus("vorschau"),
		                            children: t("preview")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: modus === "quelle" ? "pmh-ob__tool is-aktiv" : "pmh-ob__tool",
		                            type: "button",
		                            onClick: () => setModus("quelle"),
		                            children: t("source")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: modus === "graph" ? "pmh-ob__tool is-aktiv" : "pmh-ob__tool",
		                            type: "button",
		                            onClick: () => setModus("graph"),
		                            title: t("graphView"),
		                            children: t("graph")
		                          }),
		                          /* @__PURE__ */ jsx_runtime2.jsx("button", {
		                            className: "pmh-ob__tool",
		                            type: "button",
		                            onClick: () => {
		                              setEntwurf(inhalt ?? "");
		                              setBearbeiten(true);
		                              setHinweis(null);
		                            },
		                            children: t("edit")
		                          }),
		                          app?.verfuegbar === true && /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		                            className: "pmh-ob__tool pmh-ob__tool--app",
		                            type: "button",
		                            onClick: () => void oeffneInObsidian(gewaehlt),
		                            disabled: oeffnet,
		                            title: t("openNoteHint"),
		                            children: [
		                              /* @__PURE__ */ jsx_runtime2.jsx(ObsidianGem, {
		                                size: 11
		                              }),
		                              t("openNote")
		                            ]
		                          })
		                        ]
		                      })
		                    })
		                  ]
		                }),
		                inhaltLaden ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                  className: "pmh-ob__leer",
		                  children: t("loading")
		                }) : inhaltFehler !== null ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                  className: "pmh-ob__leer",
		                  children: inhaltFehler
		                }) : bearbeiten ? /* @__PURE__ */ jsx_runtime2.jsx("textarea", {
		                  className: "pmh-ob__editor",
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
		                }) : modus === "quelle" ? /* @__PURE__ */ jsx_runtime2.jsx("pre", {
		                  className: "pmh-ob__text",
		                  children: inhalt ?? ""
		                }) : modus === "graph" ? /* @__PURE__ */ jsx_runtime2.jsx(GraphView, {
		                  graph: graph ?? { nodes: [], edges: [] },
		                  gewaehlt,
		                  onSelect: waehle,
		                  t
		                }) : /* @__PURE__ */ jsx_runtime2.jsx(MarkdownView, {
		                  text: inhalt ?? ""
		                }),
		                hinweis !== null ? /* @__PURE__ */ jsx_runtime2.jsx("p", {
		                  className: hinweisFehler ? "pmh-ob__hinweis is-fehler" : "pmh-ob__hinweis",
		                  children: hinweis
		                }) : null
		              ]
		            })
		          })
		        ]
		      })
		    ]
		  });
		}
		function MarkdownView({ text }) {
		  const zeilen = text.split(/\r?\n/);
		  const bloecke = [];
		  let i = 0;
		  let key = 0;
		  while (i < zeilen.length) {
		    const zeile = zeilen[i] ?? "";
		    const kante = zeile.trim();
		    if (kante.length === 0) {
		      i += 1;
		      continue;
		    }
		    const zaun = /^```\s*([\w-]*)\s*$/.exec(zeile);
		    if (zaun) {
		      const sprache = zaun[1] ?? "";
		      const code = [];
		      i += 1;
		      while (i < zeilen.length && !/^```\s*$/.test(zeilen[i] ?? "")) {
		        code.push(zeilen[i] ?? "");
		        i += 1;
		      }
		      i += 1;
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("pre", {
		        className: "pmh-ob__mdcode",
		        "data-lang": sprache,
		        children: /* @__PURE__ */ jsx_runtime2.jsx("code", {
		          children: code.join(`
		`)
		        })
		      }, `code-${key++}`));
		      continue;
		    }
		    const kopf = /^(#{1,6})\s+(.*)$/.exec(zeile);
		    if (kopf) {
		      const stufe = Math.min(6, (kopf[1] ?? "#").length);
		      const Inhalt = `h${stufe}`;
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx(Inhalt, {
		        className: `pmh-ob__mdh pmh-ob__mdh${stufe}`,
		        children: inline(kopf[2] ?? "", `h-${key}`)
		      }, `h-${key++}`));
		      i += 1;
		      continue;
		    }
		    if (/^\s*[-*+]\s+/.test(zeile)) {
		      const punkte = [];
		      while (i < zeilen.length && /^\s*[-*+]\s+/.test(zeilen[i] ?? "")) {
		        punkte.push(/* @__PURE__ */ jsx_runtime2.jsx("li", {
		          children: inline((zeilen[i] ?? "").replace(/^\s*[-*+]\s+/, ""), `li-${key}`)
		        }, `li-${key++}`));
		        i += 1;
		      }
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("ul", {
		        className: "pmh-ob__mdliste",
		        children: punkte
		      }, `ul-${key++}`));
		      continue;
		    }
		    if (/^\s*\d+\.\s+/.test(zeile)) {
		      const punkte = [];
		      while (i < zeilen.length && /^\s*\d+\.\s+/.test(zeilen[i] ?? "")) {
		        punkte.push(/* @__PURE__ */ jsx_runtime2.jsx("li", {
		          children: inline((zeilen[i] ?? "").replace(/^\s*\d+\.\s+/, ""), `oli-${key}`)
		        }, `oli-${key++}`));
		        i += 1;
		      }
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("ol", {
		        className: "pmh-ob__mdliste",
		        children: punkte
		      }, `ol-${key++}`));
		      continue;
		    }
		    if (/^>\s?/.test(zeile)) {
		      const zitat = [];
		      while (i < zeilen.length && /^>\s?/.test(zeilen[i] ?? "")) {
		        zitat.push((zeilen[i] ?? "").replace(/^>\s?/, ""));
		        i += 1;
		      }
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("blockquote", {
		        className: "pmh-ob__mdzitat",
		        children: inline(zitat.join(" "), `q-${key}`)
		      }, `q-${key++}`));
		      continue;
		    }
		    if (/^(-{3,}|\*{3,}|_{3,})$/.test(kante)) {
		      bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("hr", {
		        className: "pmh-ob__mdhr"
		      }, `hr-${key++}`));
		      i += 1;
		      continue;
		    }
		    const absatz = [];
		    while (i < zeilen.length) {
		      const naechste = zeilen[i] ?? "";
		      if (naechste.trim().length === 0 || /^```/.test(naechste) || /^#{1,6}\s+/.test(naechste) || /^\s*[-*+]\s+/.test(naechste) || /^\s*\d+\.\s+/.test(naechste) || /^>\s?/.test(naechste) || /^(-{3,}|\*{3,}|_{3,})$/.test(naechste.trim())) {
		        break;
		      }
		      absatz.push(naechste);
		      i += 1;
		    }
		    bloecke.push(/* @__PURE__ */ jsx_runtime2.jsx("p", {
		      className: "pmh-ob__mdp",
		      children: inline(absatz.join(" "), `p-${key}`)
		    }, `p-${key++}`));
		  }
		  return /* @__PURE__ */ jsx_runtime2.jsx("div", {
		    className: "pmh-ob__md",
		    children: bloecke
		  });
		}
		function inline(text, keyBasis) {
		  const teile = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\[[^\]]+\]\]|\[[^\]]+\]\([^)]+\))/g);
		  const aus = [];
		  teile.forEach((teil, index) => {
		    if (teil.length === 0)
		      return;
		    const key = `${keyBasis}-${index}`;
		    if (teil.startsWith("**") && teil.endsWith("**")) {
		      aus.push(/* @__PURE__ */ jsx_runtime2.jsx("strong", {
		        children: teil.slice(2, -2)
		      }, key));
		    } else if (teil.startsWith("*") && teil.endsWith("*")) {
		      aus.push(/* @__PURE__ */ jsx_runtime2.jsx("em", {
		        children: teil.slice(1, -1)
		      }, key));
		    } else if (teil.startsWith("`") && teil.endsWith("`")) {
		      aus.push(/* @__PURE__ */ jsx_runtime2.jsx("code", {
		        className: "pmh-ob__mdc",
		        children: teil.slice(1, -1)
		      }, key));
		    } else if (teil.startsWith("[[") && teil.endsWith("]]")) {
		      const inner = teil.slice(2, -2);
		      const [ziel, name] = inner.split("|");
		      aus.push(/* @__PURE__ */ jsx_runtime2.jsx("span", {
		        className: "pmh-ob__wikilink",
		        title: ziel,
		        children: name ?? ziel
		      }, key));
		    } else if (/^\[[^\]]+\]\([^)]+\)$/.test(teil)) {
		      const treffer = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(teil);
		      if (treffer) {
		        aus.push(/* @__PURE__ */ jsx_runtime2.jsx("a", {
		          className: "pmh-ob__mdlink",
		          href: treffer[2],
		          target: "_blank",
		          rel: "noreferrer",
		          children: treffer[1]
		        }, key));
		      }
		    } else {
		      aus.push(teil);
		    }
		  });
		  return aus;
		}
		function ObsidianIcon({ size = 20 }) {
		  return /* @__PURE__ */ jsx_runtime2.jsxs("svg", {
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
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M5 4.5h11.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2Z"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M5 18a2 2 0 0 1 2-2h11.5"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M8 4.5v7l2-1.4 2 1.4v-7"
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
		function ObsidianGem({
		  size = 18,
		  className
		}) {
		  return /* @__PURE__ */ jsx_runtime2.jsxs("svg", {
		    "aria-hidden": "true",
		    width: size,
		    height: size,
		    viewBox: "0 0 24 24",
		    fill: "none",
		    stroke: "currentColor",
		    strokeWidth: "1.25",
		    strokeLinecap: "round",
		    strokeLinejoin: "round",
		    className,
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M12 2.6 4.6 9.4 8.1 19 12 21.4 15.9 19l3.5-9.6z"
		      }),
		      /* @__PURE__ */ jsx_runtime2.jsx("path", {
		        d: "M12 2.6 9.4 12.2 12 21.4l2.6-9.2z"
		      })
		    ]
		  });
		}
		function ObsidianSidebarAction({
		  wide,
		  t
		}) {
		  const [app, setApp] = import_react2.useState(null);
		  const [laeuft, setLaeuft] = import_react2.useState(false);
		  import_react2.useEffect(() => {
		    let ab = false;
		    hole("/api/world/obsidian/app").then((antwort) => {
		      if (!ab)
		        setApp(antwort);
		    }).catch(() => {
		      if (!ab)
		        setApp(null);
		    });
		    return () => {
		      ab = true;
		    };
		  }, []);
		  if (app?.verfuegbar !== true)
		    return null;
		  const klick = async () => {
		    setLaeuft(true);
		    try {
		      await oeffneImProgramm();
		    } catch {} finally {
		      setLaeuft(false);
		    }
		  };
		  return /* @__PURE__ */ jsx_runtime2.jsxs("button", {
		    className: wide ? "pmh-ob__rail is-weit" : "pmh-ob__rail",
		    type: "button",
		    onClick: () => void klick(),
		    disabled: laeuft,
		    title: app.detail,
		    "aria-label": t("openInApp"),
		    children: [
		      /* @__PURE__ */ jsx_runtime2.jsx(ObsidianGem, {
		        size: 18
		      }),
		      wide && /* @__PURE__ */ jsx_runtime2.jsx("span", {
		        className: "pmh-ob__railtext",
		        children: t("openInApp")
		      })
		    ]
		  });
		}
		function ObsidianTabBody({
		  useTabInfo,
		  t
		}) {
		  const { tab } = useTabInfo();
		  return /* @__PURE__ */ jsx_runtime2.jsx(ObsidianPanel, {
		    close: () => tab.actions.close(),
		    t
		  });
		}
		function ObsidianItem({ view, t }) {
		  if (view === "summary")
		    return /* @__PURE__ */ jsx_runtime2.jsx("span", {
		      className: "pmh-ob__badge",
		      children: t("panel")
		    });
		  return /* @__PURE__ */ jsx_runtime2.jsx(ObsidianPanel, {
		    t
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhObsidian = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "obsidian: Stil");
		  const close = () => {
		    ctx.layout.selectPanel(null);
		  };
		  ctx.slots.inject("main", function* () {
		    yield ctx.slots.register({
		      name: "main",
		      key: PANEL_ID,
		      locale: NS,
		      inject: () => ({ close })
		    }, ObsidianPanel);
		  });
		  ctx.effect(() => ctx.sidebarRightTabs.register({
		    id: TAB_ID,
		    kind: TAB_KIND,
		    priority: "extension",
		    title: () => t("title"),
		    guide: [
		      {
		        id: "vault",
		        order: 21,
		        title: () => t("title"),
		        description: () => t("guide"),
		        icon: ObsidianGem
		      }
		    ]
		  }), "obsidian: Tab-Typ im rechten Dock");
		  ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({ name: "sidebar.right.pane.tab", key: TAB_ID, locale: NS }, ObsidianTabBody)), "obsidian: Tab-Rumpf im rechten Dock");
		  ctx.effect(() => ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({ name: "sidebar.footer.action", id: "obsidian-app", order: 20, locale: NS }, ObsidianSidebarAction)), "obsidian: Programm-Aktion in der Seitenleiste");
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
		        }, ObsidianIcon)));
		      }
		      if (anzeige.oberflaeche === "plugins" || anzeige.oberflaeche === "both") {
		        abgemeldet.push(ctx.slots.inject("plugins.item", () => ctx.slots.register({
		          name: "plugins.item",
		          id: PANEL_ID,
		          order: anzeige.reihenfolge,
		          label: titel,
		          locale: NS
		        }, ObsidianItem)));
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
		  }, "obsidian: Anzeige nach den Einstellungen");
		}
		var CSS = `
		.pmh-ob{
		  display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden;
		  background:radial-gradient(120% 80% at 15% 0%,#12142a 0%,#090a12 55%,#07080d 100%);
		  color:#eceef8;font:13px/1.45 "Segoe UI", "SF Pro Text", system-ui, sans-serif;
		}
		.pmh-ob__head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
		.pmh-ob__brand{display:flex;align-items:center;gap:11px;color:#c9b8ff}
		.pmh-ob__brandtext{display:flex;flex-direction:column;gap:1px}
		.pmh-ob__kicker{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.16em;color:rgba(206,190,255,.55)}
		.pmh-ob__title{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;color:#f2f0ff}
		.pmh-ob__actions{display:flex;align-items:center;gap:9px;min-width:0}
		.pmh-ob__dot{width:6px;height:6px;border-radius:50%;background:#6b5a8f;box-shadow:0 0 0 4px rgba(107,90,143,.12)}
		.pmh-ob__dot.is-on{background:#69d6a3;box-shadow:0 0 0 4px rgba(105,214,163,.12)}
		.pmh-ob__state{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55);white-space:nowrap}
		.pmh-ob__btn{
		  appearance:none;border:1px solid rgba(180,170,230,.22);background:rgba(24,22,40,.6);
		  color:#e8e6fa;border-radius:8px;padding:6px 10px;font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  cursor:pointer;transition:border-color .18s ease,background .18s ease;
		}
		.pmh-ob__btn:hover:not(:disabled){border-color:rgba(190,170,255,.6);background:rgba(40,34,64,.75)}
		.pmh-ob__btn:disabled{opacity:.45;cursor:default}
		.pmh-ob__btn--ghost{border-color:transparent;background:transparent;color:rgba(230,232,248,.6)}
		.pmh-ob__stats{display:flex;align-items:center;gap:22px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06)}
		.pmh-ob__stat{display:flex;align-items:baseline;gap:6px;white-space:nowrap}
		.pmh-ob__stat b{font:600 15px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:#f4f2ff}
		.pmh-ob__stat span{font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.5);letter-spacing:.04em}
		.pmh-ob__pfad{margin-left:auto;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(206,190,255,.55)}
		.pmh-ob__fehler{display:flex;align-items:center;gap:12px;margin:18px 20px;padding:12px 14px;border:1px solid rgba(255,120,120,.25);border-radius:10px;background:rgba(60,20,30,.35);color:#ffd9d9}
		.pmh-ob__fehler span{font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(255,217,217,.75)}
		.pmh-ob__body{display:grid;grid-template-columns:minmax(220px,320px) minmax(0,1fr);flex:1;min-height:0}
		.pmh-ob__list{display:flex;flex-direction:column;min-height:0;border-right:1px solid rgba(255,255,255,.06)}
		.pmh-ob__search{display:flex;align-items:center;gap:8px;margin:12px 12px 8px;padding:7px 9px;border:1px solid rgba(180,170,230,.18);border-radius:8px;color:rgba(230,232,248,.5);background:rgba(10,10,18,.5)}
		.pmh-ob__search input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#eceef8;font:12px/1.3 "Segoe UI", system-ui, sans-serif}
		.pmh-ob__search input::placeholder{color:rgba(230,232,248,.35)}
		.pmh-ob__items{flex:1;min-height:0;overflow:auto;padding:2px 8px 12px}
		.pmh-ob__item{display:flex;flex-direction:column;gap:2px;width:100%;text-align:left;padding:8px 9px;border:1px solid transparent;border-radius:8px;background:transparent;color:#dfe1f0;cursor:pointer}
		.pmh-ob__item:hover{background:rgba(120,100,200,.08)}
		.pmh-ob__item.is-aktiv{background:rgba(120,100,220,.16);border-color:rgba(170,150,255,.22)}
		.pmh-ob__itemname{font-size:12.5px;font-weight:500;color:#f0eeff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-ob__itempfad{font:10px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.4);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-ob__detail{min-height:0;overflow:auto;padding:20px 22px}
		.pmh-ob__detailkopf{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}
		.pmh-ob__detailkopf h3{margin:0 0 4px;font-size:16px;font-weight:600;letter-spacing:-.01em;color:#f4f2ff}
		.pmh-ob__detailkopf code{font:10.5px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(206,190,255,.6)}
		.pmh-ob__badge{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;letter-spacing:.12em;color:rgba(206,190,255,.55);border:1px solid rgba(180,170,230,.18);border-radius:999px;padding:5px 8px}
		.pmh-ob__text{margin:0;white-space:pre-wrap;word-break:break-word;font:12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82);max-width:76ch}
		.pmh-ob__editor{display:block;width:100%;max-width:78ch;min-height:52vh;resize:vertical;border:1px solid rgba(180,170,230,.22);border-radius:9px;background:rgba(4,5,10,.72);color:rgba(236,238,248,.9);padding:13px 15px;font:12px/1.65 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
		.pmh-ob__editor:focus{border-color:rgba(190,170,255,.55);box-shadow:0 0 0 3px rgba(140,120,240,.1)}
		.pmh-ob__hinweis{margin:12px 0 0;font:11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#8fe3c6}
		.pmh-ob__hinweis.is-fehler{color:#ffb4b4}
		.pmh-ob__tools{display:inline-flex;gap:2px;padding:2px;border:1px solid rgba(180,170,230,.18);border-radius:8px;background:rgba(8,8,16,.45)}
		.pmh-ob__tool{appearance:none;border:0;border-radius:6px;background:transparent;color:rgba(230,232,248,.55);padding:5px 8px;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;cursor:pointer;transition:background .16s ease,color .16s ease}
		.pmh-ob__tool:hover{color:#f0eeff}
		.pmh-ob__tool.is-aktiv{background:rgba(140,120,240,.18);color:#f2f0ff}
		.pmh-ob__md{max-width:78ch;color:rgba(236,238,248,.86);font:13px/1.72 "Segoe UI", "SF Pro Text", system-ui, sans-serif}
		.pmh-ob__mdh{margin:22px 0 8px;font-weight:600;letter-spacing:-.015em;color:#f6f4ff;line-height:1.25}
		.pmh-ob__mdh1{font-size:24px;margin-top:4px}
		.pmh-ob__mdh2{font-size:19px}
		.pmh-ob__mdh3{font-size:16px}
		.pmh-ob__mdh4,.pmh-ob__mdh5,.pmh-ob__mdh6{font-size:13px;color:rgba(236,238,248,.7)}
		.pmh-ob__mdp{margin:0 0 13px}
		.pmh-ob__mdliste{margin:0 0 14px;padding-left:22px;display:flex;flex-direction:column;gap:4px}
		.pmh-ob__mdliste li{color:rgba(236,238,248,.84)}
		.pmh-ob__mdzitat{margin:0 0 14px;padding:8px 14px;border-left:2px solid rgba(180,150,255,.45);background:rgba(140,120,240,.06);color:rgba(236,238,248,.72);font-style:italic}
		.pmh-ob__mdhr{border:0;border-top:1px solid rgba(255,255,255,.08);margin:20px 0}
		.pmh-ob__mdcode{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(4,5,10,.7);overflow:auto}
		.pmh-ob__mdcode code{font:11.5px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(236,238,248,.82)}
		.pmh-ob__mdc{font:11.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;color:#d8c9ff;background:rgba(140,120,240,.12);border-radius:4px;padding:1px 4px}
		.pmh-ob__mdlink{color:#b9a8ff;text-decoration:none;border-bottom:1px solid rgba(185,168,255,.35)}
		.pmh-ob__mdlink:hover{border-bottom-color:#b9a8ff}
		.pmh-ob__wikilink{color:#d8c9ff;border-bottom:1px dashed rgba(216,201,255,.4);cursor:default}
		.pmh-ob__leer{margin:18px 0;color:rgba(230,232,248,.42);font-size:12px}
		.pmh-ob__btn--app{display:inline-flex;align-items:center;gap:6px;border-color:rgba(150,120,255,.42);color:#ded4ff}
		.pmh-ob__btn--app:hover:not(:disabled){border-color:rgba(180,150,255,.8);background:rgba(60,40,120,.4)}
		.pmh-ob__tool--app{display:inline-flex;align-items:center;gap:4px;color:#c9b8ff}
		.pmh-ob__tool--app:hover{color:#f0eaff}
		.pmh-ob__rail{
		  display:flex;align-items:center;justify-content:center;gap:7px;
		  border:1px solid transparent;background:transparent;color:rgba(230,232,248,.62);
		  border-radius:8px;padding:7px 9px;cursor:pointer;
		  font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
		  transition:color .16s ease,border-color .16s ease,background .16s ease;
		}
		.pmh-ob__rail:hover:not(:disabled){color:#e8e6fa;border-color:rgba(180,170,230,.22);background:rgba(24,22,40,.6)}
		.pmh-ob__rail:disabled{opacity:.45;cursor:default}
		.pmh-ob__rail.is-weit{justify-content:flex-start;width:100%}
		.pmh-ob__railtext{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
		.pmh-ob__graph{display:flex;flex-direction:column;gap:10px;min-height:0}
		.pmh-ob__graphleiste{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
		.pmh-ob__graphstand{margin-left:auto;font:10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.45)}
		.pmh-ob__waehler{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:12px 16px 0;padding:10px 12px;border:1px solid rgba(180,170,230,.2);border-radius:10px;background:rgba(18,16,30,.55)}
		.pmh-ob__waehler label{font:11px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55)}
		.pmh-ob__waehler input{flex:1;min-width:220px;border:1px solid rgba(180,170,230,.2);border-radius:8px;background:rgba(8,8,14,.65);color:#eceef8;padding:6px 9px;font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;outline:none}
		.pmh-ob__waehler input:focus{border-color:rgba(190,170,255,.55)}
		.pmh-ob__canvas{width:100%;height:470px;max-height:58vh;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:radial-gradient(120% 100% at 50% 0%,#0d0f1c 0%,#07080d 70%);cursor:grab;touch-action:none}
		.pmh-ob__canvas:active{cursor:grabbing}
		.pmh-ob__graphsuche{flex:1;min-width:120px;max-width:260px;border:1px solid rgba(180,170,230,.18);border-radius:8px;background:rgba(10,10,18,.5);color:#eceef8;padding:5px 8px;font:11px/1.3 "Segoe UI", system-ui, sans-serif;outline:none}
		.pmh-ob__graphsuche:focus{border-color:rgba(190,170,255,.55)}.pmh-ob__verweise{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:4px}
		.pmh-ob__verweise h4{margin:0 0 6px;font:11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.55);display:flex;gap:6px;align-items:baseline}
		.pmh-ob__verweise ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:180px;overflow:auto}
		.pmh-ob__verweise button{appearance:none;border:0;background:transparent;color:#c9b8ff;text-align:left;padding:2px 0;cursor:pointer;font:12px/1.4 "Segoe UI", system-ui, sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%}
		.pmh-ob__verweise button:hover{color:#f2f0ff;text-decoration:underline}
		.pmh-ob__zahl{font:9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;color:rgba(230,232,248,.35)}
		@media (max-width:760px){
		  .pmh-ob__body{grid-template-columns:1fr}
		  .pmh-ob__list{border-right:0;border-bottom:1px solid rgba(255,255,255,.06);max-height:42vh}
		  .pmh-ob__state{display:none}
		  .pmh-ob__pfad{max-width:100%;margin-left:0}
		  .pmh-ob__stats{flex-wrap:wrap;gap:12px 18px}
		}
		`;

		return module.exports;
	}
});
