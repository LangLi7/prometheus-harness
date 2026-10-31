// One-off: add the PDF-export strings to every locale without touching the rest.
const fs = require('node:fs')
const path = require('node:path')

const additions = {
  en: {
    step4: {
      exportPdf: 'Download PDF',
      exportingPdf: 'Building PDF…',
    },
    log: {
      exportPdfStarted: 'Building PDF for {id}',
      exportPdfDone: 'PDF ready: {id}',
      exportPdfFailed: 'PDF export failed: {error}',
    },
  },
  de: {
    step4: {
      exportPdf: 'Als PDF laden',
      exportingPdf: 'PDF wird erzeugt…',
    },
    log: {
      exportPdfStarted: 'PDF wird für {id} erzeugt',
      exportPdfDone: 'PDF bereit: {id}',
      exportPdfFailed: 'PDF-Export fehlgeschlagen: {error}',
    },
  },
  zh: {
    step4: {
      exportPdf: '下载 PDF',
      exportingPdf: '正在生成 PDF…',
    },
    log: {
      exportPdfStarted: '正在为 {id} 生成 PDF',
      exportPdfDone: 'PDF 已生成：{id}',
      exportPdfFailed: 'PDF 导出失败：{error}',
    },
  },
}

const dir = process.argv[2] ?? '.'

for (const [lang, groups] of Object.entries(additions)) {
  const file = path.join(dir, `${lang}.json`)
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const [section, entries] of Object.entries(groups)) {
    data[section] = { ...(data[section] ?? {}), ...entries }
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`[locales] ${lang}.json updated`)
}
