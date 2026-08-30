import type { SalaryHistoryEntry } from "./types";

export function exportToCSV(history: SalaryHistoryEntry[], period: string): void {
  const headers = ["Matricule", "Nom", "Prénom", "Source", "Brut", "Cotisable", "Imposable", "IRG", "Retenues", "Net"];
  const rows = history.map(h => [
    h.matricule,
    h.nom,
    h.prenom,
    h.source === "app" ? "App" : "Historique",
    h.total_brut ?? 0,
    h.base_cotisable ?? 0,
    h.base_imposable ?? 0,
    h.irg ?? 0,
    h.total_retenues ?? 0,
    h.net_payer ?? 0,
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => {
      const s = String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(","))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `salaires_${period}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToExcel(history: SalaryHistoryEntry[], period: string): void {
  const headers = ["Matricule", "Nom", "Prénom", "Source", "Brut", "Cotisable", "Imposable", "IRG", "Retenues", "Net"];
  const rows = history.map(h => [
    h.matricule, h.nom, h.prenom, h.source === "app" ? "App" : "Historique",
    h.total_brut ?? 0, h.base_cotisable ?? 0, h.base_imposable ?? 0,
    h.irg ?? 0, h.total_retenues ?? 0, h.net_payer ?? 0,
  ]);

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
<Worksheet ss:Name="Salaires ${period}">
<Table>
${headers.map(h => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join("")}
${rows.map(r => `<Row>${r.map(v => {
  const isNum = typeof v === "number";
  return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${escapeXml(String(v))}</Data></Cell>`;
}).join("")}</Row>`).join("\n")}
</Table>
</Worksheet>
</Workbook>`;

  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `salaires_${period}.xls`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
