/**
 * Development seed: a demo workspace with an active (fake) subscription, one client, one role and sample candidates.
 * Refuses to run in production. Login: demo@recruitgpt.local / DemoPass-12345
 */
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { scoreAndSave, upsertCandidate } from "@/lib/services/candidates";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");
  const email = "demo@recruitgpt.local";
  if (await prisma.user.findUnique({ where: { email } })) return console.log("Demo data already present.");

  const tenant = await prisma.tenant.create({
    data: { name: "Demo Search Partners", slug: "demo", subscriptionStatus: "ACTIVE", setupFeePaid: true, currentPeriodEnd: new Date(Date.now() + 30 * 864e5) },
  });
  const user = await prisma.user.create({ data: { email, name: "Demo Recruiter", passwordHash: await hashPassword("DemoPass-12345") } });
  await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "OWNER" } });

  const client = await prisma.client.create({ data: { tenantId: tenant.id, name: "Northwind Manufacturing", industry: "Industrial manufacturing", website: "https://example.com" } });
  const job = await prisma.jobOrder.create({
    data: {
      tenantId: tenant.id, clientId: client.id, title: "VP Finance", location: "Chicago, IL",
      description: "Lead finance for a $400M PE-backed manufacturer: FP&A, controllership, and M&A integration.",
      mustHaves: "SAP S/4HANA implementation\nPE-backed company experience\nM&A integration\nManufacturing finance",
      niceToHaves: "CPA\nOperational finance\nTreasury", compMin: 240000, compMax: 290000, discloseComp: false,
    },
  });

  const people = [
    ["Morgan Ellis", "VP Finance", "Apex Industrial", "Chicago, IL", "Led SAP S/4HANA rollout at PE-backed manufacturer. Ran M&A integration for 3 add-on acquisitions. CPA.", "SAP, FP&A, M&A, Manufacturing"],
    ["Priya Raman", "Corporate Controller", "Lakeshore Metals", "Naperville, IL", "Controller at manufacturing business, PE-owned. SAP migration lead. Some M&A due diligence.", "SAP, GAAP, Controllership"],
    ["Jordan Kim", "Director of FP&A", "Brightline Foods", "Chicago, IL", "FP&A leader at consumer goods company. Budgeting and forecasting. No ERP implementation ownership.", "FP&A, Excel, Hyperion"],
    ["Taylor Brooks", "CFO", "Summit Packaging", "Milwaukee, WI", "CFO of PE-backed packaging manufacturer, SAP S/4HANA, integrated two acquisitions, CPA, treasury.", "SAP, M&A, Treasury, CPA"],
    ["Alex Moreno", "Senior Accountant", "Harbor Retail", "Austin, TX", "Staff accountant in retail. Month-end close and reconciliations.", "QuickBooks, Reconciliation"],
    ["Sam Whitfield", "VP Finance", "Orion Chemicals", "Houston, TX", "Finance VP in chemicals manufacturing. PE-backed. Led M&A integration. Oracle ERP.", "Oracle, M&A, Manufacturing"],
  ];
  for (const [fullName, currentTitle, currentCompany, location, summary, skills] of people) {
    const [c] = await upsertCandidate(tenant.id, {
      fullName, currentTitle, currentCompany, location, summary, skills, headline: `${currentTitle} at ${currentCompany}`, source: "manual",
      sourceRef: `seed:${fullName}`, email: `${fullName.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    }, { jobOrderId: job.id });
    await scoreAndSave(tenant.id, job, c);
  }
  console.log("Seeded. Login: demo@recruitgpt.local / DemoPass-12345");
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
