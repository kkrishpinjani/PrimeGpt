import { Document as Docx, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import ExcelJS from "exceljs";
import type { Candidate, JobOrder } from "@prisma/client";

/** Brief → .docx. Markdown-ish brief text is converted to headings/bullets. */
export async function briefDocx(c: Candidate, job: JobOrder | null, firm: string): Promise<Buffer> {
  const paras: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(`Candidate Brief: ${c.fullName}`)] }),
    new Paragraph({ children: [new TextRun({ text: `${firm}${job ? ` | ${job.title}` : ""} | Fit score ${c.fitScore ?? "n/a"}`, italics: true })] }),
    new Paragraph({ text: "" }),
  ];
  for (const raw of (c.brief ?? "No brief generated yet.").split("\n")) {
    const line = raw.trimEnd();
    if (/^##\s+/.test(line)) paras.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(line.replace(/^##\s+/, ""))] }));
    else if (/^[-*]\s+/.test(line)) paras.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(line.replace(/^[-*]\s+/, ""))] }));
    else paras.push(new Paragraph({ children: [new TextRun(line.replace(/^_|_$/g, ""))] }));
  }
  return Packer.toBuffer(new Docx({ sections: [{ children: paras }] }));
}

/** Side-by-side comparison / shortlist → .xlsx. */
export async function comparisonXlsx(cands: Candidate[], job: JobOrder | null): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Shortlist");
  ws.columns = [
    { header: "Rank", key: "rank", width: 6 }, { header: "Name", key: "name", width: 26 }, { header: "Title", key: "title", width: 30 },
    { header: "Company", key: "company", width: 26 }, { header: "Location", key: "loc", width: 22 }, { header: "Fit", key: "fit", width: 7 },
    { header: "Must-haves", key: "must", width: 11 }, { header: "Seniority", key: "sen", width: 10 }, { header: "Industry", key: "ind", width: 10 },
    { header: "Stability", key: "stab", width: 10 }, { header: "Location fit", key: "lf", width: 11 }, { header: "Status", key: "status", width: 12 },
    { header: "Rationale", key: "why", width: 70 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  [...cands].sort((a, b) => (b.fitScore ?? -1) - (a.fitScore ?? -1)).forEach((c, i) => {
    const b = (c.scoreBreakdown ?? {}) as Record<string, number>;
    ws.addRow({ rank: i + 1, name: c.fullName, title: c.currentTitle, company: c.currentCompany, loc: c.location, fit: c.fitScore, must: b.must_haves, sen: b.seniority_and_scope, ind: b.industry_relevance, stab: b.stability_and_trajectory, lf: b.location_fit, status: c.status, why: c.scoreRationale });
  });
  ws.getColumn("why").alignment = { wrapText: true, vertical: "top" };
  if (job) wb.addWorksheet("Role").addRows([["Title", job.title], ["Location", job.location ?? ""], ["Must haves", job.mustHaves ?? ""], ["Nice to haves", job.niceToHaves ?? ""]]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
