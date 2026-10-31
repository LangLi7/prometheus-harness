# Belegte Erfahrungsberichte und Zahlen zur Wahl von Programmiersprachen in großen Systemen

**Recherchestand:** alle Quellen wurden in dieser Sitzung tatsächlich abgerufen (Scrape/Suche). Jede Zahl trägt eine abgerufene URL. Wo eine berühmte Zahl **nicht** verifizierbar war, steht das ausdrücklich dabei.

**Quellen-Typen** werden durchgängig markiert:
`[Firmen-Blog]` · `[Offizielle Doku/Projekt]` · `[Nachrichtenartikel]` · `[Forenkommentar]` · `[Benchmark]` · `[Issue-Tracker]` · `[Enzyklopädie]` · `[Meinungsartikel ohne Zahlen]`

---

## 0. Fünf Vorab-Korrekturen (wichtig für die Zuverlässigkeit des Rests)

1. **Discord veröffentlicht im Blogpost KEINE p99-Zahlen als Text.** Die Zahlen stecken ausschließlich in vier eingebetteten Bildern, deren Inhalte beim Abruf nicht als Text vorlagen. Was als Text existiert, ist unten wörtlich zitiert. **Jede p99-Zahl, die im Umlauf ist, ist aus diesem Post nicht belegbar.**
2. **Dropbox: Der Post ist von März 2020, nicht 2016.** 2016 ist nur der Projektstart ("Over the past four years…"). Und: **der Post enthält praktisch keine Leistungszahlen.**
3. **Android 76 % → 24 % ist verifiziert** — aber am 2024er-Post, nicht am 2022er-Post (der sagt 76 % → 35 %).
4. **TechEmpower war nicht abrufbar.** `techempower.com/benchmarks/` lieferte bei jedem Versuch (3 Anläufe, verschiedene URLs) "All scraping engines failed". Ich habe dort **keine** Zahlen gelesen und zitiere folglich **keine**. Ersatzquelle mit echten Zahlen: Benchmarks Game (§A4).
5. **Der Cloudflare-Pingora-Gewinn kam nicht von der Sprache**, sondern von der Architektur — Cloudflare schreibt das selbst.

---

# A) Sprachwahl nach Aufgabe

## A1. TypeScript / Node.js — was belegbar geht und was nicht

### Event-Loop-Blockierung: offizielle, normative Aussagen

`[Offizielle Doku]` Node.js, *Don't Block the Event Loop (or the Worker Pool)* — <https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop>

Wörtlich:

> „Here's a good rule of thumb for keeping your Node.js server speedy: *Node.js is fast when the work associated with each client at any given time is \"small\"*."

> „if the Event Loop spends too long at any point, all current and new clients will not get a turn"

> „Node.js excels for I/O-bound work, but for expensive computation it might not be the best option."

> „You should *not* simply create a Child Process for every client. You can receive client requests more quickly than you can create and manage children, and your server might become a fork bomb."

**Konkrete Messwerte aus derselben Doku** (Node.js eigene Messung, kein Fremdbenchmark):

> „We create an object `obj` of size 2^21 and `JSON.stringify` it, run `indexOf` on the string, and then JSON.parse it. The `JSON.stringify`'d string is 50MB. It takes 0.7 seconds to stringify the object, 0.03 seconds to indexOf on the 50MB string, and 1.3 seconds to parse the string."

→ 0,7 s Stringify + 1,3 s Parse = **~2 s blockierter Event Loop** bei 50 MB JSON. Das ist die härteste Zahl, die ich für „JSON blockiert Node" gefunden habe — und sie stammt von Node.js selbst.

Weitere belegte Aussage derselben Doku zur Architektur-Ursache:

> „Because Node.js handles many clients with few threads, if a thread blocks handling one client's request, then pending client requests may not get a turn until the thread finishes its callback or task. *The fair treatment of clients is thus the responsibility of your application*."

Und zum DoS-Risiko (Sicherheit, nicht nur Performance):

> „Security: If it is possible that for certain input one of your threads might block, a malicious client could submit this \"evil input\", make your threads block, and keep them from working on other clients. This would be a Denial of Service attack."

Benannte Fallen: REDOS (nested quantifiers, Backreferences), synchrone Core-APIs (`crypto.randomBytes`, `zlib.inflateSync`, `fs.*Sync`, `child_process.spawnSync/execSync`), `/dev/random` als Task-Längen-Ausreißer.

### Worker Threads: wofür sie taugen — und wofür nicht

`[Offizielle Doku]` Node.js, *Worker threads* — <https://nodejs.org/api/worker_threads.html>

> „Workers (threads) are useful for performing CPU-intensive JavaScript operations. They do not help much with I/O-intensive work. The Node.js built-in asynchronous I/O operations are more efficient than Workers can be."

> „Unlike `child_process` or `cluster`, `worker_threads` can share memory. They do so by transferring `ArrayBuffer` instances or sharing `SharedArrayBuffer` instances."

> „In practice, use a pool of Workers for these kinds of tasks. Otherwise, the overhead of creating Workers would likely exceed their benefit."

### Der bezifferte Preis des Auslagerns

Dieselbe Doku benennt die Kosten des Offloadings ausdrücklich — und **ohne** Zahl:

> „The downside of the offloading approach is that it incurs overhead in the form of *communication costs*. Only the Event Loop is allowed to see the \"namespace\" (JavaScript state) of your application. From a Worker, you cannot manipulate a JavaScript object in the Event Loop's namespace. Instead, you have to serialize and deserialize any objects you wish to share."

> „For simple tasks … partitioning might be a good option. If your computation is more complex, offloading is a better approach: the communication costs … are offset by the benefit of using multiple cores."

**Fazit A1 (belegt):** Node/TS ist belegbar gut für I/O-lastige Nebenläufigkeit mit vielen Clients und wenig Arbeit pro Client. Es ist belegbar schlecht für CPU-lastige Arbeit im Main-Thread (Event-Loop-Blockierung → Latenz für *alle* Clients, plus DoS-Angriffsfläche) und für Prozess-pro-Client-Modelle (Fork-Bomb-Warnung). Es gibt eine belegte Größenordnung ab der JSON weh tut: **50 MB → ~2 s**.

---

## A2. Go — was offiziell belegt ist

`[Offizielle Projekt-Website]` <https://go.dev/> — Selbstbeschreibung (Marketing, aber offizielle Position):

> „Build simple, secure, scalable systems with Go"
> „Built-in concurrency and a robust standard library"
> „Easy to learn and great for teams"

**Belegte Nutzungsdomänen laut go.dev:** Cloud & Network Services, Command-line Interfaces, Web Development, DevOps & Site Reliability. Als Nutzer gelistet: Google, PayPal, American Express, MercadoLibre, Bitly, Capital One, Cockroach Labs, Dropbox, Cloudflare, Meta, Microsoft, Netflix, Riot Games, Salesforce, Twitch, Uber, X.

**Zahlen auf go.dev** (Achtung: das sind **Anbieter-Testimonials**, keine kontrollierten Messungen):

| Aussage | Zitat | Person/Organisation |
|---|---|---|
| Compile-Geschwindigkeit | „A small language that compiles fast makes for a happy developer. The Go language is small, compiles really fast, and as a result it lets your mind focus on the actual problem… Code, test, debug cycles are so quick that you forget you are not working with an interpreted language." | Clayton Coleman, Lead Engineer OpenShift, Red Hat |
| Speicher/Deployment | „Go has excellent characteristics for scalability and services written using it typically have very small memory footprints. Because code is compiled into a single static binary, services can also be containerised with ease… Go an ideal choice for companies building microservices" | Matt Boyle, Lead Software Engineer, Curve |
| **CPU-Ersparnis: ~10 %** | „In our tightly managed environments where we run Go code, we have seen a CPU reduction of approximately 10% with cleaner and maintainable code." | Bala Natarajan, Sr. Director of Engineering, PayPal |
| Einarbeitungszeit **1 Monat** | „At the time, no single team member knew Go, but within a month, everyone was writing in Go and we were building out the endpoints." | Jaime Enrique Garcia Lopez, Senior Software Development Manager, Capital One |

Go.dev verlinkt außerdem Twitchs „Go's march to low-latency GC" als Referenzfall für Latenz-GC — <https://go.dev/> (Linkliste) → Ziel: `blog.twitch.tv` 2016.

**Unabhängige Compile-Zeit-Zahl** (siehe A4): Im Benchmarks-Game-Steckbrief liegt die Spalte `make` (compile+link des jeweiligen Programms) für Go durchweg bei **5,1–6,2 s**, für Rust bei **10,1–14,4 s**.

**Fazit A2 (belegt):** Go ist offiziell positioniert und firmenseitig belegt für Netzwerkdienste, Nebenläufigkeit, statische Binaries, schnelle Compiles und niedrige Einarbeitungsbarriere. Die **einzige harte, quantifizierte Firmenzahl** ist PayPals ~10 % CPU-Reduktion — als Eigenangabe ohne Methodik.

---

## A3. Rust — was offiziell belegt ist

`[Offizielle Projekt-Website]` <https://www.rust-lang.org/>:

> „**Performance** — Rust is blazingly fast and memory-efficient: with no runtime or garbage collector, it can power performance-critical services, run on embedded devices, and easily integrate with other languages."

> „**Reliability** — Rust's rich type system and ownership model guarantee memory-safety and thread-safety — enabling you to eliminate many classes of bugs at compile-time."

`[Offizielle Doku]` The Rust Programming Language, Introduction — <https://doc.rust-lang.org/book/ch00-00-introduction.html>:

> „In Rust, the compiler plays a gatekeeper role by refusing to compile code with these elusive bugs, including concurrency bugs."

> „By striving for zero-cost abstractions—higher-level features that compile to lower-level code as fast as code written manually—Rust endeavors to make safe code be fast code as well."

> „Hundreds of companies, large and small, use Rust in production for a variety of tasks, including command line tools, web services, DevOps tooling, embedded devices, audio and video transcoding, cryptocurrencies, bioinformatics, search engines, Internet of Things applications, machine learning, and even major parts of the Firefox web browser."

**Explizite Einschränkung des Sicherheitsversprechens:** Der Discord-Post zitiert rust-lang.org und ergänzt selbst in Fußnote 4: „Unless, of course, you use **unsafe**." — <https://discord.com/blog/why-discord-is-switching-from-go-to-rust>

**Fazit A3:** „Kein GC / keine Runtime", „Speichersicherheit zur Compile-Zeit", „zero-cost abstractions", „FFI-freundlich" (LLVM-Backend; Figma ruft direkt eine C-Bibliothek auf, s. B3) sind **offiziell belegte Selbstbeschreibungen**. Der Secureheitsanspruch gilt **nicht** für `unsafe`-Blöcke — und der erste Kernel-CVE in Rust-Code kam genau aus einem `unsafe`-Block (s. B6).

---

## A4. Benchmarks mit konkreten Zahlen: Go vs. Rust

`[Benchmark]` **Benchmarks Game, „Rust versus Go"** — <https://benchmarksgame-team.pages.debian.net/benchmarksgame/fastest/rust-go.html>
Toolchain laut Fußzeile der Seite: **Rust 1.84.1 (LLVM 19.1.5)** vs. **go1.23.1 linux/amd64, GOAMD64=v2**.

