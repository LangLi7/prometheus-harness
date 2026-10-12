# Glossar

Englisch | [中文](glossary.zh.md)

Die Domänenvokabeln für DeepSeek Harness verwenden einen kanonischen Begriff pro Konzept. Begriffe verlinken über Standard-Markdown-Anker auf ihre Einträge; Implementierungsdetails bleiben in Paket-READMEs und Agent Notes.

## capability-seam (Capability-Seam)

- **seam** (Seam) — eine *austauschbare Fähigkeit* mit drei Rollen: eine **Service Definition** (der Cordis-`Service`, dem sein `ctx.<key>` und seine Vokabulartypen gehören — eine abstrakte Klasse wie `ShellExecutor` oder ein konkreter Registry wie `WebRuntime`, niemals ein TypeScript-`interface`), ein oder mehrere **Service Providers** und ein oder mehrere **Consumers**, die den Service injizieren. `packages/shell` ist das kanonische Beispiel: `dsh-shell` (Service Definition), `dsh-bash-local` / `dsh-bash-sandbox` (Provider) und `dsh-tool-bash` (Consumer). Die Rollen besetzen normalerweise getrennte Pakete, wenn sie sich unabhängig entwickeln, aber ein Paket darf mehrere Rollen besitzen, wenn sie ein einziges Anliegen sind (`dsh-user-approval` besitzt die Service Definition der Freigabe-Seam und ihre konkrete Implementierung in einem Paket). Die Seam ist die vollständige Fähigkeit, niemals eine einzelne Rolle; den Begriff für diese Bedeutung reservieren und einen Bestandteil über seine Rolle, Klasse, seinen Service, Vertrag oder Extension Point benennen.

## agent-scope (Agent-Scope)

