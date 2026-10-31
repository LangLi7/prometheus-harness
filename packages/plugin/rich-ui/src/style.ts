/**
 * Card stylesheet.
 *
 * Kept apart from the plugin wiring so the preview generator and the bundle use
 * exactly the same rules. Every colour is a theme token; the `Canvas`-style
 * fallbacks only matter outside the app, in the preview page.
 */
export const CARD_CSS = `
.pmh-rich{
  margin:10px 0;
  padding:15px 17px 13px;
  max-width:680px;
  border:1px solid var(--dsw-alias-border-l2);
  border-radius:16px;
  background:var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base, Canvas));
  color:var(--dsw-alias-label-primary);
  font-size:13px;
  line-height:1.5;
}
.pmh-rich-stack{display:flex;flex-direction:column;gap:10px;margin:12px 0 2px}
.pmh-rich__head{display:flex;flex-direction:column;gap:3px;margin:0 0 12px}
.pmh-rich__title{margin:0;font-size:15px;line-height:1.35;font-weight:600}
.pmh-rich__subtitle{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pmh-rich__footer{margin:12px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pmh-rich__body{min-width:0}
.pmh-rich-figure{margin:0;position:relative}
.pmh-rich-legend{display:flex;flex-wrap:wrap;gap:12px;list-style:none;margin:0 0 8px;padding:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.pmh-rich-legend__item{display:inline-flex;align-items:center;gap:6px}
.pmh-rich-legend__swatch{display:inline-block;width:9px;height:9px;border-radius:3px}
.pmh-rich-chart{display:block;width:100%;height:auto;overflow:visible}
.pmh-rich-axis{fill:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.pmh-rich-vh{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
.pmh-rich-tablewrap{overflow-x:auto}
.pmh-rich-table{width:100%;border-collapse:collapse;font-size:13px}
.pmh-rich-table caption{padding-bottom:8px;text-align:left;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pmh-rich-table th,.pmh-rich-table td{padding:7px 8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--dsw-alias-border-l2)}
.pmh-rich-table thead th{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500}
.pmh-rich-table tbody tr:last-child th,.pmh-rich-table tbody tr:last-child td{border-bottom:0}
.pmh-rich-num{text-align:right;font-variant-numeric:tabular-nums}
.pmh-rich-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0}
.pmh-rich-stat{padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px}
.pmh-rich-stat__label{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pmh-rich-stat__value{margin:2px 0 0;font-size:22px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.pmh-rich-stat__hint{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.pmh-rich-image{display:block;width:100%;max-height:420px;object-fit:contain;border-radius:12px;background:var(--dsw-alias-bg-layer-2)}
.pmh-rich-caption{margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.pmh-rich-note{white-space:pre-wrap;padding-left:10px;border-left:2px solid var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-secondary)}
.pmh-rich--prose{max-width:100%}
.pmh-rich-prose{overflow:hidden}
.pmh-rich-prose__image{float:left;margin:0 12px 6px 0;border-radius:10px;background:var(--dsw-alias-bg-layer-2);object-fit:cover}
.pmh-rich-prose__text{margin:0;white-space:pre-wrap;color:var(--dsw-alias-label-secondary)}
.pmh-rich-code{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
.pmh-rich-code__bar{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:1.6}
.pmh-rich-code__name{overflow:hidden;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;font-size:11px;white-space:nowrap;text-overflow:ellipsis}
.pmh-rich-code__lang{padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-1);font-size:10px;text-transform:lowercase}
.pmh-rich-code__cut{color:var(--dsw-alias-state-warn-primary);font-size:10px}
.pmh-rich-code__copy{margin-left:auto;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;cursor:pointer}
.pmh-rich-code__copy:hover{border-color:var(--dsw-alias-label-tertiary);color:var(--dsw-alias-label-primary)}
.pmh-rich-code__copy:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.pmh-rich-code__pre{max-height:340px;margin:0;padding:9px 0;overflow:auto;font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;font-size:12px;line-height:1.6;tab-size:2}
.pmh-rich-code__pre:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.pmh-rich-code__line{display:block;padding:0 12px}
.pmh-rich-code__line:hover{background:var(--dsw-alias-bg-layer-1)}
.pmh-rich-code__no{display:inline-block;width:2.2em;margin-right:10px;color:var(--dsw-alias-label-tertiary);text-align:right;user-select:none;-webkit-user-select:none}
.pmh-rich-code__text{white-space:pre}
.pmh-rich-files__list{margin:0;padding:0;list-style:none}
.pmh-rich-file{display:flex;align-items:baseline;gap:8px;padding:5px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:12px}
.pmh-rich-file:last-child{border-bottom:0}
.pmh-rich-file__badge{flex:none;padding:0 6px;border-radius:5px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.7}
.pmh-rich-file__badge--added{color:var(--dsw-alias-state-business-primary)}
.pmh-rich-file__badge--deleted{color:var(--dsw-alias-state-warn-primary)}
.pmh-rich-file__path{flex:1;min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;text-overflow:ellipsis;white-space:nowrap}
.pmh-rich-file__path--action{padding:0;border:0;background:none;font:inherit;font-family:ui-monospace,SFMono-Regular,"Cascadia Mono",Consolas,monospace;text-align:left;cursor:pointer}
.pmh-rich-file__path--action:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}
.pmh-rich-file__path--action:focus-visible{border-radius:3px;outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pmh-rich-file__counts{display:flex;flex:none;gap:6px;font-size:11px;font-variant-numeric:tabular-nums}
.pmh-rich-file__add{color:var(--dsw-alias-state-business-primary)}
.pmh-rich-file__remove{color:var(--dsw-alias-state-warn-primary)}
.pmh-rich-files__more{margin:8px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px}
.pmh-rich--error{border-color:var(--dsw-alias-state-warn-primary)}
.pmh-rich--error .pmh-rich__title{font-size:13px}
@media (max-width:520px){
  .pmh-rich{padding:12px 13px 11px;border-radius:14px}
}
`
