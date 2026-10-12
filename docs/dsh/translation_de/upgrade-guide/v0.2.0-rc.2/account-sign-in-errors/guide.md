---
kind: upgrade-guide
description: "Transportfehler bei der Kontoanmeldung melden jetzt no-response statt network."
---

# Fehlercodes der Kontoanmeldung

English | [中文](guide.zh.md)

## Änderung

`SignInErrorCode` ergänzt `no-response`. Der von `account/getState`, `account/startSignIn` und `account/watch` zurückgegebene Kontozustand meldet diesen Code, wenn fetch fehlschlägt, bevor eine Response zurückkommt, einschließlich Anfrage-Timeouts. Diese Fehler meldeten zuvor `network`. HTTP-Response-Fehler melden weiterhin `network`; der Ablauf eines Autorisierungsversuchs meldet weiterhin `expired`.

## Migration

1. `no-response` zu Validatoren und erschöpfenden Handlern für `SignInAttemptView.errorCode` in Clients der Konto-API oder von `@deepseek-ai/dsh-deepseek-account` hinzufügen.
2. Für `no-response` eine Netzwerk-Fehlerbehebung anzeigen. Für `network` die generische Fehlerbehandlung beibehalten, die auch HTTP- und Fehler beim Abrufen der Kontodetails abdeckt.
3. Bestätigen, dass ein fehlgeschlagener Login mit `errorCode: 'no-response'` vom Client akzeptiert wird und einen erneuten Versuch anbietet, während eine HTTP-Fehlerantwort die generische Fehlerbehandlung behält.
