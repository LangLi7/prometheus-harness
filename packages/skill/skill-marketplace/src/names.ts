/**
 * `@prometheus-harness/skill-marketplace/names` — Skill-Namen.
 *
 * Der Kern erlaubt nur Kebab-Case ohne Doppelpunkt. Claude Code namensräumt mit
 * `plugin:skill`; hier wird daraus `plugin-skill`. Diese Datei ist absichtlich
 * frei von Dateisystem und Installation, damit Adapter und Installer sie teilen
 * können, ohne sich gegenseitig zu importieren.
 *
 * @module @prometheus-harness/skill-marketplace/names
 */

/**
 * Macht aus einem Anzeigenamen einen gültigen Skill-Namen.
 *
 * @param name - der Rohname
 * @returns der Name
 */
export function sanitizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Der materialisierte Verzeichnisname eines Plugin-Skills.
 *
 * Der **Name im Katalog** kommt aus dem Frontmatter, nicht aus dem Verzeichnis.
 * Das Verzeichnis dient der eindeutigen Ablage; deshalb trägt es den Plugin-Namen
 * nur, wenn es sich vom Skill-Namen unterscheidet.
 *
 * @param plugin - Plugin-Name
 * @param skill - Skill-Name
 * @returns der Verzeichnisname
 */
export function skillNameFor(plugin: string, skill: string): string {
  const combined = sanitizeSkillName(plugin) === sanitizeSkillName(skill) ? skill : `${plugin}-${skill}`
  const candidate = sanitizeSkillName(combined)
  return candidate === '' ? sanitizeSkillName(skill) : candidate.slice(0, 64).replace(/-+$/, '')
}
