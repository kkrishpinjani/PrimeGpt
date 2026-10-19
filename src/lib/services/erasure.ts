import { prisma } from "../db";

/**
 * Erasure (privacy policy): removes the candidate AND every message logged against them, inside one transaction.
 * Optionally records a do-not-contact entry so the person is not re-imported and contacted again.
 * Strictly scoped to the tenant: an id from another workspace is "not found".
 */
export async function eraseCandidate(tenantId: string, candidateId: string, keepDnc: boolean) {
  const c = await prisma.candidate.findFirst({ where: { id: candidateId, tenantId } });
  if (!c) throw new Error("Candidate not found");
  const ops = [];
  if (keepDnc && (c.email || c.phone || c.linkedinUrl)) {
    ops.push(prisma.doNotContact.create({ data: { tenantId, email: c.email, phone: c.phone, linkedinUrl: c.linkedinUrl, reason: "Erased at request; do not re-contact" } }));
  }
  ops.push(prisma.message.deleteMany({ where: { tenantId, candidateId } }), prisma.candidate.deleteMany({ where: { tenantId, id: candidateId } }));
  await prisma.$transaction(ops);
  return c;
}
