-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SAHIP', 'YONETICI', 'MUHASEBE', 'URETIM_SEFI', 'DEPOCU', 'KALITECI', 'OPERATOR');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('MUSTERI', 'TEDARIKCI', 'FASONCU');

-- CreateEnum
CREATE TYPE "ModelStatus" AS ENUM ('NUMUNE', 'ONAYLI', 'URETIMDE', 'ARSIV');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('SATIS', 'FASON_ALINAN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('TASLAK', 'ONAYLANDI', 'URETIMDE', 'KISMI_SEVK', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANLANDI', 'DEVAM', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('BEKLIYOR', 'DEVAM', 'TAMAM');

-- CreateEnum
CREATE TYPE "FasonStatus" AS ENUM ('GONDERILDI', 'KISMI_DONDU', 'TAMAMLANDI', 'IPTAL');

-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('KUMAS', 'ASTAR', 'AKSESUAR', 'IPLIK', 'ETIKET', 'AMBALAJ', 'DIGER');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('GIRIS', 'CIKIS', 'IADE', 'SAYIM', 'FIRE', 'FASONA_CIKIS');

-- CreateEnum
CREATE TYPE "WageType" AS ENUM ('AYLIK', 'GUNLUK', 'PARCA_BASI');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('GELDI', 'GELMEDI', 'IZINLI', 'RAPORLU', 'YARIM_GUN');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('SATIS_FATURASI', 'ALIS_FATURASI', 'FASON_FATURASI', 'TAHSILAT', 'ODEME');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('NAKIT', 'HAVALE', 'CEK', 'SENET', 'KREDI_KARTI', 'DIGER');

-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('ALINAN', 'VERILEN');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PORTFOYDE', 'CIRO_EDILDI', 'TAHSIL_EDILDI', 'ODENDI', 'KARSILIKSIZ', 'IADE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('ACIK', 'TAMAM');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("tenantId","key")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roles" "PartyRole"[],
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxOffice" TEXT,
    "taxNo" TEXT,
    "city" TEXT,
    "address" TEXT,
    "specialties" TEXT[],
    "dailyCapacity" INTEGER,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleModel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "season" TEXT,
    "customerId" TEXT,
    "sizes" TEXT[],
    "colors" TEXT[],
    "status" "ModelStatus" NOT NULL DEFAULT 'NUMUNE',
    "description" TEXT,
    "route" TEXT[],
    "salePrice" DECIMAL(14,2),
    "overheadPct" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelMaterial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "consumption" DECIMAL(12,4) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ModelMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "minutes" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "pieceRate" DECIMAL(10,4) NOT NULL DEFAULT 0,

    CONSTRAINT "ModelOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'SATIS',
    "customerId" TEXT NOT NULL,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'TASLAK',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "customerRef" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sizes" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2),
    "shippedQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "orderId" TEXT,
    "orderLineId" TEXT,
    "modelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sizes" JSONB NOT NULL,
    "plannedQty" INTEGER NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANLANDI',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'BEKLIYOR',
    "outsourced" BOOLEAN NOT NULL DEFAULT false,
    "doneQty" INTEGER NOT NULL DEFAULT 0,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkOrderStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "sizes" JSONB,
    "source" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cutting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "lotId" TEXT,
    "materialId" TEXT,
    "layers" INTEGER NOT NULL,
    "markerLength" DECIMAL(10,2) NOT NULL,
    "fabricUsed" DECIMAL(12,3) NOT NULL,
    "sizes" JSONB NOT NULL,
    "cutQty" INTEGER NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cutting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceWork" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "operationId" TEXT,
    "description" TEXT,
    "qty" INTEGER NOT NULL,
    "rate" DECIMAL(10,4) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FasonJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "workOrderId" TEXT,
    "partyId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT,
    "sentQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,4),
    "sentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "dispatchNo" TEXT,
    "status" "FasonStatus" NOT NULL DEFAULT 'GONDERILDI',
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FasonJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FasonReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fasonJobId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "defectQty" INTEGER NOT NULL DEFAULT 0,
    "dispatchNo" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FasonReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'METRE',
    "widthCm" INTEGER,
    "gsm" INTEGER,
    "composition" TEXT,
    "supplierId" TEXT,
    "ownerPartyId" TEXT,
    "unitPrice" DECIMAL(12,4),
    "minStock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotNo" TEXT NOT NULL,
    "rollNo" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "remaining" DECIMAL(12,3) NOT NULL,
    "location" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "MovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,4),
    "partyId" TEXT,
    "workOrderId" TEXT,
    "docNo" TEXT,
    "note" TEXT,
    "userName" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinishedStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "secondQty" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FinishedStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "no" TEXT NOT NULL,
    "orderId" TEXT,
    "customerId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchNo" TEXT,
    "cartons" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderLineId" TEXT,
    "modelId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sizes" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2),

    CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "stage" TEXT NOT NULL,
    "checkedQty" INTEGER NOT NULL,
    "passedQty" INTEGER NOT NULL,
    "defects" JSONB NOT NULL DEFAULT '{}',
    "inspector" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "nationalId" TEXT,
    "iban" TEXT,
    "phone" TEXT,
    "department" TEXT NOT NULL,
    "position" TEXT,
    "wageType" "WageType" NOT NULL DEFAULT 'AYLIK',
    "wage" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "overtime" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "type" "TxType" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "method" "PayMethod",
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "docNo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CEK',
    "direction" "ChequeDirection" NOT NULL,
    "partyId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "bank" TEXT,
    "serialNo" TEXT,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PORTFOYDE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'ACIK',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "link" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Party_tenantId_name_idx" ON "Party"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StyleModel_tenantId_code_key" ON "StyleModel"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ModelMaterial_tenantId_modelId_idx" ON "ModelMaterial"("tenantId", "modelId");

