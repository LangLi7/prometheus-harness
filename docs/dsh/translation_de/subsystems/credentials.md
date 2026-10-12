# Nutzer-Credentials

English | [中文](credentials.zh.md)

Die Credential-Naht von [dsh-credentials](../../packages/credentials/credentials) hält Geheimnisse aus der Konfiguration heraus: Einstellungsabschnitte und `cordis.yml`-Einträge tragen *Referenzen* (Namen von Umgebungsvariablen), Provider wie [dsh-credentials-local](../../packages/credentials/credentials-local) besitzen die Werte, und Consumer lösen eine Referenz einmal pro Operation auf — die LLM-Adapter lösen einmal pro Modellanfrage auf, sodass ein rotiertes Credential die unmittelbar nächste Anfrage ohne jeden Neustart erreicht. Eine nahtweite Regel bindet jeden Provider: ein leerer gespeicherter Wert ist überall abwesend.

Source: [`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

## Identität

Eine Referenz benennt ein Credential als Namen einer Umgebungsvariablen im POSIX-Stil. Die Brand verhindert, dass Aufrufer Credential-Referenzen mit anderen Zeichenketten vermischen, die zwischen Paketen oder Prozessen übergeben werden; die Konstruktion validiert die Syntax eines Shell-Identifiers.

```ts type-equiv
/** Nominal reference to one credential: a POSIX-style environment-variable name. */
type CredentialRef = Branded<'CredentialRef'>
```

## Auflösung

`resolve(ref)` gibt den Wert zusammen mit der providerdefinierten Quellenschicht zurück, die ihn geliefert hat, oder `undefined`, solange er nicht konfiguriert ist. Consumer lösen bei jeder Operation erneut auf und cachen niemals über Operationen hinweg — dieses Lesen pro Operation ist der Mechanismus für Hot-Updates.

```ts type-equiv
/** One resolved credential value and the source layer that supplied it. */
interface ResolvedCredential {
  /** The non-empty secret value. */
  value: string
  /** Provider-defined source layer id (the local provider uses `env`, `file`, `project-env`, and `user-env`). */
  source: string
}
```

## Beschreibung

`describe(ref)` beantwortet Konfigurationsoberflächen, ohne je einen Wert offenzulegen: ob die Referenz auflöst, aus welcher Schicht und ob `set` derzeit gelingen würde. Der lokale Provider meldet eine Referenz, die von der Umgebung des laufenden Prozesses geliefert wird, als `writable: false` — ein Schreiben würde scheinbar gelingen, während die Auflösung weiterhin den überschattenden Wert zurückgibt, weshalb die Naht es zurückweist und die UI die Referenz von vornherein schreibgeschützt rendern kann.

```ts type-equiv
/**
 * Source and writability facts for one reference, safe for configuration UIs —
 * never the value. The view has no slot a value could ride in, which is what
 * lets the whole read half cross the Remote wire.
 */
interface CredentialInfo {
  /** Whether resolving the reference would currently return a value. */
  configured: boolean
  /** Source layer currently supplying the value; absent while unconfigured. */
  source?: string
  /** Whether the active provider can write this reference. */
  writable: boolean
}
```

## Änderungs-Commits

`credentials/reference-updated (ref)` feuert nach einer committeten Änderung an einer providergesteuerten Quelle — einem `set`, einem `unset` oder einer externen Bearbeitung, die im Speicher beobachtet wurde. Umgebungsänderungen des umgebenden Prozesses sind nicht beobachtbar und emittieren nie. Consumer brauchen das Event nicht (sie lösen pro Operation erneut auf); es existiert für Konfigurationsoberflächen, die ein „konfiguriert“-Abzeichen aktualisieren.

## Eingebettete Platform-Credentials

PlatformSession ist ein Host-only-Snapshot aus getPlatformSession: origin benennt den konfigurierten Platform-Issuer und token enthält dessen gespeichertes Account-Credential. userId wiederholt die stabile Account-ID aus dem jüngsten erfolgreichen getProfile und ist null, bis eines gelingt oder wenn dieses Profil keine ID trägt. Der Snapshot verwendet diese ID erneut, ohne eine eigene Profilanfrage zu stellen, sodass eine unbekannte ID userId null lässt, statt den Aufrufer zu verzögern; ein Profil-Read, dessen stabile ID erstmals verfügbar wird oder sich ändert, benachrichtigt Watch-Abonnenten, was Identitäts-Consumern erlaubt, den Snapshot erneut zu lesen. Consumer schlüsseln persistenten Browser-Speicher nach origin und userId und fallen für null auf temporären Speicher zurück. Abgemeldete Accounts und Credentials, die während des Credential-Reads geändert wurden, geben keinen Snapshot zurück; ein nicht passender Issuer schlägt fehl. Native Consumer besitzen die Dokumentinvalidierung, wenn sich Credentials ändern. Dieser Snapshot ist von Account-Controller-RPC, AccountView und AccountDetails ausgenommen.

AccountDetails.balance projiziert Auflade-Wallets in value und Bonus-Wallets in bonusWallets, mit unabhängigen Währungs- und Dezimalguthaben-Zeichenketten. Fehlgeschlagene Abfragen enthalten keine Wallet-Arrays.

Abfragen zu Bonusbenachrichtigungen geben einen AccountBonusBatch mit der aktuellen Platform-Account-Id und berechtigten Bestellungen in Serverreihenfolge zurück. AccountBonusNotification behält die Servernachricht und den Ablauf, ohne Credentials zu projizieren. Die Bestätigung trägt die erwartete Account-Id und Bestell-Id; der Host weist sie nach einem Account-Wechsel zurück. Beide Benachrichtigungsoperationen verwenden die Sprache der initiierenden UI über x-client-locale, ohne einen Sprachquery-Parameter.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxauthorization--authorizationservice"></a>

### `ctx.authorization` — `AuthorizationService`

`ctx.authorization`: eine Registry von Abläufen zum Erhalt von Credentials, ein Versuch pro Schlüssel zu einem Zeitpunkt.

```ts cordis-catalog
/**
 * Offer a way to obtain one credential. One flow per key: two plugins
 * claiming the same key would each write a record in their own format, and
 * whichever ran last would leave the other reading a payload it cannot parse.
 *
 * @param flow - the key it writes, its label, its methods, and its runner.
 * @returns Disposer that withdraws this flow.
 * @throws {AuthorizationError} code `DUPLICATE_FLOW` when the key is already claimed.
 */
registerFlow(flow: AuthorizationFlow): () => void

/**
 * Every registered flow, for a surface listing what can be authorized.
 * @returns one entry per flow, in registration order.
 */
list(): readonly AuthorizationEntry[]

/**
 * One registered flow.
 * @param key - the credential record to ask about.
 * @returns the entry, or undefined when no flow claims that key.
 */
describe(key: CredentialKey): AuthorizationEntry | undefined

/**
 * Withdraw the attempt running for a key, if any. Separate from the
 * request's own signal because a request/response transport answers a Cancel
 * button on a second call, with no handle on the first one's signal.
 * @param key - the credential record whose attempt should stop.
 */
cancel(key: CredentialKey): void

/**
 * Run one attempt to authorize a key, and report how it ended.
 *
 * One attempt per key at a time. A second caller is refused rather than
 * joined: the two would be prompting different humans through the same flow,
 * and the second would answer questions the first was asked.
 *
 * @param request - the key, the method, the surface, and the cancel signal.
 * @returns `authorized` once the flow's record is committed during this
 *   attempt and observed, or `cancelled` when the human declined or the
 *   caller withdrew.
 * @throws {AuthorizationError} code `NO_FLOW` when nothing claims the key,
 *   `UNKNOWN_METHOD` when the named method is not one the flow offers,
 *   `ALREADY_IN_FLIGHT` when an attempt is already running for the key, or
 *   `NOT_COMMITTED` when the flow resolved without committing a record
 *   during the attempt.
 */
async begin(request: AuthorizationRequest): Promise<AuthorizationOutcome>
```

Source: [`packages/credentials/authorization/src/index.ts`](../../packages/credentials/authorization/src/index.ts)

<a id="ctxcredentials--credentialprovider-abstract-seam"></a>

### `ctx.credentials` — `CredentialProvider` (abstract seam)

Abstrakter Credential-Service über zwei Schlüsselräume, die zwei Fragen beantworten.

Eine CredentialRef beantwortet „was steckt hinter diesem Namen einer Umgebungsvariablen“, geschichtet über die Prozessumgebung, den providergesteuerten Speicher und `.env`-Dateien. Eine nahtweite Regel bindet diese Hälfte: ein leerer gespeicherter Wert ist überall abwesend — `resolve` überspringt ihn, `describe` meldet ihn als nicht konfiguriert —, sodass ein Leerwert sich nie als konfiguriertes Geheimnis ausgibt.

Eine CredentialKey beantwortet „welches Credential hält dieses Plugin für diese Id“. Hier kann nichts geschichtet werden — eine Autorisierungsgewährung hat keine Umgebung, aus der gelesen werden könnte —, sodass die Anwesenheit des Records der ganze Fakt ist und modifyRecord der einzige Schreibpfad, weil ein korrektes Schreiben vom aktuellen Wert abhängt (ein Token-Refresh ist Lesen-Entscheiden-Ersetzen unter einem Lock).

```ts cordis-catalog
/**
 * Resolve one reference to its current value. Resolution is per call:
 * consumers re-resolve at each operation and must not cache across
 * operations — that per-operation read is what makes a changed credential
 * reach the next operation without a restart.
 * @param ref - the reference to resolve.
 * @returns the value and its source, or `undefined` while unconfigured.
 */
abstract resolve(ref: CredentialRef): Promise<ResolvedCredential | undefined>

/**
 * Describe one reference for configuration surfaces without exposing the
 * value.
 * @param ref - the reference to describe.
 * @returns configured state, supplying source, and writability.
 */
abstract describe(ref: CredentialRef): Promise<CredentialInfo>

/**
 * Durably store one value in the provider-managed writable source. Rejects
 * while a read-only source shadows the reference — the write would appear
 * to succeed while resolution keeps returning the shadowing value — and
 * rejects an empty value (use {@link unset}).
 * @param ref - the reference to store.
 * @param value - the non-empty secret value.
 */
abstract set(ref: CredentialRef, value: string): Promise<void>

/**
 * Remove one reference from the provider-managed writable source; removing
 * an absent reference is a no-op. Rejects while a read-only source shadows
 * the reference, like {@link set}.
 * @param ref - the reference to remove.
 */
abstract unset(ref: CredentialRef): Promise<void>

/**
 * Read one stored record. The value is returned as its owner wrote it; a
 * {@link GrantRecord} payload is not interpreted on the way out.
 * @param key - the record to read.
 * @returns the record, or `undefined` while none is stored.
 */
abstract readRecord(key: CredentialKey): Promise<CredentialRecord | undefined>

/**
 * Describe one record for configuration surfaces without exposing its value.
 * @param key - the record to describe.
 * @returns presence, discriminant, and writability.
 */
abstract describeRecord(key: CredentialKey): Promise<CredentialRecordInfo>

/**
 * Enumerate every stored record's address and tag. Unlike the reference
 * half, which has no enumeration because configuration surfaces learn which
 * references exist from settings schemas, records have no such discovery
 * path: a surface that cannot list them cannot show what a user is
 * authorized for, nor find an orphan left by an uninstalled plugin.
 * @returns every stored record, values excluded.
 */
abstract listRecords(): Promise<readonly CredentialRecordEntry[]>

/**
 * Serialized read-modify-write over one record — the only write path.
 * `mutate` sees the record as it stands at the moment the write is
 * exclusive, and returning `undefined` leaves the entry untouched. Exclusion
 * holds across processes where the backing store supports it, which is what
 * makes a token refresh safe: two processes rotating one refresh token
 * concurrently would otherwise lose whichever wrote first.
 * @param key - the record to modify.
 * @param mutate - receives the current record and returns its replacement, or `undefined` to leave it.
 * @returns the record after the write, or the current one when `mutate` declined.
 */
abstract modifyRecord( key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>, ): Promise<CredentialRecord | undefined>

/**
 * Remove one record; removing an absent record is a no-op.
 * @param key - the record to remove.
 */
abstract deleteRecord(key: CredentialKey): Promise<void>
```

Source: [`packages/credentials/credentials/src/index.ts`](../../packages/credentials/credentials/src/index.ts)

<a id="ctxcredentialscontroller--credentialscontroller"></a>

### `ctx.credentialsController` — `CredentialsController`

Host-Service hinter dem generierten Namespace `ctx.remote.credentials`. Er trägt jede Wire-Verpflichtung, die die Credential-Naht selbst nicht trägt: die Obergrenze für den Batch-Fan-out, die feldweise View-Projektion, die Wächterfunktion für die Referenzgrammatik und die Zuordnung der Zurückweisungen. Geheimwerte passieren nur in eine Richtung — keine Methode hier gibt einen zurück.

```ts cordis-catalog
/**
 * Describe several references for one configuration surface. Batched because
 * a settings page describes every reference its rows name at once, and one
 * round trip keeps those rows from settling separately.
 * @param refs - reference names, at most {@link MAX_DESCRIBE_REFS}; a name outside the grammar
 *   rejects the whole call as `gateway/bad-request`.
 * @returns one view per requested name, keyed by that name.
 * @throws RemoteError when the request is invalid or no credential provider is mounted.
 */
@Remote async describe(refs: string[]): Promise<Record<string, CredentialInfo>>

/**
 * Store one value from a configuration surface. The value crosses the wire in
 * this direction only: no read path returns it.
 * @param ref - reference name to store under.
 * @param value - the non-empty secret value.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote async set(ref: string, value: string): Promise<void>

/**
 * Remove one reference from a configuration surface.
 * @param ref - reference name to remove.
 * @throws RemoteError when the request is invalid, no provider is mounted, or the provider refuses the write.
 */
@Remote async unset(ref: string): Promise<void>
```

Source: [`packages/api/settings-controller/src/credentials.ts`](../../packages/api/settings-controller/src/credentials.ts)

<a id="ctxdeepseekaccount--deepseekaccount-abstract-seam"></a>

### `ctx.deepseekAccount` — `DeepSeekAccount` (abstract seam)

Account-Operationen; nur Host-Consumer können ein Anfrage-Credential erhalten.

```ts cordis-catalog
/**
 * Read stored-account presence and the latest login attempt.
 * @returns a snapshot without credentials or PKCE secrets.
 */
abstract getState(): Promise<AccountView>

/**
 * Query Platform profile independently of wallet balances.
 * A ready result whose stable profile ID first becomes available or changes notifies watch
 * consumers, so identity consumers re-read getPlatformSession; repeated IDs stay silent.
 * @param client - identity of the requesting UI for this call.
 * @returns profile outcome, or null if signed out or the grant changed during the query.
 */
abstract getProfile(client: AccountClientMetadata): Promise<AccountDetails['profile'] | null>

/**
 * Query Platform recharge and bonus wallet balances independently of profile data.
 * @param client - identity of the requesting UI for this call.
 * @returns balance outcome, or null if signed out or the grant changed during the query.
 */
abstract getBalance(client: AccountClientMetadata): Promise<AccountDetails['balance'] | null>

/**
 * Query the granted bonuses Platform has not yet recorded as displayed.
 * @param client - identity of the requesting UI for this call; its language selects the server-authored message.
 * @returns bonuses with their account, or null if signed out or the grant changed during the query.
 */
abstract getUnnotifiedBonuses(client: AccountClientMetadata): Promise<AccountBonusBatch | null>

/**
 * Record one displayed bonus as notified for the account it belongs to.
 * @param accountId - account the notification was read for; a different current account is never acknowledged.
 * @param orderId - granted bonus order the user saw.
 * @param client - identity of the requesting UI for this call.
 * @returns true once Platform records the acknowledgement; false if signed out or the account changed.
 */
abstract ackBonusNotified(accountId: AccountUserId, orderId: AccountBonusOrderId, client: AccountClientMetadata): Promise<boolean>

/**
 * Join an active attempt or start browser authorization.
 * @param client - identity of the requesting UI; a new attempt captures it, and joining retains the original attempt's identity.
 * @param callbackOrigin - browser-accessible loopback HTTP origin, including any SSH local port.
 * @param loginSource - initiating UI, used to return from a failed exchange.
 * @returns the initial snapshot without waiting for browser approval.
 */
abstract startSignIn(client: AccountClientMetadata, callbackOrigin: string, loginSource: 'web' | 'desktop'): Promise<AccountView>

/**
 * Cancel only the named attempt; committing attempts settle before returning.
 * @param id - attempt identity from this Host.
 * @returns state after cancellation or an already-started commit.
 */
abstract cancelSignIn(id: SignInAttemptId): Promise<AccountView>

/**
 * Remove the local grant while retaining API keys; the provider revokes it in the background.
 * @param client - identity of the requesting UI, captured for the background revocation retries.
 * @returns the signed-out state after local removal; remote failures never restore the grant.
 */
abstract signOut(client: AccountClientMetadata): Promise<AccountView>

/**
 * Subscribe to snapshots including a complete initial state.
 * @param signal - subscription lifetime; ending it never cancels login.
 * @returns complete snapshots as account state changes.
 */
abstract watch(signal: AbortSignal): AsyncIterable<AccountView>

/**
 * Resolve a credential only for the inference origin allowed by the provider.
 * @param url - actual request destination or API base URL.
 * @returns stored token, or undefined for other origins or a signed-out account.
 */
abstract resolveToken(url: string): Promise<string | undefined>

/**
 * Remove an inference-rejected token only while it still matches the stored login.
 * @param token - token captured by the rejected inference request.
 * @returns after matching credentials are removed and the expiry notification is emitted.
 */
abstract rejectToken(token: string): Promise<void>

/**
 * Read credentials for the configured Platform origin, bound to their issuing environment, and
 * pair them with the account ID from the last successful profile read; no profile request is made.
 * @returns a Host-only snapshot, or null while signed out or when the credential changed during the read.
 */
abstract getPlatformSession(): Promise<PlatformSession | null>

/**
 * Read existing login identity without creating a device or returning credentials.
 * @returns optional device/account identifiers and the provider's OS version string.
 */
abstract getDeviceIdentity(): Promise<{ deviceId?: string; userId?: AccountUserId; osVersion: string }>
```

Source: [`packages/credentials/deepseek-account/src/index.ts`](../../packages/credentials/deepseek-account/src/index.ts)

<a id="authorization-events"></a>

### `authorization/*` events

<a id="authorizationsettled--emit"></a>

#### `authorization/settled` — emit

Ein Autorisierungsversuch ist beendet und hat seinen Schlüssel freigegeben. Feuert für jedes terminale Ergebnis, Fehler eingeschlossen, damit eine Oberfläche, die einen Schlüssel beobachtet, den sie nicht gestartet hat (ein zweiter Browser-Tab), erfährt, dass der Versuch vorbei ist.

```ts cordis-catalog
/**
 * One authorization attempt has finished and released its key. Fires for
 * every terminal outcome, failures included, so a surface watching a key it
 * did not start (a second browser tab) learns the attempt is over.
 * @mode emit
 * @param key - the credential record the finished attempt was authorizing.
 * @param settlement - how it ended, including the `failed` case its caller sees as a thrown error.
 */
'authorization/settled'(key: CredentialKey, settlement: AuthorizationSettlement): void
```

Source: [`packages/credentials/authorization/src/index.ts`](../../packages/credentials/authorization/src/index.ts)

<a id="credentials-events"></a>

### `credentials/*` events

<a id="credentialsrecord-updated--emit"></a>

#### `credentials/record-updated` — emit

Committete Änderung an einem gespeicherten Credential-Record: ein `modifyRecord`, der geschrieben hat, ein `deleteRecord`, der entfernt hat, oder eine externe Bearbeitung, die im Speicher beobachtet wurde. Getrennt von `credentials/reference-updated`, weil die beiden Schlüsselgrammatiken disjunkt sind — ein Listener, der beide auf einem Event erhielte, könnte nicht sagen, zu welchem Raum ein Subjekt gehört. Listener-Fehler werden zu denselben Bedingungen enthalten wie bei `credentials/reference-updated`.

```ts cordis-catalog
/**
 * Committed change to a stored credential record: a `modifyRecord` that
 * wrote, a `deleteRecord` that removed, or an external edit observed in
 * storage. Separate from `credentials/reference-updated` because the two key
 * grammars are disjoint — a listener that received both on one event could
 * not tell which space a subject belongs to. Listener failures are
 * contained on the same terms as `credentials/reference-updated`.
 * @param key - the record whose stored value changed.
 * @mode emit
 */
'credentials/record-updated'(key: CredentialKey): void
```

Source: [`packages/credentials/credentials/src/types.ts`](../../packages/credentials/credentials/src/types.ts)

<a id="credentialsreference-updated--emit"></a>

#### `credentials/reference-updated` — emit

Committete Änderung an einer providergesteuerten Credential-Quelle: ein `set`, ein `unset` oder eine externe Bearbeitung, die im Speicher beobachtet wurde. Umgebungsänderungen des umgebenden Prozesses sind nicht beobachtbar und emittieren nie. Listener-Fehler werden enthalten und protokolliert — ein synchroner Throw und eine asynchrone Ablehnung gleichermaßen —, ohne das Ergebnis der committeten Operation zu ändern.

```ts cordis-catalog
/**
 * Committed change to a provider-managed credential source: a `set`, an
 * `unset`, or an external edit observed in storage. Ambient
 * process-environment changes are not observable and never emit. Listener
 * failures are contained and logged — a sync throw and an async rejection
 * alike — without changing the committed operation's outcome.
 * @param ref - the reference whose stored value changed.
 * @mode emit
 */
'credentials/reference-updated'(ref: CredentialRef): void
```

Source: [`packages/credentials/credentials/src/types.ts`](../../packages/credentials/credentials/src/types.ts)

<a id="deepseek-account-events"></a>

### `deepseek-account/*` events

<a id="deepseek-accountmodel-sign-in-required--emit"></a>

#### `deepseek-account/model-sign-in-required` — emit

Eine Account-Modellanfrage erfordert, dass der Nutzer sich anmeldet.

```ts cordis-catalog
/** An account model request requires the user to sign in.
 * @mode emit
 */
'deepseek-account/model-sign-in-required'(): void
```

Source: [`packages/credentials/deepseek-account/src/types.ts`](../../packages/credentials/deepseek-account/src/types.ts)

<a id="deepseek-accountsession-expired--emit"></a>

#### `deepseek-account/session-expired` — emit

Eine Server-Zurückweisung hat das aktuelle Account-Credential entfernt; diese Benachrichtigung wird nicht erneut abgespielt.

```ts cordis-catalog
/** Server rejection removed the current account credential; this notification is not replayed.
 * @mode emit
 */
'deepseek-account/session-expired'(): void
```

Source: [`packages/credentials/deepseek-account/src/types.ts`](../../packages/credentials/deepseek-account/src/types.ts)

<a id="deepseek-accountsigned-out--emit"></a>

#### `deepseek-account/signed-out` — emit

Das Entfernen der lokalen Gewährung ist abgeschlossen.

```ts cordis-catalog
/** Local grant removal has completed.
 * @mode emit
 */
'deepseek-account/signed-out'(): void
```

Source: [`packages/credentials/deepseek-account/src/index.ts`](../../packages/credentials/deepseek-account/src/index.ts)
<!-- END GENERATED cordis-surface -->

Die Account Service Definition legt getState, getProfile, getBalance, getUnnotifiedBonuses, ackBonusNotified, startSignIn, cancelSignIn, signOut, watch sowie die Host-only-Methoden resolveToken und getPlatformSession offen. Der Platform-Provider implementiert sie mit einem AuthorizationFlow und einem privaten GrantRecord. AccountView unterscheidet gespeicherte Anwesenheit von Servervalidierung; Versuchs-Ids binden die Stornierung an einen lokalen Ablauf. Siehe [das Account-Paket](../../packages/credentials/deepseek-account/README.md).

`AccountClientMetadata` trägt `version` aus dem `DSH_CLIENT_VERSION` des Aufrufers, die aktive UI-`locale` und `timezoneOffsetSeconds`, ermittelt zu Beginn der Operation. Der Offset ist lokale Zeit minus UTC in Sekunden: UTC+8 ist `28800`. Es enthält keine Credentials. Login-Versuche behalten ihre initiierenden Metadaten über Austausch und Stornierung hinweg; das Abmelden behält seine Metadaten für Wiederholungen des Widerrufs.
