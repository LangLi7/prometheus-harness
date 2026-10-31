/**
 * Die Texte dieses Plugins — deutsch und englisch.
 *
 * Der Namensraum heißt `mediaPreview`; er steht so in `index.tsx` und in der
 * Typ-Erweiterung von `LocaleNamespaceMap`.
 *
 * @module @prometheus-harness/client-media-preview/locales
 */

/** Deutsch. */
export const DE = {
  title: 'Medien',
  loading: 'Wird geladen…',
  video: 'Video: {name}',
  audio: 'Ton: {name}',
  failed: 'Der Browser kann diese Datei nicht abspielen. Der Container ist gültig, der Codec darin nicht — „Öffnen mit" im Kopf der Vorschau hilft weiter.',
  unsupported: 'Diese Datei hat keine abspielbare Endung.',
}

/** Englisch. */
export const EN: typeof DE = {
  title: 'Media',
  loading: 'Loading…',
  video: 'Video: {name}',
  audio: 'Audio: {name}',
  failed: 'The browser cannot play this file. The container is fine, the codec inside is not — use "Open with" in the preview header.',
  unsupported: 'This file has no playable extension.',
}
