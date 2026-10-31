/**
 * Language pack **English** — the default.
 *
 * The operator fixed the default: „englisch standard und deutsch unterstuetzen". This pack is
 * therefore not just another translation — it is the **reference**: `Locales.missing()` measures
 * every other pack against these keys.
 *
 * Flat keys, data only, no code. Adding a language means adding a file next to this one and
 * registering a plugin — the core never changes.
 */
import type { LocalePack } from '../i18n'

export const en: LocalePack = {
  id: 'en',
  label: 'English',
  english: 'English',
  messages: {
    // ── The island ───────────────────────────────────────────────────────────────────────
    /* Without pictograms — the pictograms are drawn. See `de.ts` for the reason. */
    'island.open': 'Open overview',
    'island.close': 'close',
    'island.group.places': 'places',
    'island.group.objects': 'objects',
    'island.group.views': 'views',
    'island.group.settings': 'settings',
    /* The panels are a group of the island — not a bar at the bottom. See `de.ts`. */
    'island.group.panels': 'panels',
    'island.panels.count': '{offen} of {gesamt} open',
    'island.panels.group.view': 'View',
    'island.panels.group.system': 'System',
    'island.panels.group.tools': 'Tools',
    'island.panels.group.more': 'More',
    'island.panel.viewbar': 'View bar',
    /* The view bar — ticks instead of buttons. See `de.ts`. */
    'view.controls.title': 'View',
    'view.controls.hide': 'Hide bar',
    'view.controls.zoom': 'zoom {wert}',
    'island.panel.open': 'open',
    'island.panel.closed': 'detached',
    'island.item.solar': 'Solar system',
    'island.item.stack': 'project stack',
    'island.item.prometheus': 'prometheus',
    'island.item.overview': 'cosmic overview',
    'island.item.sun': 'Sun',
    'island.item.earth': 'Earth',
    'island.item.appcss': 'app.css',
    'island.action.world': 'Universe',
    'island.action.chat': 'Chat',
    /* The same distinction as on the mark — see `de.ts` and `entry.ts`. */
    'island.action.harness': 'Prometheus chat',
    'island.action.reset': 'Reset view',
    'island.action.settings': 'Settings',
    'island.badge.star': 'star',
    'island.badge.planet': 'planet',
    'island.badge.live': 'live',

    // ── The status line ──────────────────────────────────────────────────────────────────
    /* Three parts, not one sentence — so that only the number changes. See `de.ts`. */
    'hud.level': 'level {level}',
    'hud.size': '· {size}',
    'hud.distance': 'zoom {distance}',
    'hud.fps': '· {fps} fps',
    /* The brand of the header line is the switch to the chat — see `hudMarke` in `main.ts`. */
    'hud.toChat': 'Switch to chat',
    /* Two sentences for the same mark — see `de.ts`: the harness chat is not this prototype's chat. */
    'hud.toHarness': 'Switch to the Prometheus chat',

    // ── Panels ───────────────────────────────────────────────────────────────────────────
    'panel.search': 'Search',
    'panel.ruler': 'Axes',
    'panel.status': 'Status',
    'panel.room': 'Room',
    'panel.found': 'Visible',
    'panel.settings': 'Settings',
    'panel.language': 'Language',
    'panel.debug': 'Terminal',
    'panel.health': 'Health check',
    'panel.device': 'Device',
    /* The one sentence of the ranking panel that belongs to the interface — see `de.ts`. */
    'panel.ranking': 'AI ranking',
    'panel.token': 'API tokens',

    // ── API tokens (panel) ───────────────────────────────────────────────────────────────
    'token.mark': 'Access',
    'token.title': 'Your keys',
    'token.lead':
      'Per account, encrypted on the host. After saving, this view shows only a hint — never the key.',
    'token.loading': 'Reading providers …',
    'token.empty': 'The host lists no providers.',
    'token.summary': '{gesetzt} of {gesamt} set',
    'token.field': 'Key',
    'token.fieldFor': 'Key for {anbieter}',
    'token.placeholder': 'Insert a key …',
    'token.replacePlaceholder': 'Insert a new key …',
    'token.foot':
      'The value goes only to the host. It is stored encrypted in user_secrets and never appears in the browser again.',
    'token.save': 'Save',
    'token.remove': 'Remove',
    'token.saving': 'Saving …',
    'token.saved': 'Saved',
    'token.removing': 'Removing …',
    'token.removed': 'Removed',
    'token.hint': 'Hint',
    'token.status.set': 'set',
    'token.status.unset': 'not set',
    'token.signin': 'Sign in',
    'token.error.auth': 'Not signed in — please sign in.',
    'token.error.master': 'No master key configured. Run `bun scripts/schluessel.mjs` once and restart the host.',
    'token.error.csrf': 'The session is no longer valid — please sign in again.',
    'token.error.store': 'The host could not read or write the key.',
    'token.error.net': 'The host is unreachable.',
    'token.error.empty': 'Please enter a key.',
    'token.error.unknown': 'Unknown error.',
    'token.command.help': 'Token panel opened.',

    // ── Search panel ─────────────────────────────────────────────────────────────────────
    'search.hint': 'Every object has a name. {n} objects in this universe — type one, the camera goes there.',
    'search.placeholder': 'e.g. web · Sun · main.ts',
    'search.all': '{n} objects in the universe.',
    'settings.hint': 'Rotation speed, zoom, axes, language — everything is a setting, not a constant in the code.',
    'language.hint': 'Each language is its own pack. Switching takes effect immediately and is remembered.',

    // ── Axes panel ───────────────────────────────────────────────────────────────────────
    'axes.caption': 'AXES · DRAG',
    'axes.hint':
      'Right-handed: x right, y up, z towards the viewer. Drag an end point to rotate the world about the other two axes.',
    'axes.level': 'Reference level',
    'axes.distance': 'Distance',
    'axes.focus': 'Focus',
    'axes.unit': 'Unit',

    // ── Status and room panels ───────────────────────────────────────────────────────────
    'status.hint':
      'Prototype **without a harness connection**. Everything except search, status and room comes from a plugin — detachable in the bar below.',
    'room.hint':
      'Room “{room}”: its own instance, not a filter in a shared database. Stored under {key}. In the prototype the room is only a name from the address (?room=…) — not a security boundary.',
    'mobile.note': 'Small screen — the world needs space. Chat runs here.',
    'mobile.switch': 'To the chat',

    // ── Docking ──────────────────────────────────────────────────────────────────────────
    'dock.detached': 'detached:',
    'dock.grab': 'drag = dock',
    'dock.detach': 'detach',

    // ── Objects on the surface ───────────────────────────────────────────────────────────
    'canvas.drop': 'drop a file here',
    'canvas.remove': 'take off the surface',

    // ── Chat ─────────────────────────────────────────────────────────────────────────────
    'chat.offline': 'Chat mode — not built yet',
    'chat.openWorld': 'To the world',
    'chat.placeholderTitle': 'The chat goes here',
    'chat.placeholderText':
      'The layout was deliberately removed from this prototype and written down as an assignment. What remains is the way there: the island, the Chat entry and view chat in the terminal.',
    'chat.placeholderWhere': 'The assignment is in the Order panel and behind the order command.',
    'panel.order': 'Order: chat',
    'order.task.title': 'Intent',
    'order.task.body':
      'A chat mode with the shape of the DeepSeek Harness web GUI that runs without the harness.\nThe operator: the layout of the harness, the structure of the harness, 1:1 as a template.\nOnce the harness is connected, the prototype becomes the real surface.',
    'order.function.title': 'Function',
    'order.function.body':
      '- Transcript: the user on the right in a bubble, the agent on the left as plain text\n- No sender names. Alignment says who speaks\n- Reasoning as its own line above the answer\n- Composer as a card with a 28 px radius, tool row below, send as a 34 px circle\n- Sidebar 280 px with places and sessions, collapsible to 56 px\n- Input: Enter sends, Shift+Enter breaks the line\n- Without the harness: the message appears, the answer is missing with an honest note',
    'order.stack.title': 'Project stack',
    'order.stack.body':
      '- Bun as runtime, TypeScript 7 (tsgo), Vite as the build step\n- No framework: the surface is DOM, not React. A React rebuild would be a second tree beside the harness\n- Design system imported from the harness (src/design-system.css): tokens, fonts, scrollbar\n- Patterns and classes of the template: .chat, .side, .chat-main, .feed, .w, .in, .box\n- Plugins as the form for everything contributable: panel, commands, healthChecks, settings\n- Language and settings are cores; their content are packs (locale-de, locale-en, ui-controls)',
    'order.open.title': 'Open decisions',
    'order.open.body':
      '- Where the sessions in the sidebar come from: the universe (as before) or the harness\n- Whether the transcript is kept in memory or stored per session\n- Whether the harness interface runs over HTTP, a stream or a plugin\n- Whether markdown is rendered or the text stays plain\n- Whether the chat replaces the third view or stands beside it',    'web.project': 'project',
    'web.summary': 'overview',
    'term.view.current': 'view',
    'term.view.set': 'view switched',    

// ── Settings: categories ─────────────────────────────────────────────────────────────
    'category.control': 'Controls',
    'category.universe': 'Universe',
    'category.interface': 'Interface',
    'category.language': 'Language',
    'category.plugins': 'Plugins',

    // ── Settings: controls ───────────────────────────────────────────────────────────────
    'setting.control.rotateSpeed.label': 'Rotation speed',
    'setting.control.rotateSpeed.description':
      'How far a drag across the screen rotates, in degrees per screen width. 128° means two drags per full turn.',
    'setting.control.zoomFactor.label': 'Zoom per notch',
    'setting.control.zoomFactor.description':
      'Factor per wheel notch. 1.25 halves the distance in three steps.',
    'setting.control.axisSpin.label': 'Rotation at the axis cross',
    'setting.control.axisSpin.description':
      'How far a drag on an axis end point rotates, in degrees per screen width.',
    'setting.control.panFactor.label': 'Panning',
    'setting.control.panFactor.description':
      'How far the middle button or Shift+drag moves the view, relative to the distance.',
    'setting.control.showAxes.label': 'Show axes',
    'setting.control.showAxes.description':
      'The axis cross in the lower left. It doubles as the rotation tool.',
    'setting.control.scheme.label': 'Control scheme',
    'setting.control.scheme.description':
      'CAD: left drag rotates, middle button pans. Shift: left drag always rotates, only Shift pans — the previous binding.',
    'setting.control.keys.label': 'Keyboard',
    'setting.control.keys.description': '0 resets the view, + and − zoom.',

    // ── Settings: world ──────────────────────────────────────────────────────────────────
    'setting.universe.orbits.label': 'Orbits running',
    'setting.universe.orbits.description':
      'Whether planets move. The motion follows Keplerian periods, not a gravity simulation.',
    'setting.universe.orbitSpeed.label': 'Orbit speed',
    'setting.universe.orbitSpeed.description': 'A factor on the orbital speed.',
    'setting.universe.rolling.label': 'Time rotates the world',
    'setting.universe.rolling.description':
      'The orientation changes on its own — time as the fifth degree of freedom.',
    'setting.universe.rollSpeed.label': 'Universe time speed',
    'setting.universe.rollSpeed.description': 'How fast time changes the orientation.',
    'setting.universe.dimensions.label': 'Dimensions',
    'setting.universe.dimensions.description':
      'How many rotation axes act at once. 3 is the intuitive case, 5 uses all ten rotation planes.',

    // ── Settings: interface ──────────────────────────────────────────────────────────────
    'setting.interface.mode.label': 'View',
    'setting.interface.mode.description': 'Universe or chat. On narrow screens chat only.',
    'setting.interface.hud.label': 'Status line',
    'setting.interface.hud.description': 'The line on top with level, distance and fps.',
    'setting.interface.labels.label': 'Names on the bodies',
    'setting.interface.labels.description': 'Labels drawn in the scene.',
    /* See `de.ts` for why the values are identifiers and the labels are not. */
    'setting.interface.style.label': 'Style template',
    'setting.interface.style.description':
      'How the interface is made: material, shape and motion. The world stays dark either way.',
    'setting.interface.style.base': 'Base frame',
    'setting.interface.style.prometheus': 'Forge — Prometheus',
    /* See `de.ts` — a reduction is announced, never silent. */
    'geraet.reduziert': 'Device: frugal',
    'geraet.keinWebgl': 'Device: no WebGL',
    'geraet.kontextVerloren': 'Graphics context lost',
    /* A choice, not a switch — see `de.ts` for the reason. */
    'setting.universe.visuals.label': 'What the universe shows',
    'setting.universe.visuals.description':
      'Empty leaves only the interface — the logic keeps running either way.',
    'setting.universe.visuals.none': 'Empty (interface only)',
    'setting.universe.visuals.stars': 'Only the starfield',
    'setting.universe.visuals.all': 'Bodies and starfield',

    // ── Settings: language ───────────────────────────────────────────────────────────────
    'setting.language.locale.label': 'Interface language',
    'settings.resetAll': 'Reset all',
    'settings.opened': 'Settings opened.',
    'settings.empty': 'There is nothing to configure in this section right now.',
    'setting.language.locale.description':
      'Every language is its own pack. English is the default, German ships alongside.',

    // ── Settings: plugins ────────────────────────────────────────────────────────────────
    'setting.plugins.enabled.label': 'Plugins',
    'setting.plugins.enabled.description': 'Plugins are switched in the terminal with enable and disable.',
    'setting.plugins.count.label': 'Enabled plugins',
    'setting.plugins.count.description': 'How many plugins contribute something right now.',

    // ── Terminal ─────────────────────────────────────────────────────────────────────────
    'term.unknown': 'Unknown command: {name}. “help” lists all.',
    'term.help.title': 'Commands:',
    'term.usage': 'Usage',
    'term.universe': 'universe',
    'term.levelHint': '1 = small body … 7 = overview',
    'term.noHits': 'No match for “{query}”.',
    'term.hits': '{n} matches.',
    'term.plugins': '{n} plugins, {on} enabled.',
    'term.bodies': 'objects in the universe: {n}',
    'term.disabled': 'Plugin disabled: {id}.',
    'term.enabled': 'Plugin enabled: {id}.',
    'term.lang.set': 'Language: {locale}',
    'term.lang.unknown': 'No language pack for “{id}”. Available: {list}',
    'term.lang.missing': '{n} keys missing in {locale}.',
    'term.lang.complete': '{locale} is complete.',
    'term.setting.set': '{key} = {value}',
    'term.setting.unknown': 'Unknown setting: {key}',
    'term.prompt': 'command',
    'term.intro': 'Every command in this window comes from a plugin — not from the shell.',

    // ── Health report ────────────────────────────────────────────────────────────────────
    'health.ok': 'ok',
    'health.fail': 'FAIL',
    'health.none': 'No checks available.',
    'health.summary': '{n} checks · {ok} ok · {bad} finding(s)',
    'health.locale': 'language pack {id}',

    // ── Notes (plugin `notes`) ───────────────────────────────────────────────────────────
    'panel.notes': 'Notes',
    'notes.title': 'Notes',
    'notes.search': 'Search the notes',
    'notes.loading': 'loading …',
    'notes.empty': 'No notes yet. Adopt a vault and read it in.',
    'notes.emptySearch': 'No match.',
    'notes.count': '{n} of {gesamt} notes',
    'notes.vault.missing': 'Suggestion, not adopted yet:',
    'notes.vault.take': 'Adopt vault',
    'notes.import': 'Read in again',
    'notes.command.help': 'shows the account’s notes (the “Notes” panel fetches and searches)',
    'notes.command.empty':
      'Nothing fetched yet — open the “Notes” panel; this command reads the last fetched state.',
    'notes.health.unchecked': 'not checked — the panel has not been open yet',
    'notes.health.ok': '{notizen} notes, {verweise} links in memory',
    'notes.error.netz': 'No connection to the host.',
    'notes.error.kein-csrf': 'No CSRF value in the cookie — sign in again and it works.',
    'notes.error.nicht-angemeldet': 'This session is no longer valid — sign in again.',
    'notes.error.unerwartet': 'The host could not answer the request.',
    'notes.error.pfad-weg': 'That path does not exist (any more).',
    'notes.error.pfad-kein-ordner': 'The path is a file, not a directory.',
    'notes.error.pfad-nicht-absolut': 'The path must be absolute.',
    'notes.error.pfad-unbrauchbar': 'The path must not contain “..”.',
    'notes.error.vault-fehlt': 'This account has no vault yet.',
    'notes.error.vault-schon-da': 'That vault is already registered.',
    'notes.error.unbekannt': 'Unknown error',
    'notes.signin': 'Go to sign-in',
    'setting.notes.limit.label': 'Notes per fetch',
    'setting.notes.limit.description':
      'How many notes the panel fetches at most. More rows cost more time to build.',
  },
}