| Benchmark | Rust (beste) | Go (beste) | Faktor (gerundet, eigene Rechnung) |
|---|---|---|---|
| binary-trees (elapsed s) | 1,07 | 27,93 (Go #6) / 14,21 (Go #2) | ~13× vs. Go #6, ~13× vs. Go #2 bzgl. elapsed |
| spectral-norm | 0,72 | 5,34 | ~7,4× |
| n-body | 2,19 | 6,39 | ~2,9× |
| fannkuch-redux | 3,81 | 8,36 | ~2,2× |
| mandelbrot | 0,95 | 3,77 | ~4,0× |
| k-nucleotide | 2,57 | 7,58 | ~2,9× |
| reverse-complement | 0,55 | 1,93 | ~3,5× |
| pidigits *(contentious)* | 0,71 | 0,82 | ~1,2× |
| regex-redux *(contentious)* | 1,21 | 3,23 | ~2,7× |
| **`make` (Compile) Spannweite** | **10,10–14,41 s** | **5,11–6,20 s** | **Go ~2× schneller** |

**Zwingende Einschränkungen, die auf der Seite selbst stehen:**

> „How the programs are written matters! Always look at the source code."
> „If the fastest programs are flagged \* *possible hand-written vector instructions or \"unsafe\" or naked ffi*, does the host language matter?"

Tatsächlich sind die Rust-Sieger in `fannkuch-redux` (#6), `n-body` (#9), `spectral-norm` (#2), `revcomp` (#1), `pidigits` (#1–#3) **alle** mit `*` markiert. Der Vergleich ist also **nicht** „idiomatisches Rust vs. idiomatisches Go", sondern „handoptimiertes Rust vs. handoptimiertes Go". Zwei Benchmarks sind ausdrücklich als „Contentious. Different approaches/libraries." markiert. Rust-Binaries brauchen in diesem Datensatz durchweg **~2× länger zum Bauen**.

*Nicht belegt / nicht abgerufen:* **TechEmpower Framework Benchmarks.** Drei Abrufversuche (`/benchmarks/`, `#section=data-r22`, `#section=data-r23`) schlugen fehl („All scraping engines failed"). Es liegen mir **keine** TechEmpower-Zahlen vor; die in Suchtreffern auftauchenden Fragmente („all 331 frameworks", „523 tests") sind Beschreibungs-Text, keine Messwerte, und ich zitiere sie nicht als Zahlen.

---

# B) Kosten einer Sprachgrenze — die Zahlen

## B1. Discord: Go → Rust (Read States Service)

`[Firmen-Blog]` Jesse Howarth, *Why Discord is switching from Go to Rust*, 4. Februar 2020 — <https://discord.com/blog/why-discord-is-switching-from-go-to-rust>

### Was der Post an Zahlen **als Text** enthält

| Größe | Wörtliches Zitat | Anmerkung |
|---|---|---|
| Datenmenge | „Discord has billions of Read States. There is one Read State per User per Channel." | — |
| Cache | „There are millions of Users in each cache. There are tens of millions of Read States in each cache. There are hundreds of thousands of cache updates per second." | — |
| DB-Last | „There are tens of thousands of database writes per second." | — |
| Spike-Frequenz | „there are latency and CPU spikes roughly every 2 minutes" | — |
| Go-GC-Ursache | „we learned that Go will force a garbage collection run every **2 minutes at minimum**" (mit Link in den Go-Quellcode) | verlinkt `runtime/proc.go` |
| Cache-Kapazität nach Rust | „**increased the cache capacity to 8 million Read States**" | — |
| Ergebnis-Charakter | „**Notice the average time is now measured in microseconds and max @mention is measured in milliseconds.**" | keine konkreten Werte |
| Ergebnis-Pauschal | „**we were able to beat Go on every single performance metric**. Latency, CPU, and memory were all better in the Rust version." | keine konkreten Werte |
| Ohne Spikes | „The latency of the Rust version was just as good as Go's and **had no latency spikes**!" | — |
| Version | Fußnote 1: „Go version 1.9.2. Edit: Graphs are from 1.9.2. We tried versions 1.8, 1.9, and 1.10 without any improvement." | wichtig: **Go 1.9**, von 2017 |
| Eigenes Caveat | Fußnote 2: „**To be clear, we don't think you should rewrite everything in rust just because.**" | — |

### ⚠️ Was **nicht** belegbar ist

> **p99-Werte, GC-Pausen-Dauern in ms und konkrete Speicherverbrauchszahlen sind im Discord-Post nicht als Text enthalten — sie stehen in vier Bildern, die beim Abruf nicht als Text vorlagen. Ich habe deshalb KEINE p99-Zahl extrahiert. Wer p99-Zahlen für diesen Fall nennt, muss eine andere Quelle haben als den Blogpost selbst.**

**Wichtig zum Tuning-Vorwurf:** Der Post sagt selbst, dass Discord **versucht hat zu tunen**:

> „We figured we could tune the garbage collector to happen more often in order to prevent large spikes, so we implemented an endpoint on the service to change the garbage collector GC Percent on the fly. **Unfortunately, no matter how we configured the GC percent nothing changed.** How could that be? It turns out, it was because we were not allocating memory quickly enough for it to force garbage collection to happen more often."

> „We kept digging and learned the spikes were huge not because of a massive amount of ready-to-free memory, but because the garbage collector needed to **scan the entire LRU cache** in order to determine if the memory was truly free from references."

Auch der Cache-Größen-Trade-off steht drin: kleinere LRU → kleinere Spikes, **aber** „the trade off of making the LRU cache smaller resulted in higher 99th latency times".

### Kritik / Follow-ups

`[Forenkommentar]` Hacker News, Thread *Why Discord is switching from Go to Rust* — <https://news.ycombinator.com/item?id=22238335>
Retrieved via Algolia API: **1582 Punkte, 642 Kommentare**, erstellt 2020-02-04. Der Post wurde danach noch mehrfach erneut eingereicht (u. a. 2021: 232 Punkte/264 Kommentare; 2022: 77/59; 2023: 24/5).

Abrufbar über die Algolia-API: <https://hn.algolia.com/api/v1/search?tags=comment,story_22238335&query=GC%20tuning%20problem>

Die beiden substanziellsten Kommentare zum Tuning-Vorwurf:

> „Finding out if that does resolve the author's issue would be interesting but I'm not sure that that would be particularly supportive data in favor of Go. **If anything it would reinforce the downsides of Go's GC implementation: prone sudden pitfalls only avoidable with obtuse, error-prone fiddling** that makes the code more complex. After spending weeks fighting with Java's GC tuning for a similar production service tail latency problem, I wouldn't want to be caught having to do that again." — Nutzer `jasondclinton`

> „I think the bigger problem with Go is a **lack of GC options**. Java, on the other end of the spectrum has multiple GC algorithms (i.e. the Z garbage collector, Shenandoah, Garbage-First/G1) each with tunables… **Go's philosophy on the matter seems to be that the programmer shouldn't have to worry about such details (and GC tunables are hard to test). Which is great, until the programmer does have to worry about them.**" — Nutzer `correct_horse`

**Einordnung:** Das sind **Forenkommentare**, keine Studien und keine offizielle Go-Position. Ich habe **keinen** kritischen Fachartikel gefunden, der den Discord-Post methodisch widerlegt. Der Tuning-Vorwurf ist inhaltlich dadurch entkräftet, dass Discord explizit dokumentiert, `SetGCPercent` erfolglos variiert zu haben — was den Vorwurf eher auf „Go bietet zu wenig GC-Stellschrauben" verschiebt.

**Was Discord nicht tat:** Der Post liefert kein Vorher/Nachher von Request-Raten, keine Kostenrechnung, keine Personalkosten — der „Preis der Sprachgrenze" bleibt unbelegt.

---

## B2. Dropbox: Nucleus (Rust statt Python)

`[Firmen-Blog]` Sujay Jayakar, *Rewriting the heart of our sync engine*, **9. März 2020** — <https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine>

**Zahlen im Post:**

| Größe | Zitat | Typ |
|---|---|---|
| Projektlaufzeit | „Over the past four years, we've been working hard on rebuilding our desktop client's sync engine from scratch." | Dauer |
| Datenmaßstab | „Dropbox has hundreds of billions of files, trillions of file revisions, and exabytes of customer data… hundreds of millions of devices" | Kontext |
| **Einarbeitungszeit** | „**Even though we had a strong team of experts, onboarding new engineers to the system took years.**" | **Kosten der Altsystem-Grenze** |
| Testvolumen | „We run **millions of scenarios every day** in our testing infrastructure." | — |
| Ergebnis | „Rust has been a force multiplier for our team, and **betting on Rust was one of the best decisions we made**. **More than performance, its ergonomics and focus on correctness** has helped us tame sync's complexity." | **qualitativ, keine Zahl** |
| Nebenläufigkeitsmodell | „Almost all of our code runs on a single thread (the \"Control thread\") and uses Rust's futures library… This drastically reduces the scope and complexity developers must consider when adding new features." | Architektur |

**Explizit negativ (kein Erfolg bei Performance-Ziel):**

> „Finally, we poured time into incremental performance wins but **failed to appreciably scale the total number of files the sync engine could manage**."

**Explizit die Kosten des Rewrites:**

> „Joel Spolsky called rewriting code from scratch the '*single worst strategic mistake that any software company can make.*' Successfully pulling off a rewrite often requires slowing feature development, since progress made on the old system needs to be ported over to the new one."

**⚠️ Nicht belegt:** Es gibt in diesem Post **keine** Zahl zu Sync-Geschwindigkeit, Speicherverbrauch, Dateianzahl-Skalierung oder Kosten. Der Konferenzvortrag (QCon/SreCon o. ä.) wurde von mir **nicht** gefunden/abgerufen. Wer „Dropbox Nucleus x-fach schneller" behauptet, hat dafür in diesem Post **keine** Grundlage.

**Die einzige harte Zahl** ist die Einarbeitungszeit: **Jahre** für neue Ingenieure im Altsystem. Das ist ein Beleg dafür, dass Wartungskosten real und groß sein können — aber keine Erfolgszahl für Rust.

**Korrektur zum Auftrag:** Der Post ist von 2020, nicht 2016.

---

## B3. Figma: Rust im Multiplayer-Server (kein WASM)

`[Firmen-Blog]` Evan Wallace, *Rust in production at Figma*, 2. Mai 2018 — <https://www.figma.com/blog/rust-in-production-at-figma/>

**Zahlen im Post:**

| Größe | Wörtliches Zitat |
|---|---|
| **Serialisierung** | „And **serialization time is now over 10x faster** so the service is now acceptably fast even in the worst case." |
| **Gesamtperformance** | „It enabled us to improve server-side multiplayer editing performance **by an order of magnitude**" |
| **Speicher/PROZESS** | „It uses so little memory compared to the old system that **we can afford to fully parallelize all documents by just using a separate child process per document**." |
| Warum kein Node-Prozess je Dokument | „we couldn't just create a separate node.js process for every document because **the memory overhead of the JavaScript VM would have been too high**" |
| Ursache | „The main problem with the old server was the **unpredictable latency spikes** during syncing. The server was written in TypeScript and, **being single-threaded, couldn't process operations in parallel**. That meant a **single slow operation would lock up the entire worker**… Users connected to that worker would be unable to sync their changes in the meantime." |
| Ursache (GC) | „Low resource usage was particularly important to us because **some of the performance issues with the old server were caused by the garbage collector**." |

**Die entscheidende, oft übersehene Aussage — Figma hat den Rewrite-ZUGE verkleinert:**

> „As a result, **we dropped our initial plan to rewrite our whole server in Rust and chose to focus solely on the performance-sensitive part instead.**"

> „Instead of going all-in on Rust, we decided to **keep the network handling in node.js for now**. The node.js process creates a separate Rust child process per document and communicates with it using a message-based protocol over stdin and stdout."

**Belegte Kons des Rust-Einsatzes (2018):** Lifetimes/borrow-checker-Reibung, `Result` ohne Stack-Trace, „Many libraries are still early" (zwei Rust-Kompressionsbibliotheken hatten Korrektheitsfehler „that would have resulted in data loss" → **Rückgriff auf eine C-Bibliothek**), async-Rust unbrauchbar → Netzwerk blieb in Node.

**IPC-Modell:** stdin/stdout-Nachrichtenprotokoll (ein Serialisierungspreis, der in Kauf genommen wurde).
**⚠️ Nicht extrahierbar:** Die konkreten Zahlen der „numeric changes in peak metrics" stehen nur in einem Bild.

**Zum WASM-Teil der Frage:** Ich habe **keinen** Figma-Post mit WASM-Zahlen abgerufen. Der oben zitierte Post ist Rust-im-Server, **nicht** Rust/WASM. **Figma-WASM-Zahlen: nicht belegt.**

---

## B4. Cloudflare: Pingora

`[Firmen-Blog]` *How we built Pingora, the proxy that connects Cloudflare to the Internet*, 14. September 2022 — <https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/>

**Alle Zahlen:**

| Größe | Wörtliches Zitat |
|---|---|
| Volumen | „serves over **1 trillion requests a day**" / „we've served **a few hundred trillion requests**" |
| Ressourcen | „all while requiring only **a third of the CPU and memory resources** of our previous proxy infrastructure" |
| Präzisiert | „Pingora consumes about **70% less CPU and 67% less memory** compared to our old service with the same traffic load." |
| TTFB | „Pingora shows **5ms reduction on median TTFB and 80ms reduction on the 95th percentile**." |
| Verbindungs-Wiederverwendung | „For one major customer, it increased the connection reuse ratio from **87.1% to 99.92%**, which reduced new connections to their origins by **160x**." |
| Handshake-Zeit | „by switching to Pingora, we save our customers and users **434 years of handshake time every day**." |
| Neue Verbindungen | „Pingora makes only a **third as many new connections per second** compared to the old service." |
| Stabilität | „Since Pingora's inception we've served a few hundred trillion requests and **have yet to crash due to our service code**." |

### 🔴 Die wichtigste Aussage für die Sprachwahl-Frage

> „**This is not because we run code faster. Even our old service could handle requests in the sub-millisecond range.**"
> „The savings come from our new architecture which can share connections across all threads."

**Begründungen für Rust (wörtlich):**

> „We chose Rust as the language of the project because **it can do what C can do in a memory safe way without compromising performance**."
> „NGINX is purely in C, **which is not memory safe by design**. It is very error-prone to work with such a 3rd party code base."
> „The other language we used to complement C is Lua. It is less risky but also less performant. In addition, we often found ourselves missing static typing…"
> „We chose **multithreading over multiprocessing** in order to share resources, especially connection pools, easily."
> „**We evaluated each of these options every quarter for the past few years. There is no obvious formula to tell which choice is the best.**"

**Fazit B4:** Cloudflare liefert die vollständigste Zahlenkette aller Fälle — aber **die Performancegewinne sind Architektur, nicht Sprache** (eigene Aussage). Der Sprachwechsel C/Lua → Rust wird mit **Memory Safety + static typing + Threading-Modell** begründet, nicht mit Rohgeschwindigkeit. Das ist ein ehrliches, gut belegtes Beispiel.

---

## B5. Chromium: Stand der Rust-Einführung, Memory-Safety-Bugs

`[Offizielles Projekt-Dokument]` *Memory safety* — <https://www.chromium.org/Home/chromium-security/memory-safety/>

> „The Chromium project finds that **around 70% of our serious security bugs are memory safety problems**. Our next major project is to prevent such bugs at source."

> „Around **70% of our high severity security bugs** are memory unsafety problems (that is, mistakes with C/C++ pointers). **Half of those are use-after-free bugs.**"

> „(Analysis based on **912 high or critical severity security bugs since 2015**, affecting the Stable channel.)"

**Belegte Zahlen in dieser 912er-Analyse:** 70 % Memory Unsafety, davon 50 % Use-after-Free → **~35 % aller High/Critical-Bugs = Use-after-Free** (eigene Rechnung aus den beiden genannten Zahlen).

**Belegte Aussage zu den Grenzen des Sandboxings:**

> „A key limitation is that **the process is the smallest unit of isolation, but processes are not cheap.** Especially on Android, using more processes impacts device health overall"
> „our insistence on the Rule Of 2 is **preventing Chrome developers from shipping features**, as it's already sometimes just too expensive to start a new process to handle untrustworthy data."

`[Offizielles Projekt-Dokument]` *Rust and C++ interoperability* (Aug 2020, Update Sept 2021) — <https://www.chromium.org/Home/chromium-security/memory-safety/rust-and-c-interoperability/>

**Die belegte Kostenseite einer zusätzlichen Sprache** — Chromium rechnet sie an echten Zahlen durch:

> „If we can't solve these, Rust would at best be isolated to \"leaf nodes\" which don't interact much with the rest of our codebase. And if that's all we can use Rust for, **that calls into question whether the costs of an extra language are justified in the first place.**"

> „Our \"base\" library exposes **1768 APIs** which are used by other parts of Chrome. **1052 of those functions** only take parameters which are types that can already be supported by cxx. 12 more are planned… That's **~60% of our APIs**, which is good but not great. Another **12%** can be supported if we are able to pass std::string… Another **~20%** are functions which take pointer parameters… The good news is that this leaves **just 8% of our functions which can't be supported** by the cxx model."

> „For now, Chrome investment in Rust will remain **a background investigation**."

> „**and any use of Rust will need to fit in with C++ — not the other way around**"

**Unabhängige, aktuelle Zahl aus dem Android-Kontext in derselben Quelle:**

> „after removing the now unnecessary sandbox, **Chromium's Rust QR code generator is 20 times faster.**"
> — zitiert im Google Security Blog 2024, `[Firmen-Blog]` — <https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html>

**Fazit B5:** Chromiums Zahlen belegen (a) die Größe des Problems (70 % der schweren Bugs), (b) dass die Einführung von Rust in einem C++-Monolithen **hart durch die Interop-Grenze begrenzt** ist (nur ~8 % der APIs sind nicht abbildbar, aber 20 % Pointer-Parameter + Overloads + Templates sind das eigentliche Hemmnis), und (c) dass **die „Kosten einer zusätzlichen Sprache" von Chromium explizit als offene Frage formuliert wurden**, bevor Rust als „first-class citizen" zugelassen wurde. Es gibt **keine** veröffentlichte Chromium-Zahl, wie viele Memory-Safety-Bugs seit der Rust-Einführung tatsächlich weggefallen sind.

---

## B6. Microsoft und Google: „70 % der CVEs sind Memory-Safety"

### Microsoft (2019)

`[Nachrichtenartikel]` ZDNet, Catalin Cimpanu, 11. Februar 2019 — <https://www.zdnet.com/article/microsoft-70-percent-of-all-security-bugs-are-memory-safety-issues/>

> „Around **70 percent of all the vulnerabilities in Microsoft products addressed through a security update each year are memory safety issues**; a Microsoft engineer revealed last week at a security conference."

> „Speaking at the **BlueHat security conference in Israel** last week, Microsoft security engineer **Matt Miller** said that **over the last 12 years, around 70 percent of all Microsoft patches were fixes for memory safety bugs.**"

**Quellenkritik:** Das ist ein **Nachrichtenartikel über einen Konferenzvortrag**. Die Primärquelle (Matt Millers Folien, MSRC-Security-Research auf GitHub) wurde von mir **nicht** abgerufen. Die Zahl ist also **sekundär belegt**, nicht primär. Die Formulierung „70 % der CVEs" ist eine **Vereinfachung**: die Quelle sagt „70 % der gepatchten Vulnerabilities" bzw. „70 % aller Patches über 12 Jahre".

### Google / Android (2022 und 2024)

`[Firmen-Blog]` Jeff Vander Stoep, *Memory Safe Languages in Android 13*, 1. Dezember 2022 — <https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html>

| Größe | Wörtliches Zitat |
|---|---|
| Industrie-Baseline | „For more than a decade, memory safety vulnerabilities have consistently represented **more than 65% of vulnerabilities** across products, and across the industry" |
| Absolute Zahl | „From 2019 to 2022 the annual number of memory safety vulnerabilities **dropped from 223 down to 85**." |
| Prozentual | „From 2019 to 2022 it has **dropped from 76% down to 35%** of Android's total vulnerabilities. **2022 is the first year where memory safety vulnerabilities do not represent a majority of Android's vulnerabilities**." |
| Rust-Anteil neuer Code | „In Android 13, **about 21% of all new native code (C/C++/Rust) is in Rust**." |
| Rust-Volumen | „approximately **1.5 million total lines of Rust code in AOSP**" |
| **Rust-Bugs** | „**To date, there have been zero memory safety vulnerabilities discovered in Android's Rust code.**" |
| Historische Dichte | „Historical vulnerability density is **greater than 1/kLOC** (1 vulnerability per thousand lines of code) in many of Android's C/C++ components" |
| Schweregrad | „In 2022, despite only representing 36% of vulnerabilities in the security bulletin, memory-safety vulnerabilities accounted for **86% of our critical severity security vulnerabilities**… and **89% of our remotely exploitable vulnerabilities**." |
| Exploits | „Over the past few years, memory safety vulnerabilities have accounted for **78% of confirmed exploited \"in-the-wild\" vulnerabilities on Android devices**." |
| Programmstart | „**Android 13 is the first Android release where a majority of new code added to the release is in a memory safe language**." |

**Eigene Kausalitäts-Einschränkung:** „**While correlation doesn't necessarily mean causation**, it's interesting to note that the percent of vulnerabilities caused by memory safety issues seems to correlate rather closely with the development language that's used for new code."

`[Firmen-Blog]` Jeff Vander Stoep & Alex Rebert, *Eliminating Memory Safety Vulnerabilities at the Source*, 25. September 2024 — <https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html>

### ✅ Die 76-%-→-24-%-Zahl ist verifiziert

> „We'll also share updated data on how the percentage of memory safety vulnerabilities in Android **dropped from 76% to 24% over 6 years** as development shifted to memory safe languages."

> „Memory safety issues, which accounted for **76% of Android vulnerabilities in 2019, and are currently 24% in 2024, well below the 70% industry norm**, and continuing to drop."

**Die Formulierung „76 % auf 24 % gesunken" ist also korrekt.** Präzisierung: es sind **6 Jahre**, und der Ausgangswert 76 % bezieht sich auf 2019.

**Weitere harte Zahlen aus dem 2024er-Post:**

| Größe | Wörtliches Zitat |
|---|---|
| Absolute Zahl 2024 | „Note that the data for 2024 is extrapolated to the full year (represented as **36**, but currently at **27** after the September security bulletin)" |
| **Rollback-Rate Rust vs. C++** | „The Android team has observed that the **rollback rate of Rust changes is less than half that of C++**." |
| Altcode ist besser als Neu-Code | „based on the average vulnerability lifetimes, **5-year-old code has a 3.4x … to 7.4x … lower vulnerability density than new code**" |
| Vulnerabilitäts-Halbwertszeit | „the average lifetime for vulnerabilities is **2.5 years**" + „Code matures and gets safer with time, exponentially, **making the returns on investments like rewrites diminish over time** as code gets older" |
| Simulationsparameter | „The code base doubles every 6 years. The average lifetime for vulnerabilities is 2.5 years. It takes 10 years to transition to memory safe languages for new code" |
| Interop statt Rewrite | „**Interoperability is the new rewrite**… we do not need to throw away or rewrite all our existing memory-unsafe code." |

**Die wichtigste strategische Aussage (von Google selbst, gegen naive Rewrites):**

> „This confirms and generalizes our observation… that the density of Android's memory safety bugs decreased with the age of the code, primarily residing in recent changes. This leads to two important takeaways: **The problem is overwhelmingly with new code**… **Code matures and gets safer with time, exponentially, making the returns on investments like rewrites diminish over time as code gets older.**"

**Einordnung:** Die 70-%-Zahl (Microsoft, 2019, sekundär belegt) und die 65-%-Zahl (Google, 2022) sind unabhängig voneinander und stützen sich gegenseitig. „70 % der CVEs" ist eine zulässige Kurzformel, aber beide Quellen sprechen von **schweren/gepatchten Vulnerabilities**, nicht von allen CVEs.

---

## B7. Linux-Kernel: belegter Stand (bis Dez. 2025 / 2026) und Kritik

`[Enzyklopädie]` Wikipedia, *Rust for Linux* — <https://en.wikipedia.org/wiki/Rust_for_Linux>

Chronologie laut dieser Quelle (mit jeweils dortiger Primär-Referenz):

| Zeitpunkt | Ereignis |
|---|---|
| 2020 | Projektankündigung auf der Linux-Kernel-Mailingliste |
| Okt. 2022 / Linux 6.1 | Rust-Grundgerüst akzeptiert, „support was intentionally left minimal" |
| Linux 6.4 | `pinned-init`-Bibliothek |
| **Linux 6.8** | **„In December 2023, the first drivers written in Rust were accepted, and released in kernel version 6.8."** |
| Linux 6.10 | RISC-V-Unterstützung für Rust |
| Juli 2024 | Unterstützung für mehrere Rust-Versionen (1.78 und 1.79) |
| Aug. 2024 | „Rust for Linux depends on **unstable features** of the Rust compiler." |
| **Dez. 2025** | **Linux Kernel Developers Summit: „it was decided to promote Rust from experimental to a core part of the kernel. This expands the core languages in the Linux kernel to C, assembly and Rust."** |
| Offen | „Progress has been slower than hoped by both Rust advocates and Linus Torvalds, lead of the Linux kernel project." |

`[Nachrichtenartikel]` heise online, Thorsten Leemhuis, 10. Dezember 2025 — <https://www.heise.de/en/news/Linux-Kernel-Rust-Support-Officially-Approved-11109808.html>

> „Rust is set to shed its \"experimental phase\" classification in Linux, thereby becoming a **fully-fledged language for kernel programming**. This was decided yesterday by key Linux developers, including Linus Torvalds, at the annual Kernel Maintainers Summit" (verweist auf LWN.net/Articles/1049831)

> „Practically speaking, Rust is thus rising to become the **third most important language** in the development of the Linux kernel, alongside assembler and C. **However, this by no means implies that programmers can now immediately write any kernel driver in Rust: many subsystems still lack bridging code (bindings).**"

> „**Three-Year Experiment Successfully Completed** — The first parts of Rust support were added after extensive preparatory work three years ago in Linux 6.1."

**Was Rust im Kernel laut Wikipedia konkret ist:** Android-Binder-IPC-Treiber, rnull, ASIX AX88772A + Realtek PHY-Netzwerktreiber, DRM-Panic-Handler (QR-Code), plus tarfs, NVMe-Treiber, Asahi-AGX-GPU-DRM-Treiber, PuzzleFS, Read-only-ext2, Nova (Nvidia).

### Kritik — DMA-Mapping-Streit und Hellwig-Rücktritt

`[Nachrichtenartikel]` Phoronix, Michael Larabel, 25. Februar 2025 — <https://www.phoronix.com/news/Hellwig-DMA-Helpers-Removed>

> „Following the recent Rust drama within the Linux kernel that came out in part because **Christoph Hellwig expressed objections to Rust bindings for the DMA mapping helpers that he is a maintainer of, Hellwig has now stepped down as one of the DMA mapping helper maintainers.**"

> Merged in Linux 6.14, Änderung des DMA-Mapping-Maintainer-Eintrags; Hellwigs Erklärung im Commit:
> „**Marek has graciously offered to maintain the dma-mapping tree.**"

Hellwig bleibt (Co-)Maintainer für NVMe-Treiber, NVMe-Target, Personality Handling und FreeVXFS.

### Kritik — Ted Ts'o, Wedson Almeida Filho, Community-Toxizität

`[Forenkommentar]` Lobsters, *Retiring from the Rust for Linux project* — <https://lobste.rs/s/46pt2l/retiring_from_rust_for_linux_project>
Verknüpft als Primärquelle: Wedson Almeida Filhos Rücktrittsmail vom 28. Aug. 2024, `lore.kernel.org/lkml/20240828211117.9422-1-wedsonaf@gmail.com/` (**die Mail selbst habe ich nicht abgerufen**). **227 Kommentare, +159 Punkte.**

Zusammenfassung der Diskussion, die die Ursache war, laut einem Kommentar, der auf LWN verweist:

> „Here's a summary of the discussion that was happening in the linked video: <https://lwn.net/Articles/978738/>" — Nutzer `msfjarvis`

**Ted Ts'o wird in den Kommentaren wiederholt als der Fragesteller benannt:**

> „Please tell me that **wasn't actually Ted T'so being that aggressive**, as LWN suggests. I expect better from such a senior Linux contributor." — `voltagex`
> „That seems to be **Ted Ts'o, the maintainer of ext4**." — zitiert in der Suchzusammenfassung des Lobsters-Threads

> „the **issue is not what Ted is saying, but *how***. The question is valid, though it has been rehashed a lot, but **the tone and aggressiveness is not a valid way to ask a question in any context. That's toxic behavior, plain and simple**" — `ThinkChaos`

**Belegte Zahlen zur Community-Seite:**

| Größe | Wer | Aussage |
|---|---|---|
| 227 Kommentare | Lobsters | Reaktion auf den Rücktritt |
| 1592 Punkte / 642 Kommentare | HN | Reaktion auf Discords Go→Rust |
| „1,400 goroutines blocked" | GitLab (s. C1) | nicht Kernel, aber vergleichbare Lock-Contention |

**Die substanzielle technische Kritik** — und das ist der eigentlich interessante Punkt — kommt nicht von Ts'o, sondern ist im Thread als Zitat dokumentiert (Asahi-Lina, Rust-DRM-Scheduler-Patch):

> „When I tried to upstream minor fixes to the C code to make the behavior more robust and the lifetime requirements sensible, **the maintainer blocked it and said I should just do \"what other drivers do\".** Even when I pointed out that **other C drivers also triggered the same bugs because the API is just bad and unintuitive and there are many secret hidden lifetime requirements**, he wouldn't budge."

Gegenposition im selben Thread:

> „The scheduler has a pretty clear tear down procedure. And that procedure implies that all entities which might provide jobs are destroyed before the scheduler is destroyed… We could add a warning when users of this API doesn't do this correctly, but **cleaning up incorrect API use is clearly something we don't want here.**"

**Der strukturelle Kern der Kritik (aus dem Thread, sinngemäß):** Das Problem ist nicht Rust vs. C, sondern dass **Linux kein dokumentiertes Aliasing-/Lifetime-Modell hat**. Zitat `david_chisnall`: „Most of the places it's been used in Linux are **device drivers that are at the edge of the kernel, with little coupling to the rest**… The efforts to implement filesystems, for example, which need to interact with the VFS, buffer cache, and a bunch of other subsystems, **have had problems**."

### Der erste CVE in Rust-Kernel-Code

`[Firmen-Blog/Guest-Post]` JetBrains, *Blazingly Fast or Blazingly Hyped? A Reality Check on Rewriting in Rust*, 10. Aug. 2026 — <https://blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust/>

> „**The first CVE in Rust code in the Linux kernel** came from a **race condition in an unsafe block in the Android binder driver**." — verlinkt `lore.kernel.org/linux-cve-announce/2025121614-CVE-2025-68260-558d@gregkh/` (**die CVE-Ankündigung selbst habe ich nicht abgerufen**; die CVE-Nummer **CVE-2025-68260** ist in der verlinkten URL enthalten).

### ⚠️ Nicht belegt

> **Zahlen zu Wartungskosten von Rust im Kernel habe ich NICHT gefunden.** Keine Quelle nannte Personalaufwand, Buildzeit-Zuwachs, CI-Kosten oder Fehlerbehebungszeiten für Rust im Kernel. Ich habe dazu gesucht über: Wikipedia, heise, Phoronix, Lobsters-Thread, JetBrains-Post. **„Rust im Kernel ist teuer in der Wartung" ist eine verbreitete Meinung, aber ich habe dafür keine Zahl gefunden.** Die einzige quantifizierte Wartungsaussage im gesamten Korpus ist Dropbox' „onboarding new engineers to the system took years" (§B2).

**Zum DMA-Mapping-Streit:** Die Fakten (Hellwigs Einwände, Rücktritt als DMA-Mapping-Maintainer, Merge in 6.14) sind **über Phoronix belegt, nicht primär über den Commit** — der Phoronix-Artikel verlinkt den Kernel-Commit, den ich nicht selbst abgerufen habe.

---

## B8. Kostet jede zusätzliche Sprache Geld? — ehrliche Antwort: **überwiegend nicht belegt**

### Was ich gefunden habe

`[Meinungsartikel ohne Zahlen]` DevOps Digest, Bart Copeland (CEO ActiveState), 30. Okt. 2018, *Polyglot is Killing Your Enterprise* — <https://www.devopsdigest.com/polyglot-is-killing-your-enterprise>

**Dieser Artikel ist die meistzitierte Quelle zum Thema und enthält KEINE EINZIGE ZAHL.** Er ist ein Meinungsstück des CEO eines kommerziellen Sprach-Distributors. Seine drei benannten Probleme:

> „1. **Coding vs. Fixing**: Updating and fixing tools instead of coding new features… **2. Wasted Development Cycles**: Because library versions and code dependencies are constantly being updated, the artifacts associated with the original build of an application may no longer be available when a vulnerability is found… **3. Risk and Application Transparency**…"

> „**These problems multiply exponentially as an enterprise adds more languages**, creating a digital Tower of Babel."

> „**It's hard to become an expert in one language when you're required to work with a dozen.**"

⚠️ **Interessenkonflikt:** Der Autor ist CEO von ActiveState, das kommerzielle Sprach-Distributionen und Support verkauft — also direkt von der Polyglot-These profitiert.

### Die einzigen *quantifizierten* Belege, die ich gefunden habe

| Quelle | Typ | Was quantifiziert ist | Zahl |
|---|---|---|---|
| Chromium, Rust/C++-Interop | `[Offizielles Projekt-Dokument]` | **Interop-Aufwand einer zusätzlichen Sprache** in einem C++-Monolithen | 1768 APIs analysiert; ~60 % cxx-tauglich; +12 % via std::string; ~20 % Pointer-Parameter; **8 % unlösbar** |
| Chromium, Memory safety | `[Offizielles Projekt-Dokument]` | Explizite **Kostenfrage** | „that calls into question **whether the costs of an extra language are justified**" |
| Benchmarks Game | `[Benchmark]` | **Compile-Zeit-Unterschied Go vs. Rust** | Go `make` 5,1–6,2 s vs. Rust 10,1–14,4 s (~2×) |
| Discord | `[Firmen-Blog]` | **Einarbeitungszeit in Rust-Nightly** | „we committed to running on nightly until async was fully supported on stable" — kein Zeitmaß |
| Dropbox | `[Firmen-Blog]` | **Einarbeitungszeit in ein Altsystem** | „onboarding new engineers to the system **took years**" |
| JetBrains (Google-Daten zitierend) | `[Firmen-Blog]` | **Einarbeitungszeit in Rust** | „around **two-thirds of developers feel confident contributing to a Rust codebase within two months**" (Google-Angabe, im JetBrains-Post zitiert; die Originalquelle `opensource.googleblog.com/2023/06/rust-fact-vs-fiction…` habe ich **nicht selbst abgerufen**) |
| JetBrains | `[Firmen-Blog]` | **Rewrite-Dauer** | „Small rewrites take **months**. Medium ones take **one to two years**, and large rewrites take **two to five**." |
| Segment | `[Firmen-Blog]` | **CI/Testzeit** | Testlauf für 140+ Destinations: „could take **up to an hour** to run" → nach Traffic Recorder „**milliseconds**" (s. D2) |
| Segment | `[Firmen-Blog]` | **Personalbindung** | „**3 full-time engineers** spending most of their time just keeping the system alive" (s. D2) |

### 🔴 Ausdrückliches Urteil

> **Es existiert, soweit ich es gefunden habe, KEINE belastbare Studie, die beziffert, was eine zusätzliche Programmiersprache in einem Unternehmen kostet (Buildzeit, CI-Minuten, Einarbeitungszeit, Tooling-Personal).** Was existiert, sind:
> 1. **Meinungsartikel mit Null Zahlen** (DevOps Digest/ActiveState — mit Interessenkonflikt),
> 2. **eine sorgfältige Interop-Kostenanalyse eines einzelnen Projekts** (Chromium, 1768 APIs),
> 3. **unternehmensspezifische Erfahrungswerte** (Dropbox: „years" Onboarding; Segment: ein Monolith statt 140 Services; JetBrains: Rewrite-Dauer in Größenklassen).
>
> Ich habe gesucht mit: „polyglot programming cost", „language proliferation", „cost of adding a language", „cost of adding a new programming language to an organization engineering blog numbers". Alle Treffer waren Meinungsartikel oder generische Ratgeber. **Die Behauptung „jede zusätzliche Sprache kostet Geld" ist plausibel und durch Einzelfälle gestützt, aber als allgemeine Regel NICHT quantitativ belegt.**

---

# C) Wann lohnt sich ein natives Programm?

## C1. Overhead eines Prozessstarts

### Linux: belegte Zahlen

`[Issue-Tracker]` rust-lang/rust Issue #87764, *Slow process spawning using `Command::spawn` with older GLIBC due to use of `fork`*, 4. Aug. 2021 — <https://github.com/rust-lang/rust/issues/87764>

Die Messanordnung (Autor Jakub Beránek): Allokation von **~4 GiB** (um viele Seitentabellen zu belegen), dann **100-mal** `sleep 0` spawnen.

> „On my laptop with **GLIBC 2.33**, it takes **under `100 ms`** to run the benchmark, while on the **HPC cluster** this can sometimes take **up to `10 seconds`**!"

**Eigene Rechnung (als solche markiert):**
- Laptop, moderne glibc: < 100 ms / 100 Spawns → **< 1 ms pro Prozessstart**
- Cluster, glibc 2.17: bis 10 s / 100 Spawns → **bis ~100 ms pro Prozessstart**
- **Faktor bis ~100×** zwischen den beiden Umgebungen — allein wegen des Parent-Speicherfußabdrucks.

**Die Mechanik (wörtlich):**

> „`posix_spawn` uses `fork` on older GLIBC versions (<2.24). While `fork` is supposed to be fast because it uses copy-on-write, it can actually be quite slow, because **it still has to do nontrivial things, like setting up page tables. This gets problematic if the process has a lot of memory allocated, because then many virtual memory pages are populated and `fork` gets really slow.**"

> „`vfork` … avoids page table manipulations and **should run in constant time independent of the process memory usage**."

**Position des glibc-Maintainers** (zitiert im Issue, Original: Florian Weimer in `bugs.python.org/issue34663#msg325765`):

> „I wouldn't bother with POSIX_SPAWN_USEVFORK on GNU/Linux. **Current versions of glibc always use a vfork-style clone call**, so there would be a difference on older versions only."

### Linux: die 30×-Firmenzahl

`[Firmen-Blog]` GitLab, Andrew Newdigate, 23. Jan. 2018, *How a fix in Go 1.9 sped up our Gitaly service by 30x* — <https://about.gitlab.com/blog/2018/01/23/how-a-fix-in-go-19-sped-up-our-gitaly-service-by-30x/>

| Größe | Wörtliches Zitat |
|---|---|
| **p99-Vorher/Nachher** | „the **99th percentile performance of the endpoint had dropped from 400ms down to 100ms**" — und nach dem Fix: **~30×** Verbesserung |
| Ursache | „we determined that the process had a large amount of contention around `syscall.ForkLock` during the lockups. **In one dump, 1,400 goroutines were blocked waiting on `ForkLock`** – most for several minutes." |
| Spawn-Rate | „Each Gitaly server instance was **`fork/exec`'ing Git processes about 20 times per second**" |
| Durchsatz | „currently peaks at about **1,000 gRPC requests per second**" |
| Mechanik | „When using `fork`, the child process will start with a copy of the parent processes' memory. Unfortunately **this process takes longer the larger the virtual memory footprint the process has. Even with copy-on-write, it can take several hundred milliseconds in a memory-intensive process.** `posix_spawn` doesn't copy the parent processes' memory space and **has a roughly constant time.**" |
| Fix | Go 1.9 wechselte von `fork/exec` zu `posix_spawn` (Golang-Issue #5838) |

**Das ist die belastbarste Zahl zur Frage „was kostet Prozessstart":**

| Parent-Speicher | Prozessstart-Kosten (belegt) | Quelle |
|---|---|---|
| moderne glibc, ~4 GiB RSS | **< 1 ms** | rust#87764 (eigene Rechnung aus <100 ms/100) |
| glibc 2.17 (2012), ~4 GiB RSS | **bis ~100 ms** | rust#87764 (eigene Rechnung aus 10 s/100) |
| memory-intensiver Prozess, `fork` | **„several hundred milliseconds"** | GitLab |
| mit `posix_spawn`/`clone(CLONE_VFORK)` | **„roughly constant time"** | GitLab |

### Windows: `CreateProcess`

> **Nicht belegt.** Ich habe **keinen** belastbaren Messwert für `CreateProcess`-Overhead gefunden. Gesucht über: web_search zu „process startup overhead benchmark fork exec posix_spawn Linux Windows", Reddit r/osdev „Fork+Exec VS CreateProcess". Die Treffer enthielten **keine Zahlen**. Die einzige Windows-relevante Zahl im ganzen Korpus ist die Erwähnung, dass Rust im Windows-Kernel läuft (JetBrains-Post, ohne Zahlen). **„CreateProcess kostet X ms" kann ich nicht belegen.**

### Was kostet das Starten eines Go- oder Rust-Binaries?

Der Benchmarks-Game-Datensatz (§A4) misst `make` inklusive Compile — das ist **nicht** Startzeit. Eine direkte Zahl für „Go-Binary starten vs. Rust-Binary starten" habe ich **nicht** gefunden, mit einer Ausnahme: Der Programmieraufwand zum Aufwärmen ist bei Rust-Programmen in Benchmarks dadurch sichtbar, dass sie in der `mem`-Spalte **niedrigere RSS-Werte** haben als Go in den allermeisten Fällen (z. B. binary-trees: Rust 139 MB vs. Go 416 MB; n-body: Rust ~3,0 MB vs. Go ~3,2 MB). Für *Start*latenz ist das **kein** Beweis. **Nicht belegt.**

**Praktisch relevant ist für Rust/Go aber:** Beide erzeugen **statische Binaries ohne VM-Start** — in Figmas Fall war genau das der Grund für Prozess-pro-Dokument („Low resource usage… It used so little memory that it was actually practical to just start a separate Rust process for every document"), während Node scheiterte („the memory overhead of the JavaScript VM would have been too high").

---

## C2. IPC- und Serialisierungs-Overhead

### Messwerte: Shared Memory vs. Unix Domain Socket

`[Benchmark, nicht peer-reviewed]` Victor Anderssén, *Linux IPC Shootout: Shared Memory vs Unix Domain Sockets*, Mai 2026 — <https://victoranderssen.com/blog/linux-ipc-benchmark/> (Code: `github.com/Avicted/IPC-playground`)

Methodik laut Post: `CLOCK_MONOTONIC_RAW`, Producer auf Kern 0 / Consumer auf Kern 1 via `sched_setaffinity` gepinnt, 200 ungetimte Warmup-Runden, **5000 getimte Round-Trips pro Größe**, Durchsatz über 8 MB unidirektional.

**Median Round-Trip-Latenz (ns):**

| Nutzlast | Shared Memory | UDS Stream | UDS Datagram |
|---|---|---|---|
| 32 B | **270** | 5910 | 4640 |
| 64 B | 330 | 5750 | 4820 |
| 128 B | 430 | 7740 | 4800 |
| 256 B | 650 | 7330 | 5440 |
| 512 B | 1 090 | 8110 | 6180 |
| 1 KB | 1 980 | 8290 | 6860 |
| 2 KB | 3 750 | 12 190 | 9100 |
| 4 KB | 7 290 | 15 210 | 12 760 |
| 8 KB | 14 360 | 23 280 | 19 850 |

**Durchsatz (MB/s):** Shared Memory 269,7–526,7 · UDS Stream 23,7–451,2 · UDS Datagram 29,5–526,7

Autor-Fazit:

> „Shared memory achieves a median round-trip latency of **270 ns at 32 bytes, which is 17 to 22 times lower** than either UDS variant (4640 ns for datagram, 5910 ns for stream)."

**Direkt anwendbare Daumenregel aus diesen Zahlen (eigene Rechnung):**
- UDS-Round-Trip ≈ **4,6–8,3 µs** im Bereich 32 B–1 KB (Datagram günstiger)
- Shared Memory ≈ **0,27–2,0 µs** im selben Bereich
- **Grenzgröße für Durchsatz-Unentschiedenheit: ~8 KB** — ab dort erreicht UDS-Datagram die Shared-Memory-Durchsatzklasse
- Prozessgrenze kostet über UDS also **~5 µs pro Round-Trip** — das ist der Preis, den eine Sprachgrenze *zusätzlich zur In-Process-Variante* zahlt.

⚠️ **Quellenkritik:** privater Blog, nicht peer-reviewed, keine Wiederholung durch Dritte, nur ein Rechner, nur Linux. Ich behandle es als **plausible Größenordnung**, nicht als gesicherten Fakt.

### Was der Serialisierungspreis laut Node.js selbst ist

`[Offizielle Doku]` — <https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop>:

> „the communication costs, i.e. the overhead of passing serialized objects between the Event Loop and the Worker Pool, are offset by the benefit of using multiple cores"

Das ist eine **qualitative** Aussage. Node.js gibt **keine** Zahl für Serialisierungskosten an. Die einzige Node-eigene Serialisierungszahl ist der 50-MB-JSON-Fall in §A1 (**0,7 s stringify, 1,3 s parse**).

### **JSON vs. MessagePack vs. Protobuf**

> **Nicht belegt.** Ich habe **keinen** seriösen Benchmark abgerufen, der JSON, MessagePack und Protobuf quantitativ vergleicht. Gesucht, aber nicht abgerufen/gelesen. Die einzige verwandte Zahl im Korpus ist Figmas „serilization time is now over 10x faster" (§B3) — das ist Rust-vs-TypeScript bei *figma-eigenem* Format, **nicht** JSON-vs-MessagePack.

### Prozessgrenze vs. In-Process — der belegte Extremfall

`[Firmen-Blog]` Amazon Prime Video, Marcin Kolny, 22. März 2023, *Scaling up the Prime Video audio/video monitoring service and reducing costs by 90%* — <https://web.archive.org/web/20231230202019/https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90>
(Original-URL leitet inzwischen auf aboutamazon.com um; abgerufen über Wayback Machine, 30. Dez. 2023.)

> „the way we used some components caused us to **hit a hard scaling limit at around 5% of the expected load**"
> „**The two most expensive operations in terms of cost were the orchestration workflow and when data passed between distributed components.**"
> „we packed all of the components into a single process. This eliminated the need for the S3 bucket as the intermediate storage for video frames because **our data transfer now happened in the memory.**"
> „Moving our service to a monolith **reduced our infrastructure cost by over 90%**. It also increased our scaling capabilities."
> „Today, we're able to handle **thousands of streams**"

**Das ist die härteste belastbare Zahl für „Prozess-/Netzwerkgrenze kostet Geld": >90 % Kostenreduktion durch Zusammenlegen in einen Prozess.** Der Kontext ist allerdings Serverless + S3 (state transitions + S3-Tier-1-Calls), nicht IPC im engeren Sinne.

---

## C3. Gibt es Richtwerte / Daumenregeln aus der Literatur?

**Belegte Regeln, die ich gefunden habe** (alle als Aussage der jeweiligen Quelle, nicht als allgemeingültige Regel):

| Regel | Quelle | Typ |
|---|---|---|
| „Node.js is fast when the work associated with each client at any given time is **\"small\"**." | Node.js Docs | `[Offizielle Doku]` |
| „Node.js excels for I/O-bound work, but for **expensive computation it might not be the best option**." | Node.js Docs | `[Offizielle Doku]` |
| „You should **not** simply create a Child Process for every client… your server might become a **fork bomb**." | Node.js Docs | `[Offizielle Doku]` |
| „the process is the smallest unit of isolation, but **processes are not cheap**" | Chromium | `[Offizielles Projekt-Dokument]` |
| „it's already sometimes **just too expensive to start a new process** to handle untrustworthy data" | Chromium | `[Offizielles Projekt-Dokument]` |
| „**This is not because we run code faster. Even our old service could handle requests in the sub-millisecond range.**" | Cloudflare | `[Firmen-Blog]` |
| „the **returns on investments like rewrites diminish over time** as code gets older" | Google Security | `[Firmen-Blog]` |
| „**Interoperability is the new rewrite**" | Google Security | `[Firmen-Blog]` |
| „The best approach is almost always to **expand incrementally rather than rewrite everything at once**." | JetBrains | `[Firmen-Blog, Guest]` |
| „Binary size, platform support, and interoperability with other languages are **real practical challenges**." | JetBrains | `[Firmen-Blog, Guest]` |

### 🔴 Ausdrückliches Urteil zu „wenn X Aufrufe/s" oder „ab Y ms Latenz"

> **Es gibt KEINE belegte allgemeine Schwelle der Form „ab X Aufrufen pro Sekunde lohnt sich nativ" oder „ab Y ms Latenz muss man nativ gehen".** Ich habe danach gesucht und nichts gefunden. Was es gibt, sind **firmenspezifische Auslöser**:
> - **Cloudflare**: Alt-Service schaffte **sub-millisecond**, das Problem war Connection-Reuse über Prozessgrenzen → **20 %** des Durchsatzes als neue Verbindungen, 87,1 % Reuse-Rate. Der Auslöser war **Architektur**, nicht Geschwindigkeit.
> - **Prime Video**: harter Skalierungsstopp bei **5 % der Ziellast** → Auslöser war die **Orchestrierungs-/Datentransfer-Rechnung**, nicht Latenz.
> - **Figma**: **einzelne** sehr große Dokumente blockierten ganze Worker → Auslöser war **Tail-Latenz durch Single-Threading**, nicht Durchschnittslast.
> - **GitLab**: **20 fork/exec pro Sekunde** bei 1000 gRPC req/s reichten, um das System in Lock-Contention zu treiben → das ist die **einzige operationelle Schwelle im Korpus**, und sie ist extrem niedrig, weil der Parent groß war.
> - **Discord**: **hunderte-tausende Cache-Updates/s**, **zehntausende DB-Writes/s**, GC-Zwang alle **2 Minuten** → Auslöser war die **GC-Scan-Zeit über einen sehr großen LRU-Cache**.
>
> **Die gemeinsame belegte Struktur ist: nicht die Aufrufrate entscheidet, sondern ob eine einzelne, nicht unterbrechbare Arbeit über eine geteilte Ressource läuft** (Event Loop, GC-Scan, Fork-Lock, einzelner Worker-Thread) **und wie groß der Parent-Prozess ist.**

---

# D) Etikettenschwindel / Prestige ohne Nutzen

## D1. Belegte Fälle, in denen ein Rewrite scheiterte

`[Firmen-Blog/Guest-Post]` JetBrains, Mateusz Maćkowski & Marek Grzelak (cot.rs), Rustikon 2026, 10. Aug. 2026, *Blazingly Fast or Blazingly Hyped? A Reality Check on Rewriting in Rust* — <https://blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust/>

Das ist die **einzige mir zugängliche Quelle, die Rewrite-Scheitern systematisch auflistet**. TL;DR der Autoren wörtlich:

> „RIIR can deliver real performance and safety gains, **but not automatically. Some projects are faster because of Rust, some just because they were rewritten from scratch.**"
> „**Rewrites introduce new bugs.** Even well-funded teams with experienced engineers make mistakes."
> „**Not every rewrite succeeds. Prisma, Loglog Games, and the curl/hyper integration all hit walls for different reasons.**"
> „**The best approach is almost always to expand incrementally rather than rewrite everything at once.**"

### Belegte Fehlschläge

| Projekt | Was passierte | Wörtliches Zitat |
|---|---|---|
| **Prisma** | Rust-Query-Engine → zurück zu TypeScript | „Prisma migrated away from their Rust query engine back to TypeScript due to **skill-set gaps, deployment complexity, and runtime issues**." |
| **Loglog Games** | Rust nach 3 Jahren Game-Dev aufgegeben | „abandoned Rust after three years of game development. They found it **excellent for refactoring but poor for iteration speed**… the Rust game development community focuses more on **engine technicalities than on shipping finished games**." |
| **curl / hyper** | **95 % fertig, dann abgebrochen** | „The curl/hyper integration got to **95% completion and was then abandoned due to the difficulty of the last 5% and the lack of community momentum**." |
| **Microsoft** | Wählte Go, **nicht** Rust | „Microsoft chose **Go** for the TypeScript compiler rewrite largely because **Go is much closer to TypeScript in its programming model**" |
| **NTPsec** | Wählte Go, **nicht** Rust | „chose Go because, at the time, Go had **better network primitives and a less fragmented ecosystem**" |

### Belegte Fehler in frisch geschriebenem Rust-Code

> „Cloudflare introduced **an `unwrap`** in a request-scoring component. **uutils** formatted dates slightly incorrectly, **breaking unattended upgrades**. **sudo-rs** echoed a partially typed password back to the terminal after a timeout. The **first CVE in Rust code in the Linux kernel** came from a **race condition in an unsafe block** in the Android binder driver. **TARmageddon** was an **RCE vulnerability in async-tar** caused by incorrect parsing of the .tar format."

> „**If projects backed by significant funding and experienced teams still make these mistakes, we will too.**"

### Prismas eigene Begründung (Primärquelle)

`[Firmen-Blog]` Prisma, *Prisma ORM Manifesto* — <https://www.prisma.io/blog/prisma-orm-manifesto>

> „Prisma's architecture has historically **limited community contributions**. Core functionality—such as **query parsing, validation, and execution—has been managed by our Rust engine, which has been opaque to our TypeScript-focused community**. Expanding capabilities or fixing core issues often fell solely to our team. We're addressing this by **migrating Prisma's core logic from Rust to TypeScript** and redesigning the ORM to make customization and extension easier."

**Das ist ein belegter Fall von „Prestige ohne Nutzen":** Rust wurde für Performance gewählt, und der Preis war eine **geschlossene Community-Schnittstelle** und ein Bugfix-Engpass. Die Migration zurück zu TypeScript ist öffentlich dokumentiert.

### Der belegte Grund für Rewrites — und die Gegenprobe

> „**Some projects are faster because of Rust, some just because they were rewritten from scratch.** … Looking at uutils, sort runs **almost four times faster** than GNU sort. The reason is **parallel merge sort**, which Rust's concurrency model makes considerably easier to implement correctly. But some other utilities are **faster simply because they're a fresh rewrite with 30 years of hindsight.** The original project couldn't experiment as freely because production users depended on it."

→ **Das ist die methodische Kernaussage zur Frage „Etikettenschwindel": Ein Vorher/Nachher-Vergleich eines Rewrites kann den Sprachgewinn NICHT vom Neuschreib-Gewinn trennen.** Ein Rewrite beweist nie die Sprache.

**Belegte echte Rust-spezifische Gewinne (laut derselben Quelle):**

| Fall | Zahl |
|---|---|
| uutils `sort` vs. GNU `sort` | „**almost four times faster**" (Ursache: paralleler Merge-Sort) |
| Rust PNG-Crate vs. libpng | „**nearly twice as fast**" (Ursache: Auto-Vektorisierung + Streaming-DEFLATE) |
| uutils vs. GNU coreutils Binärgröße | „**73 MB** of individual binaries becomes **13.8 MB** as a multicall binary, which actually beats the **18.4 MB** of the GNU coreutils standard install. Compressed with UPX, it gets down to **5 MB**." |
| uutils Test-Parität (Anfang 2026) | „they're at **92.2% pass rate** and climbing" (gegen die offizielle GNU-coreutils-Testsuite) |
| ripgrep vs. grep, 37 GB Verzeichnis | „grep finished in **52 seconds**. ripgrep finished in **six**." |

⚠️ **Wichtig zur Einordnung von „ripgrep 8,7× schneller als grep":** Das ist ein **Alternative**, kein Drop-in-Rewrite — ripgrep ist nicht GNU grep. Der Vergleich beweist **nicht**, dass die Sprache den Unterschied macht.

## D2. Microservices → Monolith: belegte Rückbauten mit Zahlen

### Amazon Prime Video (2023) — ✅ die 90-%-Zahl ist verifiziert

`[Firmen-Blog, via Wayback Machine]` — <https://web.archive.org/web/20231230202019/https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90>

| Größe | Wörtliches Zitat |
|---|---|
| **Kostensenkung** | „Moving our service to a monolith **reduced our infrastructure cost by over 90%**." |
| **Skalierungsgrenze** | „the way we used some components caused us to **hit a hard scaling limit at around 5% of the expected load**" |
| Kostentreiber | „**The two most expensive operations in terms of cost were the orchestration workflow and when data passed between distributed components.**" |
| Nachher | „Today, we're able to handle **thousands of streams** and we still have capacity to scale the service even further." |
| Fairness | „**Microservices and serverless components are tools that do work at high scale, but whether to use them over monolith has to be made on a case-by-case basis.**" |

**Bewertung:** Die „**90 % Kostensenkung**" ist **verifiziert** — und der Titel des Posts sagt genau das. **Aber:** Es ist **eine** Service-Einheit (VQA-Monitoring von Live-Streams), nicht „Prime Video". Der Post ist von Amazon selbst, ohne unabhängige Prüfung. Er ist ausdrücklich als Einzelfall-Entscheidung formuliert.

### Segment (2018) — Rückbau von 140+ Services

`[Firmen-Blog, via Wayback Machine]` — <https://web.archive.org/web/20231230151632/https://segment.com/blog/goodbye-microservices/>

| Größe | Wörtliches Zitat |
|---|---|
| **Personalkosten** | „the team found themselves unable to make headway, with **3 full-time engineers spending most of their time just keeping the system alive**" |
| Services | „The first item on the list was to **consolidate the now over 140 services into a single service**. The overhead from managing all of these services was a huge tax on our team. **We were literally losing sleep over it** since it was common for the on-call engineer to get paged to deal with load spikes." |
| Repos | „As time went on, we added over 50 new destinations, and that meant **50 new repos**." |
| Abhängigkeiten | „For each of the **120 unique dependencies**, we committed to having one version for all our destinations." |
| **Testlaufzeit** | „Some destinations took up to **5 minutes** to run their tests. With over 140 destinations, our test suite could take **up to an hour** to run." → nach Traffic Recorder: „It took **milliseconds** to complete running the tests for all 140+ of our destinations. In the past, just one destination could have taken a couple of minutes" |
| **Entwicklungsgeschwindigkeit** | „In **2016**, when our microservice architecture was still in place, we made **32 improvements** to our shared libraries. **Just this year we've made 46 improvements.**" |
| Wachstum | „with the team adding **three destinations per month** on average" |
| Trade-off 1 | „**Fault isolation is difficult.** With everything running in a monolith, if a bug is introduced in one destination that causes the service to crash, the service will crash for all destinations." |
| Trade-off 2 | „**In-memory caching is less effective.** … Now that cache is spread thinly across **3000+ processes** so it's much less likely to be hit." |
| Trade-off 3 | „**Updating the version of a dependency may break multiple destinations.**" |
| Frühere Dauer | „Often a small change that should have only taken an hour or two would end up requiring **a couple of days to a week** to complete." |

**Bewertung:** Segment liefert die **reichhaltigste quantitative Rückbau-Fallstudie**. Die Zahlen (3 Vollzeitkräfte für Betrieb, 140+ Services, ~1 h Testsuite → ms, 32 → 46 Verbesserungen/Jahr, 3000+ Prozesse) sind alle im Post belegt. Es fehlen: eine echte Kostenrechnung in Geld und eine Angabe zum Latenz-Effekt.

## D3. Joel Spolsky — der Ursprungstext

`[Persönlicher Blog, via Wayback Machine]` Joel Spolsky, *Things You Should Never Do, Part I*, 6. April 2000 — <https://web.archive.org/web/20250102205841/https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/>
(Original `joelonsoftware.com` war beim Abruf nicht direkt scrapebar.)

> „They did it by making the **single worst strategic mistake** that any software company can make: **They decided to rewrite the code from scratch.**"

> „When you throw away code and start from scratch, **you are throwing away all that knowledge. All those collected bug fixes. Years of programming work.** You are throwing away your market leadership. **You are giving a gift of two or three years to your competitors**, and believe me, that is a long time in software years."

> „It's important to remember that when you start from scratch there is **absolutely no reason to believe that you are going to do a better job than you did the first time**. First of all, **you probably don't even have the same programming team that worked on version one, so you don't actually have \"more experience\". You're just going to make most of the old mistakes again, and introduce some new problems that weren't in the original version.**"

**Belegte historische Fälle im Text:** Netscape 6 (3 Jahre zwischen 4.0 und der ersten Beta), Borland (dBase für Windows; Quattro Pro), Microsoft „Pyramid" (Word for Windows, „shut down, thrown away, and swept under the rug").

> **Belegte Zahl fehlt:** Spolsky nennt **keine** Zahlen. Die einzige quasi-numerische Angabe ist „**two or three years**" Wettbewerbsvorsprung und „three years" bei Netscape. **Es gibt in diesem Text keinen Messwert.**

**Bemerkenswert:** Dropbox zitiert Spolsky in seinem eigenen Rewrite-Rechtfertigungspost und widerspricht ihm implizit — der einzige belegte Fall im Korpus, wo eine Firma den Spolsky-Text offen adressiert (§B2).

## D4. Erkennungsmerkmale für Etikettenschwindel

**A) Direkt belegte Merkmale aus den Quellen:**

| Merkmal | Belegquelle |
|---|---|
| **Kein Vorher/Nachher bei nicht-performance-kritischen Rewrites** — „Some projects are faster because of Rust, some just because they were rewritten from scratch." | JetBrains |
| **Erfolg wird qualitativ behauptet, während die Zahlen in Bildern stecken** — Discord: „we were able to beat Go on every single performance metric", aber keine p99 als Text | Discord-Blogpost |
| **Ergebnis ohne Baseline** — Figma nennt „10x faster serialization" und „order of magnitude" ohne absolute Vorher-Werte | Figma |
| **Erfolgszahl ist Eigenangabe ohne Methodik** — PayPal „CPU reduction of approximately 10%" | go.dev |
| **Interessenkonflikt der Quelle** — ActiveState-CEO schreibt „Polyglot is Killing Your Enterprise" (Null Zahlen) | DevOps Digest |
| **Benchmark nutzt `unsafe`/handgeschriebenes SIMD und wird als Sprachbeweis präsentiert** — Benchmarks Game markiert die Gewinner mit `*` | Benchmarks Game |
| **Der Gewinn kommt nachweislich aus der Architektur, nicht der Sprache** — Cloudflare: „This is not because we run code faster." | Cloudflare |
| **Erfolg lässt sich durch die eigene Datenlage erklären, nicht durch die Sprache** — Google: „While correlation doesn't necessarily mean causation" | Google Security |
| **Interop-Kosten werden nicht gerechnet** — Chromium musste die Frage „whether the costs of an extra language are justified" explizit stellen | Chromium |
| **Der Rewrite wurde nicht zu Ende geführt** — curl/hyper bei 95 %, Figma beim halben Server („we dropped our initial plan to rewrite our whole server in Rust") | JetBrains, Figma |
| **Der Rewrite wird später zurückgenommen** — Prisma von Rust zurück zu TypeScript | Prisma-Manifest |

**B) Meine Synthese (NICHT direkt quellenbelegt — als solche markiert):**

Aus dem Korpus ergibt sich folgende Prüfliste für „Rust/Go als Etikett":

1. **Gibt es eine Zahl, oder nur ein Adjektiv?** „blazingly fast", „sicherer", „skaliert besser" ohne Zahl → Etikett. Discord, Cloudflare, Figma, Segment, Prime Video, GitLab liefern alle eine Zahl; die ActiveState-These und der RIIR-Meme-Diskurs liefern keine.
2. **Ist das Vorher/Nachher sprach- oder rewrite-bedingt?** Ohne ein Kontroll-Experiment (dieselbe Sprache, neu geschrieben) ist der Sprachanteil unbelegt. JetBrains formuliert das explizit.
3. **Gibt es ein Bedrohungsmodell und eine Failure-Story?** Google nennt den ersten Rust-Kernel-CVE aus einem `unsafe`-Block; JetBrains listet fünf konkrete Bugs in frisch geschriebenem Rust. Ein Post ohne jede Fehler-/CVE-Nennung ist unvollständig.
4. **Wer beziffert die Grenzkosten?** Chromium hat es getan (1768 APIs, 8 % unlösbar). Die meisten „wir nutzen Rust"-Posts nicht.
5. **Wurde der Rewrite abgeschlossen?** 95 % (curl/hyper), halber Server (Figma), Rücknahme (Prisma) — Abbruch ist ein starkes Signal.
6. **Ist die Quelle interessiert?** ActiveState verkauft Sprachdistributionen. Discord, Cloudflare, Figma, Dropbox, Segment, Prime Video verkaufen ihre Engineering-Marke (Recruiting) — das ist ein **schwächerer**, aber realer Bias.

---

# E. Zusammenfassung in zehn belegten Sätzen

1. **Node/TS** skaliert belegt über wenige Threads für viele Clients, aber nur „when the work associated with each client … is small" — ein 50-MB-JSON kostet Node selbst zufolge **~2 s** Event-Loop-Blockade, und Prozess-pro-Client ist ausdrücklich als Fork-Bomb-Risiko markiert. `[Node.js Docs]`
2. **Go** ist offiziell und firmenseitig belegt für Netzwerkdienste, Nebenläufigkeit, statische Binaries und schnelle Compiles (Benchmarks Game: `make` **5,1–6,2 s** vs. Rust **10,1–14,4 s**); die einzige harte Firmenzahl ist PayPals **~10 %** CPU-Reduktion als Eigenangabe. `[go.dev, Benchmarks Game]`
3. **Rust** ist offiziell belegt als „no runtime or garbage collector", Compile-Zeit-Speichersicherheit und zero-cost abstractions — mit der expliziten Ausnahme `unsafe`, und der erste Rust-Kernel-CVE kam aus genau einem `unsafe`-Block. `[rust-lang.org, Rust Book, JetBrains]`
4. **Discord** dokumentiert den Grund ehrlich (Go erzwingt GC mindestens alle **2 Minuten**, der GC scannt den ganzen LRU-Cache, `SetGCPercent` half nicht) und skaliert den Cache auf **8 Mio. Read States** — aber **p99-Zahlen stehen nur in Bildern und sind aus dem Post nicht belegbar**. `[Discord]`
5. **Cloudflare** liefert die vollständigste Zahlenkette (**70 % weniger CPU, 67 % weniger Speicher, −5 ms Median-/−80 ms p95-TTFB, 87,1 % → 99,92 % Connection-Reuse, 1 Billion Requests/Tag**) — und sagt selbst: „**This is not because we run code faster. Even our old service could handle requests in the sub-millisecond range.**" `[Cloudflare]`
6. **Dropbox** nennt **keine** Leistungszahlen für Nucleus; die einzige harte Zahl ist „**onboarding new engineers to the system took years**". **Figma** nennt „**10x faster serialization**" und „**an order of magnitude**" und hat **den Rewrite bewusst halbiert**. `[Dropbox, Figma]`
7. **Die 70-%-Memory-Safety-Zahl** ist sekundär belegt (Microsoft/Matt Miller, BlueHat IL 2019, über ZDNet) und unabhängig gestützt von Chromium (**70 % der High/Critical-Bugs, 912 Bugs seit 2015, Hälfte Use-after-Free**) und Googles Industrie-Baseline („**more than 65 %**"). `[ZDNet, Chromium, Google]`
8. **Android 76 % → 24 % ist verifiziert** (Google 2024, über 6 Jahre, Branchennorm 70 %), zusammen mit **223 → 85** absoluten Memory-Safety-Bugs (2019–2022), **~21 % Rust-Anteil am neuen Native-Code**, **1,5 Mio. Zeilen Rust in AOSP**, **null** Memory-Safety-Bugs im Rust-Code und einer **halbierten Rollback-Rate** gegenüber C++ — Google betont aber selbst: „**correlation doesn't necessarily mean causation**". `[Google]`
9. **Rust im Linux-Kernel ist seit Dez. 2025 offiziell kein Experiment mehr** (dritte Kernsprache neben C und Assembler) — bei realer Kritik: Christoph Hellwig trat als DMA-Mapping-Maintainer zurück, Wedson Almeida Filho verließ das Projekt, und der Kern der technischen Kritik ist, dass **Linux kein dokumentiertes Aliasing-/Lifetime-Modell hat**. **Wartungskosten sind nirgends beziffert — nicht belegt.** `[heise, Phoronix, Lobsters, Wikipedia]`
10. **Prozessstart kostet belegt <1 ms bei moderner glibc und ~4 GiB Parent-Speicher, bis ~100 ms bei glibc 2.17** (rust#87764) — GitLab belegte daraus **p99 400 ms → 100 ms, ~30×**, ausgelöst durch **20 fork/exec pro Sekunde** und **1.400 blockierte Goroutinen**; IPC über UDS kostet **~4,6–8,3 µs** Round-Trip vs. **~0,27–2,0 µs** über Shared Memory, mit Angleichung ab **~8 KB**. **Windows-`CreateProcess`, JSON-vs-MessagePack-vs-Protobuf, TechEmpower und Polyglot-Kosten sind nicht belegt.** `[rust#87764, GitLab, Anderssén]`

---

# F. Alle abgerufenen URLs

## Firmen- und Projekt-Blogs (Erfahrungsberichte)

1. https://discord.com/blog/why-discord-is-switching-from-go-to-rust — Discord, *Why Discord is switching from Go to Rust*, 04.02.2020
2. https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/ — Cloudflare, *How we built Pingora*, 14.09.2022
3. https://dropbox.tech/infrastructure/rewriting-the-heart-of-our-sync-engine — Dropbox, *Rewriting the heart of our sync engine*, 09.03.2020
4. https://www.figma.com/blog/rust-in-production-at-figma/ — Figma, *Rust in production at Figma*, 02.05.2018
5. https://web.archive.org/web/20231230202019/https://www.primevideotech.com/video-streaming/scaling-up-the-prime-video-audio-video-monitoring-service-and-reducing-costs-by-90 — Amazon Prime Video, *Scaling up … and reducing costs by 90%*, 22.03.2023 (via Wayback; Original leitet auf aboutamazon.com um)
6. https://web.archive.org/web/20231230151632/https://segment.com/blog/goodbye-microservices/ — Segment, *Goodbye Microservices*, via Wayback
7. https://about.gitlab.com/blog/2018/01/23/how-a-fix-in-go-19-sped-up-our-gitaly-service-by-30x/ — GitLab, *How a fix in Go 1.9 sped up our Gitaly service by 30x*, 23.01.2018
8. https://security.googleblog.com/2022/12/memory-safe-languages-in-android-13.html — Google Online Security Blog, 01.12.2022
9. https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html — Google Online Security Blog, 25.09.2024
10. https://www.prisma.io/blog/prisma-orm-manifesto — Prisma, *ORM Manifesto*
11. https://blog.jetbrains.com/rust/2026/08/10/rewriting-in-rust/ — JetBrains Blog (Guest Post cot.rs), 10.08.2026

## Offizielle Doku / Projekt-Dokumente

12. https://nodejs.org/api/worker_threads.html — Node.js Docs, *Worker threads*
13. https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop — Node.js Docs, *Don't Block the Event Loop (or the Worker Pool)*
14. https://go.dev/ — The Go Programming Language (offizielle Website)
15. https://www.rust-lang.org/ — Rust Programming Language (offizielle Website)
16. https://doc.rust-lang.org/book/ch00-00-introduction.html — The Rust Programming Language, Introduction
17. https://www.chromium.org/Home/chromium-security/memory-safety/ — Chromium, *Memory safety*
18. https://www.chromium.org/Home/chromium-security/memory-safety/rust-and-c-interoperability/ — Chromium, *Rust and C++ interoperability*

## Benchmarks

19. https://benchmarksgame-team.pages.debian.net/benchmarksgame/fastest/rust-go.html — Benchmarks Game, *Rust versus Go* (Rust 1.84.1 vs go1.23.1)
20. https://victoranderssen.com/blog/linux-ipc-benchmark/ — Anderssén, *Linux IPC Shootout: Shared Memory vs Unix Domain Sockets* (Code: github.com/Avicted/IPC-playground)
21. ❌ **https://www.techempower.com/benchmarks/ — NICHT abrufbar** (3 Versuche, „All scraping engines failed"). Keine Zahlen von dort zitiert.

## Nachrichtenartikel

22. https://www.zdnet.com/article/microsoft-70-percent-of-all-security-bugs-are-memory-safety-issues/ — ZDNet, 11.02.2019 (über Matt Millers BlueHat-IL-Vortrag)
23. https://www.phoronix.com/news/Hellwig-DMA-Helpers-Removed — Phoronix, 25.02.2025
24. https://www.heise.de/en/news/Linux-Kernel-Rust-Support-Officially-Approved-11109808.html — heise online, 10.12.2025 (Thorsten Leemhuis)
25. https://www.devopsdigest.com/polyglot-is-killing-your-enterprise — DevOps Digest, 30.10.2018 (**Meinungsartikel, null Zahlen**)

## Issue-Tracker / Foren / Enzyklopädie

26. https://github.com/rust-lang/rust/issues/87764 — rust-lang/rust Issue #87764 (Prozess-Spawn-Benchmark)
27. https://news.ycombinator.com/item?id=22238335 — Hacker News Diskussion zum Discord-Post (1582 Punkte, 642 Kommentare)
28. https://hn.algolia.com/api/v1/search?query=discord%20switching%20from%20Go%20to%20Rust&tags=story — HN Algolia API, Story-Suche
29. https://hn.algolia.com/api/v1/search?tags=comment,story_22238335&query=GC%20tuning%20problem — HN Algolia API, Kommentar-Suche (GC-Kritik)
30. https://lobste.rs/s/46pt2l/retiring_from_rust_for_linux_project — Lobsters, *Retiring from the Rust for Linux project* (227 Kommentare)
31. https://en.wikipedia.org/wiki/Rust_for_Linux — Wikipedia, *Rust for Linux*
32. https://web.archive.org/web/20250102205841/https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/ — Joel Spolsky, *Things You Should Never Do, Part I*, 06.04.2000 (via Wayback)

## In Quellen referenziert, aber von mir NICHT abgerufen (daher nicht als Beleg verwendet)

- https://lwn.net/Articles/1049831/ (LWN-Bericht zum Maintainers Summit Dez. 2025) — referenziert in heise
- https://lwn.net/Articles/978738/ (LWN-Zusammenfassung der Ts'o-Diskussion) — referenziert in Lobsters
- https://lore.kernel.org/lkml/20240828211117.9422-1-wedsonaf@gmail.com/ (Wedson Almeida Filhos Rücktrittsmail) — referenziert in Lobsters
- https://lore.kernel.org/linux-cve-announce/2025121614-CVE-2025-68260-558d@gregkh/ (CVE-2025-68260) — referenziert in JetBrains
- https://opensource.googleblog.com/2023/06/rust-fact-vs-fiction-5-insights-from-googles-rust-journey-2022.html (Google: 2/3 der Devs in 2 Monaten) — referenziert in JetBrains
- MSRC-Security-Research BlueHat-IL-2019-Folien (Matt Miller) — referenziert in ZDNet
- https://git.kernel.org/pub/scm/linux/kernel/git/torvalds/linux.git/commit/?id=f7d5db965f3e (Hellwig-Commit) — referenziert in Phoronix
- https://github.com/rtomayko/posix-spawn#benchmarks — referenziert in rust#87764 und GitLab

---

## G. Was ausdrücklich NICHT belegt ist (Zusammenfassung der Lücken)

| Behauptung | Status | Wo ich gesucht habe |
|---|---|---|
| Discords konkrete p99-/GC-Pausen-Werte | **nicht belegbar** — nur in Bildern | Blogpost-Text, HN-Thread, HN-Algolia-Kommentarsuche |
| Dropbox-Nucleus-Performancezahlen | **nicht belegt** — existieren im Post nicht | Dropbox-Blogpost komplett; Konferenzvortrag nicht gefunden |
| Figma-WASM-Zahlen | **nicht belegt** | Figma-Blog (nur Rust-im-Server-Post gefunden) |
| Chromium: weggefallene Memory-Safety-Bugs seit Rust-Einführung | **nicht belegt** | Chromium memory-safety + interop docs |
| Wartungskosten von Rust im Linux-Kernel (Zahlen) | **nicht belegt** | Wikipedia, heise, Phoronix, Lobsters, JetBrains |
| Ted Ts'o / Hellwig: Primärquellen (Mails, Transkript) | **nur sekundär** über News/Foren belegt | Lobsters, Phoronix, LWN-Links (nicht abgerufen) |
| Microsoft-70-%: Primärquelle (Miller-Folien) | **nur sekundär** über ZDNet belegt | ZDNet; MSRC-GitHub-PDF nicht abgerufen |
| **TechEmpower-Zahlen** | **nicht belegt — Seite blockiert alle Abrufversuche** | 3 URLs, 3 Engine-Kombinationen |
| **Windows `CreateProcess`-Overhead in ms** | **nicht belegt** | web_search, Reddit r/osdev, Project-Lighthouse |
| **JSON vs. MessagePack vs. Protobuf Benchmark** | **nicht belegt** | web_search; kein Benchmark abgerufen |
| **Kosten einer zusätzlichen Sprache in Zahlen** (Build, CI, Einarbeitung) | **nur Einzelfälle, keine Studie** | „polyglot programming cost", „language proliferation", „cost of adding a language" |
| **Schwelle „ab X req/s lohnt nativ"** | **nicht belegt** — existiert in der Literatur nicht | web_search + alle Firmenposts |
| Go-Binary- vs. Rust-Binary-Startzeit direkt | **nicht belegt** | Benchmarks Game (misst `make`, nicht Start) |
