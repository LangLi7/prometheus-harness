/**
 * Browser-Hälfte. ERZEUGT von `scripts/client-buendel.mjs`.
 * Nicht von Hand ändern: die Quelle ist `packages/client/media-preview/src/index.tsx`.
 *
 * Der Umschlag ist die Form des Kerns (`window.__ModuleLoader__.load`), gemessen an
 * `@deepseek-ai/dsh-client-locale/lib/client.js`.
 */
window.__ModuleLoader__.load({
	id: "@prometheus-harness/client-media-preview",
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

		// packages/client/media-preview/src/index.tsx
		var exports_src = {};
		__export(exports_src, {
		  MEDIA_BODY_ID: () => MEDIA_BODY_ID,
		  MediaBody: () => MediaBody,
		  apply: () => apply,
		  inject: () => inject
		});
		module.exports = __toCommonJS(exports_src);
		var import_react = require("react");

		// node_modules/@deepseek-ai/dsh-util-workspace-path/lib/index.js
		var FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		function isDriveSegment(segment) {
		  return segment !== undefined && /^[A-Za-z]:$/.test(segment);
		}
		function parseFileAddress(address) {
		  try {
		    if (!address.startsWith(FILE_ADDRESS_PREFIX))
		      return;
		    const end = address.search(/[?#]/);
		    const [scope, ...rest] = address.slice(20, end === -1 ? undefined : end).split("/");
		    if (scope === "session") {
		      const [id, ...segments] = rest;
		      if (id === undefined || id === "" || segments.length === 0)
		        return;
		      return {
		        scope,
		        sessionId: decodeURIComponent(id),
		        path: segments.map(decodeURIComponent).join("/")
		      };
		    }
		    if (scope === "absolute") {
		      const unc = rest[0] === "" && rest.length > 1;
		      const segments = (unc ? rest.slice(1) : rest).map(decodeURIComponent);
		      if (segments.length === 0 || segments[0] === "")
		        return;
		      if (unc)
		        return {
		          scope,
		          path: `//${segments.join("/")}`
		        };
		      return {
		        scope,
		        path: isDriveSegment(segments[0]) ? segments.join("/") : `/${segments.join("/")}`
		      };
		    }
		    return;
		  } catch {
		    return;
		  }
		}

		// packages/client/media-preview/src/locales.ts
		var DE = {
		  title: "Medien",
		  loading: "Wird geladen…",
		  video: "Video: {name}",
		  audio: "Ton: {name}",
		  failed: 'Der Browser kann diese Datei nicht abspielen. Der Container ist gültig, der Codec darin nicht — „Öffnen mit" im Kopf der Vorschau hilft weiter.',
		  unsupported: "Diese Datei hat keine abspielbare Endung."
		};
		var EN = {
		  title: "Media",
		  loading: "Loading…",
		  video: "Video: {name}",
		  audio: "Audio: {name}",
		  failed: 'The browser cannot play this file. The container is fine, the codec inside is not — use "Open with" in the preview header.',
		  unsupported: "This file has no playable extension."
		};

		// packages/client/media-preview/src/media.ts
		var PLAYABLE = {
		  mp4: { kind: "video", mime: "video/mp4" },
		  m4v: { kind: "video", mime: "video/mp4" },
		  mov: { kind: "video", mime: "video/quicktime" },
		  webm: { kind: "video", mime: "video/webm" },
		  ogv: { kind: "video", mime: "video/ogg" },
		  mkv: { kind: "video", mime: "video/x-matroska" },
		  avi: { kind: "video", mime: "video/x-msvideo" },
		  wmv: { kind: "video", mime: "video/x-ms-wmv" },
		  flv: { kind: "video", mime: "video/x-flv" },
		  mp3: { kind: "audio", mime: "audio/mpeg" },
		  wav: { kind: "audio", mime: "audio/wav" },
		  flac: { kind: "audio", mime: "audio/flac" },
		  ogg: { kind: "audio", mime: "audio/ogg" },
		  oga: { kind: "audio", mime: "audio/ogg" },
		  opus: { kind: "audio", mime: "audio/ogg" },
		  m4a: { kind: "audio", mime: "audio/mp4" },
		  aac: { kind: "audio", mime: "audio/aac" },
		  wma: { kind: "audio", mime: "audio/x-ms-wma" }
		};
		var MEDIA_EXTENSIONS = Object.keys(PLAYABLE);
		function fileNameOf(path) {
		  const cut = path.search(/[?#]/u);
		  const plain = cut === -1 ? path : path.slice(0, cut);
		  const slash = Math.max(plain.lastIndexOf("/"), plain.lastIndexOf("\\"));
		  return plain.slice(slash + 1);
		}
		function mediaTypeOf(path) {
		  const name = fileNameOf(path).toLowerCase();
		  const dot = name.lastIndexOf(".");
		  if (dot <= 0 || dot === name.length - 1)
		    return;
		  return PLAYABLE[name.slice(dot + 1)];
		}

		// packages/client/media-preview/src/index.tsx
		var jsx_runtime = require("react/jsx-runtime");
		var NS = "mediaPreview";
		var MEDIA_BODY_ID = "@prometheus-harness/client-media-preview/media";
		var inject = ["slots", "locale", "documentPreviews"];
		var CSS = `
		.pmh-media{box-sizing:border-box;width:100%;min-width:100%;height:100%;min-height:100%;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto;font-family:var(--dsw-font,sans-serif)}
		.pmh-media__surface{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0}
		.pmh-media__video{max-width:100%;max-height:100%;width:auto;height:auto;border-radius:var(--dsw-radius-md);background:#000;display:block}
		.pmh-media__audio{width:100%;max-width:560px}
		.pmh-media__status{margin:0;padding:16px;max-width:44em;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1.5;text-align:center}
		`;
		function MediaBody(props) {
		  const { content, resourceAddress, t } = props;
		  const path = import_react.useMemo(() => parseFileAddress(resourceAddress)?.path ?? "", [resourceAddress]);
		  const media = mediaTypeOf(path);
		  const name = fileNameOf(path);
		  const data = content.kind === "bytes" ? content.data : undefined;
		  const [url, setUrl] = import_react.useState();
		  const [failed, setFailed] = import_react.useState(false);
		  import_react.useEffect(() => {
		    if (data === undefined || media === undefined) {
		      setUrl(undefined);
		      return;
		    }
		    const next = URL.createObjectURL(new Blob([data], { type: media.mime }));
		    setUrl(next);
		    setFailed(false);
		    return () => {
		      URL.revokeObjectURL(next);
		    };
		  }, [data, media?.mime]);
		  if (media === undefined) {
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-media pmh-media__status",
		      role: "alert",
		      children: t("unsupported")
		    });
		  }
		  if (failed) {
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-media pmh-media__status",
		      role: "alert",
		      children: t("failed")
		    });
		  }
		  if (url === undefined) {
		    return /* @__PURE__ */ jsx_runtime.jsx("p", {
		      className: "pmh-media pmh-media__status",
		      role: "status",
		      children: t("loading")
		    });
		  }
		  return /* @__PURE__ */ jsx_runtime.jsx("div", {
		    className: "pmh-media",
		    ref: props.scrollportRef,
		    children: /* @__PURE__ */ jsx_runtime.jsx("div", {
		      className: "pmh-media__surface",
		      children: media.kind === "video" ? /* @__PURE__ */ jsx_runtime.jsx("video", {
		        className: "pmh-media__video",
		        src: url,
		        controls: true,
		        playsInline: true,
		        preload: "metadata",
		        "aria-label": t("video", { name }),
		        onError: () => setFailed(true)
		      }) : /* @__PURE__ */ jsx_runtime.jsx("audio", {
		        className: "pmh-media__audio",
		        src: url,
		        controls: true,
		        preload: "metadata",
		        "aria-label": t("audio", { name }),
		        onError: () => setFailed(true)
		      })
		    })
		  });
		}
		function apply(ctx) {
		  const t = ctx.locale.bind(NS);
		  ctx.effect(() => ctx.locale.register(NS, "de", DE), "media-preview: Texte de");
		  ctx.effect(() => ctx.locale.register(NS, "en", EN), "media-preview: Texte en");
		  ctx.effect(() => {
		    const style = document.createElement("style");
		    style.dataset.pmhMediaPreview = "";
		    style.textContent = CSS;
		    document.head.append(style);
		    return () => style.remove();
		  }, "media-preview: Stil");
		  ctx.effect(() => ctx.documentPreviews.register({
		    id: MEDIA_BODY_ID,
		    extensions: MEDIA_EXTENSIONS,
		    binaryExtensions: MEDIA_EXTENSIONS,
		    title: () => t("title"),
		    loading: "bytes-complete",
		    wrap: false
		  }), "media-preview: Renderer");
		  ctx.slots.inject("sidebar.right.tab.document", () => ctx.slots.register({
		    name: "sidebar.right.tab.document",
		    key: MEDIA_BODY_ID,
		    locale: NS
		  }, MediaBody));
		}

		return module.exports;
	}
});
