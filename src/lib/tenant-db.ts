import { prisma } from "./db";

/**
 * Tenant isolation (WS1). MySQL has no row-level security, so isolation is enforced here:
 * every query made through tdb(tenantId) is forced to include tenantId in WHERE / data.
 * App code must never use the bare `prisma` client for tenant-owned models.
 * tests/isolation.test.ts is the "isolation gate".
 */
export const TENANT_MODELS = new Set([
  "Client", "JobOrder", "Candidate", "Contact", "Prospect", "Message", "DoNotContact",
  "SavedSearch", "Run", "Interview", "Document", "ExecutorDevice", "Integration", "UsageEvent", "Invite", "JobMatch", "ExpertRequest",
]);

const WHERE_OPS = new Set([
  "findMany", "findFirst", "findFirstOrThrow", "findUnique", "findUniqueOrThrow", "count", "aggregate",
  "groupBy", "update", "updateMany", "delete", "deleteMany", "upsert",
]);

export function tdb(tenantId: string) {
  if (!tenantId) throw new Error("tdb() requires a tenantId");
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a: any = args ?? {};
          if (WHERE_OPS.has(operation)) a.where = { ...(a.where ?? {}), tenantId };
          if (operation === "create") a.data = { ...a.data, tenantId };
          if (operation === "upsert") a.create = { ...a.create, tenantId };
          if (operation === "createMany") {
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d: any) => ({ ...d, tenantId }));
          }
          if (operation === "update" || operation === "updateMany") {
            if (a.data && "tenantId" in a.data) delete a.data.tenantId; // never allow tenant hopping
          }
          return query(a);
        },
      },
    },
  });
}
export type TenantDb = ReturnType<typeof tdb>;