-- CreateIndex
CREATE INDEX "ModelOperation_tenantId_modelId_idx" ON "ModelOperation"("tenantId", "modelId");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_dueDate_idx" ON "Order"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_no_key" ON "Order"("tenantId", "no");

-- CreateIndex
CREATE INDEX "OrderLine_tenantId_orderId_idx" ON "OrderLine"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "WorkOrder_tenantId_status_idx" ON "WorkOrder"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_tenantId_no_key" ON "WorkOrder"("tenantId", "no");

-- CreateIndex
CREATE INDEX "WorkOrderStage_tenantId_workOrderId_idx" ON "WorkOrderStage"("tenantId", "workOrderId");

-- CreateIndex
CREATE INDEX "StageLog_tenantId_createdAt_idx" ON "StageLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Cutting_tenantId_workOrderId_idx" ON "Cutting"("tenantId", "workOrderId");

-- CreateIndex
CREATE INDEX "PieceWork_tenantId_employeeId_date_idx" ON "PieceWork"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "FasonJob_tenantId_status_dueDate_idx" ON "FasonJob"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "FasonJob_tenantId_no_key" ON "FasonJob"("tenantId", "no");

-- CreateIndex
CREATE INDEX "FasonReceipt_tenantId_fasonJobId_idx" ON "FasonReceipt"("tenantId", "fasonJobId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_tenantId_code_key" ON "Material"("tenantId", "code");

-- CreateIndex
CREATE INDEX "MaterialLot_tenantId_materialId_idx" ON "MaterialLot"("tenantId", "materialId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_materialId_date_idx" ON "StockMovement"("tenantId", "materialId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FinishedStock_tenantId_modelId_color_size_key" ON "FinishedStock"("tenantId", "modelId", "color", "size");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_tenantId_no_key" ON "Shipment"("tenantId", "no");

-- CreateIndex
CREATE INDEX "QualityCheck_tenantId_date_idx" ON "QualityCheck"("tenantId", "date");

-- CreateIndex
CREATE INDEX "Employee_tenantId_active_idx" ON "Employee"("tenantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_tenantId_employeeId_date_key" ON "Attendance"("tenantId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "Advance_tenantId_employeeId_idx" ON "Advance"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_partyId_date_idx" ON "Transaction"("tenantId", "partyId", "date");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_status_dueDate_idx" ON "Cheque"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleModel" ADD CONSTRAINT "StyleModel_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelMaterial" ADD CONSTRAINT "ModelMaterial_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StyleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelMaterial" ADD CONSTRAINT "ModelMaterial_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelOperation" ADD CONSTRAINT "ModelOperation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StyleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StyleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StyleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderStage" ADD CONSTRAINT "WorkOrderStage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageLog" ADD CONSTRAINT "StageLog_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "WorkOrderStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cutting" ADD CONSTRAINT "Cutting_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cutting" ADD CONSTRAINT "Cutting_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceWork" ADD CONSTRAINT "PieceWork_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceWork" ADD CONSTRAINT "PieceWork_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceWork" ADD CONSTRAINT "PieceWork_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "ModelOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FasonJob" ADD CONSTRAINT "FasonJob_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FasonJob" ADD CONSTRAINT "FasonJob_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FasonReceipt" ADD CONSTRAINT "FasonReceipt_fasonJobId_fkey" FOREIGN KEY ("fasonJobId") REFERENCES "FasonJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_ownerPartyId_fkey" FOREIGN KEY ("ownerPartyId") REFERENCES "Party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLot" ADD CONSTRAINT "MaterialLot_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "MaterialLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinishedStock" ADD CONSTRAINT "FinishedStock_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "StyleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advance" ADD CONSTRAINT "Advance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
