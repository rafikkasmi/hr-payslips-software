import type { CalcResult } from "./api";
import { formatCurrency } from "./utils";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtPeriod(period: string): string {
  if (!period) return period;
  const parts = period.split("-");
  let y: number, m: number;
  if (parts[0].length === 4) { y = +parts[0]; m = +parts[1]; }
  else { m = +parts[0]; y = +parts[1]; }
  return new Date(y, m - 1).toLocaleDateString("fr-FR", { year: "numeric", month: "long" });
}

export function generatePayslipHTML(r: CalcResult, company = "HAMTECH"): string {
  // Show ALL non-zero lines. ord_bul is for SORTING only, not filtering.
  const active = r.lines.filter(l => l.amount !== 0);
  // Sort by ord_bul when > 0, otherwise keep original order
  const sorted = [...active].sort((a, b) => {
    const aOrd = a.ord_bul ?? 0;
    const bOrd = b.ord_bul ?? 0;
    if (aOrd > 0 && bOrd > 0) return aOrd - bOrd;
    if (aOrd > 0) return -1;
    if (bOrd > 0) return 1;
    return 0;
  });
  const gains = sorted.filter(l => l.classe === 1 && l.amount > 0);
  const retenues = sorted.filter(l => l.classe === 2 || (l.classe === 1 && l.amount < 0));
  const infoLines = sorted.filter(l => l.classe !== 1 && l.classe !== 2);
  const keyCodes = ["763","765","767","770","807","817","819","824"];
  const keyInfos = sorted.filter(l => keyCodes.includes(l.code));
  const bGains = (r.applied_bonuses ?? []).filter(b => b.computed_amount > 0 && !b.rubrique_code);
  const bRet = (r.applied_bonuses ?? []).filter(b => b.computed_amount < 0 && !b.rubrique_code);
  const pf = fmtPeriod(r.period);

  const gRows = [...gains.map(l => `<tr><td class="c">${esc(l.code)}</td><td>${esc(l.libelle || `(R${l.code})`)}</td><td class="a">${formatCurrency(l.amount)}</td></tr>`),
    ...bGains.map(b => `<tr class="b"><td class="c">${esc(b.rubrique_code ?? "—")}</td><td><i>${esc(b.title)}</i></td><td class="a">${formatCurrency(b.computed_amount)}</td></tr>`)].join("");
  const rRows = [...retenues.map(l => `<tr><td class="c">${esc(l.code)}</td><td>${esc(l.libelle || `(R${l.code})`)}</td><td class="a rd">${formatCurrency(Math.abs(l.amount))}</td></tr>`),
    ...bRet.map(b => `<tr class="b"><td class="c">${esc(b.rubrique_code ?? "—")}</td><td><i>${esc(b.title)}</i></td><td class="a rd">${formatCurrency(Math.abs(b.computed_amount))}</td></tr>`)].join("");
  const iRows = infoLines.map(l => `<tr><td class="c">${esc(l.code)}</td><td>${esc(l.libelle || `(R${l.code})`)}</td><td class="a">${formatCurrency(l.amount)}</td></tr>`).join("");
  const infoHtml = infoLines.length ? `<div class="info"><h3>Informations</h3><table><tbody>${iRows}</tbody></table></div>` : "";
  const kiHtml = keyInfos.length ? `<div class="ki">${keyInfos.map(l => `<span><b>${esc(l.libelle || `(R${l.code})`)}:</b> ${formatCurrency(l.amount)}</span>`).join(" ")}</div>` : "";

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Bulletin - ${esc(r.employee_name)} - ${esc(r.period)}</title>
<style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;padding:20px;color:#1a1a1a}
.hd{display:flex;justify-content:space-between;border-bottom:2px solid #1a1a1a;padding-bottom:8px;margin-bottom:12px}
.hd h1{font-size:20px;margin:0}.hd .p{text-align:right}.hd .p .bg{font-size:16px;font-weight:600}.hd .p .sm{font-size:11px;color:#666}
.emp{display:flex;gap:24px;background:#f5f5f5;padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:13px}
.emp .lb{color:#666;font-size:11px}.emp .vl{font-weight:600}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.col h3{font-size:11px;font-weight:700;margin:0 0 4px;padding:4px 8px;border-bottom:1px solid #ccc}
.col.g h3{background:#f0fdf4}.col.r h3{background:#fef2f2}
table{width:100%;border-collapse:collapse;font-size:11px}td{padding:2px 4px;border-bottom:1px solid #f0f0f0}
td.c{font-family:monospace;color:#999;width:32px}td.a{text-align:right;font-weight:500;white-space:nowrap}
td.a.rd{color:#dc2626}tr.b{background:#f9fafb}
.tot{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px}
.tot .bx{border:1px solid #e5e7eb;border-radius:4px;padding:6px;text-align:center;font-size:11px}
.tot .bx .lb{color:#666}.tot .bx .vl{font-weight:700}
.ki{background:#f5f5f5;padding:6px 8px;border-radius:4px;margin-bottom:12px;font-size:11px;display:flex;flex-wrap:wrap;gap:12px}
.info{margin-bottom:12px}.info h3{font-size:11px;font-weight:700;margin:0 0 4px;padding:4px 8px;border-bottom:1px solid #ccc;background:#f3f4f6}
.net{display:flex;justify-content:space-between;border:2px solid #16a34a;background:#f0fdf4;border-radius:8px;padding:8px 16px;margin-bottom:8px}
.net .lb{font-size:14px;font-weight:700}.net .vl{font-size:20px;font-weight:700;color:#15803d}
.ft{text-align:center;font-size:10px;color:#999;padding-top:4px}
@media print{@page{margin:1.5cm}}
</style></head><body>
<div class="hd"><div><h1>${esc(company)}</h1><p style="font-size:11px;color:#666;margin:2px 0 0">Bulletin de Paie</p></div>
<div class="p"><div class="bg">${esc(pf)}</div><div class="sm">${esc(r.period)}</div></div></div>
<div class="emp"><div><span class="lb">Employé: </span><span class="vl">${esc(r.employee_name)}</span></div>
<div><span class="lb">Matricule: </span><span class="vl" style="font-family:monospace">${esc(r.matricule)}</span></div></div>
<div class="cols"><div class="col g"><h3>Gains &amp; Primes</h3><table><tbody>${gRows}</tbody></table></div>
<div class="col r"><h3>Retenues</h3><table><tbody>${rRows}</tbody></table></div></div>
${infoHtml}
<div class="tot"><div class="bx"><div class="lb">Brut</div><div class="vl">${formatCurrency(r.total_brut)}</div></div>
<div class="bx"><div class="lb">Cotisable</div><div class="vl">${formatCurrency(r.base_cotisable)}</div></div>
<div class="bx"><div class="lb">Imposable</div><div class="vl">${formatCurrency(r.base_imposable)}</div></div>
<div class="bx"><div class="lb">Retenues</div><div class="vl" style="color:#dc2626">${formatCurrency(r.total_retenues)}</div></div></div>
${kiHtml}
<div class="net"><span class="lb">NET À PAYER</span><span class="vl">${formatCurrency(r.net_payer)}</span></div>
<div class="ft">Bulletin généré le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})} · ${esc(company)}</div>
</body></html>`;
}

export function sanitizeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").trim() || "bulletin";
}
