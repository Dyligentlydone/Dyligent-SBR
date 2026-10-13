-- CreateTable
CREATE TABLE "PlaybookEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "leadId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaybookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaybookEntry_tenantId_kind_idx" ON "PlaybookEntry"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "PlaybookEntry" ADD CONSTRAINT "PlaybookEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
