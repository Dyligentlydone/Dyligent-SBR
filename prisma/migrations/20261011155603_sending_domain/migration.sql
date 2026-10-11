-- CreateTable
CREATE TABLE "SendingDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "resendDomainId" TEXT,
    "records" TEXT,
    "fromEmail" TEXT NOT NULL,
    "replyTo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SendingDomain_tenantId_key" ON "SendingDomain"("tenantId");

-- AddForeignKey
ALTER TABLE "SendingDomain" ADD CONSTRAINT "SendingDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
