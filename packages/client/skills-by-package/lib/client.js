window.__ModuleLoader__.load({
  id: "@prometheus-harness/client-skills-by-package",
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

// packages/client/skills-by-package/src/index.ts
var exports_src = {};
__export(exports_src, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(exports_src);

// packages/client/skills-by-package/src/register.ts
var COLLECTIONS = [
  {
    name: "flach",
    aliases: [
      "eigene",
      "lokal",
      "local"
    ],
    skills: [
      "academic-paper",
      "academic-paper-reviewer",
      "academic-pipeline",
      "agent-eval",
      "agent-reach",
      "analyzing-sbom-for-supply-chain-vulnerabilities",
      "analyzing-supply-chain-malware-artifacts",
      "architecture-decision-records",
      "building-detection-rules-with-sigma",
      "citation-management",
      "deep-research",
      "diagram-design",
      "eval-harness",
      "literature-review",
      "market-research-reports",
      "motion-design",
      "offensive-active-directory",
      "offensive-advanced-redteam",
      "offensive-ai-security",
      "offensive-anti-forensics",
      "offensive-api-abuse",
      "offensive-api-security",
      "offensive-basic-exploitation",
      "offensive-bluetooth-ble",
      "offensive-bluetooth-classic",
      "offensive-bug-identification",
      "offensive-business-logic",
      "offensive-c2-frameworks",
      "offensive-cicd-pipeline",
      "offensive-cicd-secrets",
      "offensive-cloud",
      "offensive-container-escape",
      "offensive-crash-analysis",
      "offensive-crypto-attacks",
      "offensive-data-exfiltration",
      "offensive-deauth-disassoc",
      "offensive-dependency-confusion",
      "offensive-deserialization",
      "offensive-edr-evasion",
      "offensive-evil-twin",
      "offensive-exploit-dev-course",
      "offensive-exploit-development",
      "offensive-fast-checking",
      "offensive-fuzzing",
      "offensive-fuzzing-course",
      "offensive-graphql",
      "offensive-idor",
      "offensive-initial-access",
      "offensive-iot",
      "offensive-jwt",
      "offensive-k8s-attacks",
      "offensive-keylogger-arch",
      "offensive-krack-fragattacks",
      "offensive-lateral-movement",
      "offensive-linux-privesc",
      "offensive-lorawan-sub-ghz",
      "offensive-mitigations",
      "offensive-mobile",
      "offensive-netexec",
      "offensive-network-attacks",
      "offensive-oauth",
      "offensive-open-redirect",
      "offensive-osint",
      "offensive-osint-methodology",
      "offensive-parameter-pollution",
      "offensive-persistence",
      "offensive-phishing",
      "offensive-race-condition",
      "offensive-reporting",
      "offensive-request-smuggling",
      "offensive-shellcode",
      "offensive-social-engineering",
      "offensive-ssrf",
      "offensive-ssti",
      "offensive-supply-chain",
      "offensive-tls-attacks",
      "offensive-toctou",
      "offensive-vuln-classes",
      "offensive-waf-bypass",
      "offensive-wifi",
      "offensive-wifi-recon",
      "offensive-windows-boundaries",
      "offensive-windows-mitigations",
      "offensive-windows-privesc",
      "offensive-wpa-enterprise",
      "offensive-wpa2-psk",
      "offensive-wpa3-sae",
      "offensive-wps",
      "offensive-xss",
      "offensive-xxe",
      "offensive-z-wave",
      "offensive-zigbee-thread-matter",
      "paper-lookup",
      "parallel-web",
      "peer-review",
      "sr-screener"
    ]
  },
  {
    name: "awesome-gamedev-agent-skills",
    aliases: [
      "gamedev",
      "game-dev",
      "awesome-gamedev",
      "games"
    ],
    skills: [
      "ai-behavior-trees-utility-ai",
      "audio-design",
      "bevy-ecs",
      "camera-systems",
      "card-game",
      "create-game-assets",
      "defold-core",
      "dialogue-systems",
      "ebitengine-game",
      "fps-shooter",
      "game-ai",
      "game-feel",
      "game-jam",
      "game-ui-ux",
      "godot-2d-movement",
      "godot-3d-essentials",
      "godot-animation",
      "godot-audio",
      "godot-csharp",
      "godot-export",
      "godot-gdscript",
      "godot-gdscript-headless-testing",
      "godot-multiplayer",
      "godot-nodes-scenes",
      "godot-physics",
      "godot-resources",
      "godot-shaders",
      "godot-signals-groups",
      "godot-tilemap",
      "godot-ui-control",
      "input-systems",
      "itch-publish",
      "level-design",
      "love2d-core",
      "performance-optimization",
      "phaser-arcade-physics",
      "phaser-core",
      "physics-tuning",
      "pixijs-rendering",
      "platformer",
      "procedural-gen",
      "prototype-fast",
      "puzzle",
      "pygame-core",
      "roblox-characters",
      "roblox-datastores",
      "roblox-luau",
      "roblox-networking",
      "roblox-physics",
      "roblox-studio-workflow",
      "roblox-ui",
      "roguelike",
      "router",
      "rpg",
      "save-systems",
      "shader-programming",
      "steam-publish",
      "survival-crafting",
      "threejs-gltf-loading",
      "threejs-materials-lighting",
      "threejs-scene-setup",
      "tower-defense",
      "unity-animation",
      "unity-build-pipeline",
      "unity-csharp-scripting",
      "unity-input-system",
      "unity-navmesh",
      "unity-physics",
      "unity-scriptableobjects",
      "unity-tilemap-2d",
      "unreal-behavior-trees",
      "unreal-blueprints",
      "unreal-cpp-gameplay",
      "unreal-enhanced-input",
      "unreal-niagara",
      "unreal-packaging",
      "visual-novel"
    ]
  },
  {
    name: "pstack",
    aliases: [
      "lauren-tan",
      "laurentan",
      "cursor-plugin"
    ],
    skills: [
      "architect",
      "arena",
      "automate-me",
      "benchmark-checklist",
      "blast-radius",
      "bro",
      "correct",
      "create-formal-verification-skill",
      "create-verification-skill",
      "figure-it-out",
      "how",
      "in-your-own-words",
      "interrogate",
      "ketchup",
      "ketchup-video",
      "maintain-formal-verification-skill",
      "maintain-verification-skill",
      "make-bot-ui",
      "no-comments",
      "poteto-help",
      "poteto-mode",
      "principle-attack-the-premise",
      "principle-boundary-discipline",
      "principle-build-the-lever",
      "principle-encode-lessons-in-structure",
      "principle-exhaust-the-design-space",
      "principle-experience-first",
      "principle-explain-the-number",
      "principle-fix-root-causes",
      "principle-foundational-thinking",
      "principle-guard-the-context-window",
      "principle-laziness-protocol",
      "principle-make-operations-idempotent",
      "principle-migrate-callers-then-delete-legacy-apis",
      "principle-minimize-reader-load",
      "principle-model-the-domain",
      "principle-never-block-on-the-human",
      "principle-outcome-oriented-execution",
      "principle-prove-it-works",
      "principle-redesign-from-first-principles",
      "principle-separate-before-serializing-shared-state",
      "principle-sequence-verifiable-units",
      "principle-subtract-before-you-add",
      "principle-test-behavior-not-implementation",
      "principle-type-system-discipline",
      "recall",
      "reflect",
      "reproduce-and-fix-issues",
      "setup-benny",
      "setup-pstack",
      "sharpen",
      "show-me-your-work",
      "statechart",
      "swarm",
      "tdd",
      "teach",
      "technical-writing",
      "triage-issue-reports",
      "typescript-best-practices",
      "unslop",
      "why"
    ]
  },
  {
    name: "iart-motion-skills",
    aliases: [
      "iart",
      "motion-skills",
      "motion"
    ],
    skills: [
      "60fps-animation",
      "accessible-animation",
      "ad-creative-video",
      "after-effects",
      "animated-infographic",
      "animation-principles",
      "ascii-animation",
      "audiogram",
      "beat-sync-editing",
      "brand-motion-guidelines",
      "caption-animation",
      "chart-animation",
      "client-revisions",
      "color-motion",
      "countdown-video",
      "creative-brief",
      "diagram-animation",
      "explainer-video",
      "generative-illustration",
      "glassmorphism",
      "gsap-web",
      "isometric-animation",
      "javascript-animation",
      "kinetic-typography",
      "launch-video",
      "logo-animation",
      "lottie-animation",
      "lower-thirds",
      "manim",
      "map-animation",
      "micro-interaction",
      "motion-art-direction",
      "motion-background",
      "motion-pricing",
      "page-transition-animation",
      "particle-system",
      "photo-slideshow",
      "presentation-video",
      "product-demo-video",
      "promo-video",
      "remotion-video",
      "shader-glsl",
      "short-form-video",
      "shot-composition",
      "soundtrack",
      "svg-animation",
      "talking-head",
      "talking-head-b-roll",
      "testimonial-video",
      "text-message-animation",
      "threejs-animation",
      "video-delivery-specs",
      "whiteboard-animation",
      "wrapped-video",
      "youtube-intro-outro"
    ]
  },
  {
    name: "ui-skills",
    aliases: [
      "ibelick",
      "uiskills",
      "ui-skills.com"
    ],
    skills: [
      "baseline-ui",
      "component-canvas",
      "create-canvas",
      "create-design-md",
      "fixing-accessibility",
      "fixing-metadata",
      "fixing-motion-performance",
      "improve-ui",
      "ui-skills-root"
    ]
  },
  {
    name: "ui-motion-picks",
    aliases: [
      "emilkowalski",
      "emil",
      "transitions-dev",
      "userinterface-wiki",
      "raphaelsalaja",
      "jakubantalik",
      "motion"
    ],
    skills: [
      "animate",
      "find-animation-opportunities",
      "improve-animations",
      "review-animations",
      "transitions-dev",
      "userinterface-wiki"
    ]
  },
  {
    name: "brag",
    aliases: [
      "latent-spaces",
      "launch-video",
      "launchfilm",
      "hyperframes"
    ],
    skills: [
      "brag",
      "brag-slim"
    ]
  },
  {
    name: "prompt-engineering-skill",
    aliases: [
      "prompt-engineering",
      "prompting",
      "ph-alves"
    ],
    skills: [
      "prompt-engineering"
    ]
  }
];
var TOTAL = 307;

// packages/client/skills-by-package/src/index.ts
var name = "skills-by-package";
var inject = ["inputTriggers", "commandUi", "conversation", "sessions", "remote.skills"];
function normalize(text) {
  return text.toLowerCase().replace(/[\s_./]+/g, "-");
}
function matchesCollection(collection, query) {
  const needles = [collection.name, ...collection.aliases].map(normalize);
  return needles.some((needle) => needle.startsWith(query) || needle.includes(query));
}
function replaceLeadingToken(draft, token) {
  const match = /^\s*\/[^\s]*/.exec(draft);
  if (match === null)
    return token;
  return token + draft.slice(match[0].length);
}
function apply(ctx) {
  const skills = ctx.remote.skills;
  const sessions = ctx.sessions;
  const cache = new Map;
  function catalog(sessionId) {
    const hit = cache.get(sessionId);
    if (hit !== undefined)
      return hit.promise;
    const abort = new AbortController;
    const promise = (async () => {
      if (sessions.binding(sessionId) === undefined) {
        throw new Error(`skill catalog requires a retained session "${sessionId}"`);
      }
      return sessions.using(sessionId, { source: "skillsByPackage", signal: abort.signal }, async (reference) => {
        abort.signal.throwIfAborted();
        const state = reference.binding.session.getSnapshot();
        if (state.openState !== "open")
          throw new Error(`session "${sessionId}" is not open`);
        const result = await skills.list({ sessionId }, abort.signal);
        abort.signal.throwIfAborted();
        if (!result.ok)
          throw new Error(`skills/list failed: ${result.error?.code}: ${result.error?.message}`);
        return result.value?.skills ?? [];
      });
    })();
    const entry = { promise, abort };
    cache.set(sessionId, entry);
    promise.catch(() => {
      if (cache.get(sessionId) === entry)
        cache.delete(sessionId);
    });
    return promise;
  }
  function collectionOf(skillName) {
    return COLLECTIONS.find((collection) => collection.skills.includes(skillName));
  }
  function collectionRow(collection) {
    const count = collection.skills.length;
    return {
      name: collection.name,
      label: collection.name,
      description: `${count} ${count === 1 ? "Fähigkeit" : "Fähigkeiten"} · Tab klappt die Sammlung auf`,
      icon: "folder",
      drill: true
    };
  }
  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: "/",
    name,
    order: 1,
    showGroupTitle: true,
    async candidates(session, request) {
      const query = normalize(request.query.trim());
      const treffer = COLLECTIONS.filter((collection) => matchesCollection(collection, query));
      if (query === "")
        return COLLECTIONS.map(collectionRow);
      if (treffer.length === 0)
        return [];
      let catalogSkills;
      try {
        catalogSkills = await catalog(session.sessionId);
      } catch (error) {
        console.error("[skills-by-package] catalog failed:", error);
        return [];
      }
      if (request.signal.aborted)
        return [];
      const vorhanden = new Set(catalogSkills.map((skill) => skill.name));
      return treffer.flatMap((collection) => collection.skills.filter((skillName) => vorhanden.has(skillName)).map((skillName) => {
        const skill = catalogSkills.find((entry) => entry.name === skillName);
        const description = skill?.description ?? "";
        return {
          name: skillName,
          label: skillName,
          description: skill?.modelInvocable === false ? `nur menschlich · ${description}` : description,
          section: collection.name
        };
      }));
    }
  }), "skills-by-package: source");
  ctx.effect(() => ctx.commandUi.register({
    name: "skills",
    label: () => "Fähigkeiten suchen",
    description: () => `Alle ${TOTAL} Fähigkeiten durchsuchen, nach Sammlung gruppiert`,
    available: () => true,
    ui: {
      kind: "popupSelect",
      searchMode: "substring",
      searchLabels: () => ({
        placeholder: "Fähigkeiten suchen…",
        empty: "Keine Fähigkeiten installiert",
        noResults: "Keine Fähigkeit paßt zu dieser Eingabe"
      }),
      async options(session, signal) {
        let catalogSkills;
        try {
          catalogSkills = await catalog(session.sessionId);
        } catch (error) {
          console.error("[skills-by-package] catalog failed:", error);
          return [];
        }
        if (signal.aborted)
          return [];
        const bekannt = new Map(catalogSkills.map((skill) => [skill.name, skill]));
        const rows = [];
        for (const collection of COLLECTIONS) {
          for (const skillName of collection.skills) {
            const skill = bekannt.get(skillName);
            if (skill === undefined)
              continue;
            rows.push({
              id: skillName,
              label: skillName,
              detail: skill.description ?? "",
              group: { name: collection.name, label: collection.name }
            });
            bekannt.delete(skillName);
          }
        }
        for (const [skillName, skill] of bekannt) {
          rows.push({
            id: skillName,
            label: skillName,
            detail: skill.description ?? ""
          });
        }
        return rows;
      },
      onSelect(option, session) {
        const binding = sessions.binding(session.sessionId);
        if (binding === undefined)
          return;
        const input = ctx.conversation.input.for(binding.ctx);
        input.setDraft(replaceLeadingToken(input.state.getSnapshot().draft, `/${option.id}`));
        input.focus();
      }
    }
  }), "skills-by-package: popup");
}

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