- **scope** (Scope) — die Einheit der Registrierung pro Agent: Ein Beitrag (Tool, Prompt-Abschnitt, Variable, Einschränkung, Listener) ist entweder *global* (für jeden Agent sichtbar) oder *gescopt* (gehört genau einem [Scope Key](#scope-key)). Zwei Ebenen, flach: gescopte Registrierungen vererben sich nicht nach unten an Subagenten; Subtree-Verhalten wird mit [Lineage](#lineage)-Daten ausgedrückt, niemals über die Scope-Struktur.
- **scope key** (Scope Key) — die undurchsichtige Identität, mit der ein Scope verschlüsselt wird und die über Objektidentität verglichen wird. Die Harness-Konvention: Ein lebender Agent ist der Schlüssel seines eigenen Scope. <a id="scope-key"></a>
- **agent context (`agent.ctx`)** (Agent-Kontext) — der gescopte Kontext des Agenten; Registrierungen darüber sind scope-sichtbar UND scope-lebensdauergebunden (ein Sachverhalt steuert beides), und Listener darauf nehmen an den scope-gefilterten Dispatches dieses Agenten teil. Registry-Subject-Events können unter ihren eigenen Event-Verträgen bewusst ungefiltert bleiben.
- **scope carrier** (Scope-Träger) — der `thisArg`, den ein scope-gefilterter Dispatch trägt (gebaut durch `scopeTarget`); sein Filter lässt ungetaggte Listener plus die des Subjekts zu. Ein *subjektloser* Träger (kein Key) lässt nur ungetaggte Listener zu.
- **scoped dispatch** (gescopter Dispatch) — die Regel: Ein Event über die Aktivität eines Agenten dispatched mit dem Träger dieses Agenten. Events über eine Registry selbst (ein Tool wurde hinzugefügt) sind *registry-subject* und bleiben ungefiltert.
- **shadowing** (Shadowing) — Namensauflösung nach dem Prinzip „spezifischster gewinnt": Ein gescoptes Tool/ein Abschnitt/eine Variable ersetzt sein gleichnamiges globales Gegenstück allein für diesen Scope. Der Mechanismus für Persona pro Agent und Tool-Variante pro Agent.
- **restriction / scope-local registration** (Einschränkung / scope-lokale Registrierung) — eine Einschränkung (`tools.restrict`) filtert die GLOBALE Tool-Menge für einen Scope (Komposition durch Schnittmenge); scope-lokale Registrierungen werden nach diesem Filter zusammengeführt. Ein weggefiltertes globales Tool fehlt im Prompt UND verweigert die Ausführung, ununterscheidbar von einem nicht existierenden.
- **setup window** (Setup-Fenster) — der Erstellungsslot, in dem ein Erzeuger die gescopte Welt eines Agenten zusammensetzt (`CreateAgentOptions.setup`): nachdem Scope und Agent-Objekt existieren, aber bevor der Agent oder die Session veröffentlicht wird, `agent/created` ausgelöst wird oder der erste Prompt zusammengesetzt wird. Setup registriert; es treibt den Agenten niemals an.
- **lineage** (Lineage) — Eltern-/Kind-Sachverhalte, die als Daten getragen werden (`parentSession`, dauerhafte `delegationDepth`, Laufzeit-`subagentDepth`); sie beeinflussen niemals die Sichtbarkeit. <a id="lineage"></a>

## goal (Goal)

- **goal** (Goal) — ein dauerhaftes Abschlussziel, das an eine bestehende Session gebunden ist, mit einer revisionierten Phase `active` / `paused` / `blocked` / `complete` und einer Obergrenze für Goal-Runden; `blocked` behält einen Policy-Code und eine Erklärung. Ein Goal ist Zustand, kein Scheduler und keine separate Konversation; das Session-Log bleibt seine Quelle der Wahrheit.
- **goal round** (Goal-Runde) — ein Fortsetzungszyklus, der für das aktuelle Goal zugelassen wird. Der Same-Session-Treiber materialisiert eine Goal-Runde als einen goal-gesourcten [Turn](#turn), der null oder mehr Schritte enthalten kann; unabhängige menschliche Turns in derselben Session verbrauchen die Obergrenze für Goal-Runden nicht. <a id="goal-round"></a>
- **goal activation** (Goal-Aktivierung) — prozesslokale Berechtigung für einen Fortsetzungs-Konsumenten, eine weitere Goal-Runde zuzulassen. Die Aktivierung ist entweder `armed` oder `disarmed`; sie fehlt bewusst im dauerhaften Replay, daher erfordern Resume und Fork eine später vom Menschen autorisierte Resume-Mutation über `/goal` oder das Modell-Tool, bevor automatische Arbeit möglich ist.

## human command (Menschlicher Befehl)

- **human command** (Menschlicher Befehl) — eine mit Schrägstrich eingeleitete Anweisung, die von einem menschenzugewandten Adapter über `ctx.commands` interpretiert und ausgeführt wird, ohne zu einer Modellnachricht zu werden. Sie unterscheidet sich von einem modellzugewandten Tool und von der Ausführung von Shell-Befehlen über `ctx.shell`.
- **command plane** (Command-Ebene) — Discovery, Parsing, Dispatch, Abbruch und Ergebnisdarstellung, die UI-Adaptern und Command-Plugins gehören. Command-Ausgabe ist UI-Zustand, sofern der Handler nicht separat eine dauerhafte Domäne verändert.
- **goal command** (Goal-Befehl) — der menschliche Befehl `/goal`, beigesteuert von `dsh-command-goal`; er beobachtet oder verändert das aktuelle Goal direkt, während die Goal-Domäne jeden dauerhaften, modellsichtbaren Datensatz besitzt.

## loop hierarchy (Loop-Hierarchie)

- **turn** (Turn) — ein Drain zugelassener Eingabe in einer Session, der endet, nachdem das Modell und seine Tools stoppen oder eine terminale Policy eingreift. <a id="turn"></a>
- **step** (Schritt) — eine Modellanfrage plus die durch ihre Antwort verursachten Tool-Ausführungen; ein Turn enthält null oder mehr Schritte. <a id="step"></a>
- **round** (Runde) — eine äußere Policy-Iteration, die einen Turn enthält, etwa eine [Goal-Runde](#goal-round) oder ein Frisch-Agent-Versuch von Ralph. Rundenzähler gehören dieser Policy und zählen nicht jeden Turn einer Session. <a id="round"></a>

## Ralph

- **Ralph loop** (Ralph-Loop) — ein im Vordergrund laufender Workflow-Lauf mit frischem Agenten auf ein unveränderliches Ziel hin. Er ist eine modellzugewandte Tool-Policy, die aus Workflow- und Subagent-Primitiven zusammengesetzt ist, kein Same-Session-Goal, kein Agent-Loop-Modus, kein Scheduler und kein generisches Workflow-Skript-Feature. <a id="ralph-loop"></a>
- **Ralph round** (Ralph-Runde) — eine frische Kind-Session in einem [Ralph-Loop](#ralph-loop). Das Kind erhält keinen Gesprächs-Seed vom Eltern oder von vorherigen Kindern; der geteilte Workspace und ein begrenzter [Ralph-Handoff](#ralph-handoff) tragen den Zustand über Runden hinweg. <a id="ralph-round"></a>
- **Ralph handoff** (Ralph-Handoff) — der normalisierte, begrenzte strukturierte Bericht, der von einer fortlaufenden Ralph-Runde an die nächste übergeben wird und Status, Zusammenfassung, Belege, nächste Schritte und Blocker-Text enthält. Er ergänzt den geteilten Workspace, statt ihn als Autorität zu ersetzen. <a id="ralph-handoff"></a>
