// Layout for a MiroFish prediction report.
//
// The web view renders titles and body text in Times New Roman and labels in a
// mono face (frontend/src/components/Step4Report.vue:2393 ff). This template
// follows that: serif text, mono section numbers, a black badge, thin rules.
// Call it from a generated entry file; see build.mjs.

#let accent = rgb("#111111")
#let muted = rgb("#6b6b6b")
#let hairline = rgb("#d8d8d8")

#let section_block(body, number: "", title: "") = {
  block(breakable: true, below: 16pt)[
    #grid(
      columns: (24pt, 1fr),
      gutter: 10pt,
      align: (left + top, left + top),
      text(font: "DejaVu Sans Mono", size: 9pt, fill: muted)[#number],
      text(size: 15.5pt, weight: "bold", hyphenate: false)[#title],
    )
    #v(8pt)
    #body
  ]
}

#let build(
  title: "",
  summary: "",
  report_id: "",
  simulation_id: "",
  sections: (),
) = {
  set document(title: title, author: "MiroFish")
  set page(
    paper: "a4",
    margin: (x: 2.4cm, top: 2.2cm, bottom: 2.2cm),
    numbering: "1",
    number-align: center,
  )
  set text(font: "Times New Roman", size: 11pt, lang: "de")
  set par(justify: true, leading: 0.66em)
  set list(indent: 14pt, body-indent: 6pt, spacing: 0.7em)
  show strong: set text(weight: "bold")

  grid(
    columns: (auto, 1fr),
    gutter: 12pt,
    align: (left + horizon, right + horizon),
    box(fill: accent, inset: (x: 7pt, y: 4pt))[
      #text(fill: white, size: 8.5pt, weight: "bold", tracking: 1.2pt)[PREDICTION REPORT]
    ],
    text(font: "DejaVu Sans Mono", size: 8.5pt, fill: muted)[
      ID: #report_id
      #if simulation_id != "" [#linebreak()SIM: #simulation_id]
    ],
  )

  v(18pt)
  text(size: 22pt, weight: "bold", hyphenate: false)[#title]
  v(10pt)
  text(size: 11.5pt, style: "italic", fill: rgb("#3a3a3a"))[#summary]
  v(12pt)
  line(length: 100%, stroke: 0.6pt + hairline)
  v(18pt)

  for (i, s) in sections.enumerate() {
    section_block(
      s.body,
      number: if i + 1 < 10 { "0" + str(i + 1) } else { str(i + 1) },
      title: s.title,
    )
  }
}
