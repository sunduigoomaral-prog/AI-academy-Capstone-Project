-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('WAREHOUSE', 'PHARMACY');

-- CreateEnum
CREATE TYPE "Exclusivity" AS ENUM ('EX', 'NON_EX');

-- CreateEnum
CREATE TYPE "AbcClass" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "XyzClass" AS ENUM ('X', 'Y', 'Z');

-- CreateEnum
CREATE TYPE "AbcBasis" AS ENUM ('COGS_VALUE', 'REVENUE');

-- CreateEnum
CREATE TYPE "AbcXyzClass" AS ENUM ('AX', 'AY', 'AZ', 'BX', 'BY', 'BZ', 'CX', 'CY', 'CZ');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('ACTIVE', 'NO_MOVEMENT');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('NO_MOVEMENT', 'STOCKOUT_RISK', 'OVERSTOCK', 'SLOW_MOVING', 'LOW_STOCK', 'OPTIMAL');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('TRANSFER', 'NEW_PURCHASE', 'STOP_PURCHASE', 'MONITOR', 'PROMOTION');

-- CreateEnum
CREATE TYPE "SalesScope" AS ENUM ('ALL', 'WAREHOUSE', 'PHARMACY');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('PURCHASE', 'TRANSFER', 'STOCK_REDUCTION', 'DEAD_STOCK', 'STOCKOUT_RISK', 'PURCHASE_PRICE_ALERT', 'MARGIN_RISK', 'GENERAL');

-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('RULE_ENGINE', 'LLM', 'HYBRID');

-- CreateEnum
CREATE TYPE "PriceDimension" AS ENUM ('SUPPLIER', 'LOCATION', 'CHANNEL');

-- CreateEnum
CREATE TYPE "AiPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ReviewAction" AS ENUM ('ACCEPTED', 'REJECTED', 'MODIFIED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('DRAFT', 'OPEN', 'ACCEPTED', 'REJECTED', 'APPLIED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ProcessingStage" AS ENUM ('UPLOADING', 'VALIDATING', 'CLEANING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DatasetType" AS ENUM ('SALES', 'PURCHASE', 'STOCK', 'PRODUCT', 'LOCATION', 'CHANNEL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RowStatus" AS ENUM ('VALID', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "ValidationSeverity" AS ENUM ('WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "AnalysisRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('NUMBER', 'STRING', 'BOOLEAN', 'JSON');

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "type" "LocationType" NOT NULL,
    "companyId" TEXT NOT NULL,
    "channelId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "name" TEXT,
    "manufacturerName" TEXT,
    "exclusivity" "Exclusivity",
    "atcCode" TEXT,
    "packSize" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_fact" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "cogsAmount" DECIMAL(20,6) NOT NULL,
    "netSalesAmount" DECIMAL(20,6),
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "rowStatus" "RowStatus" NOT NULL DEFAULT 'VALID',
    "dedupeKey" TEXT NOT NULL,
    "occurrenceIndex" INTEGER NOT NULL DEFAULT 0,
    "sourceRowNo" INTEGER,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_fact" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "amountExVat" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6),
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "rowStatus" "RowStatus" NOT NULL DEFAULT 'VALID',
    "dedupeKey" TEXT NOT NULL,
    "occurrenceIndex" INTEGER NOT NULL DEFAULT 0,
    "sourceRowNo" INTEGER,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_fact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_snapshot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodKey" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(18,4) NOT NULL,
    "stockValue" DECIMAL(20,6) NOT NULL,
    "unitCost" DECIMAL(20,6),
    "rowStatus" "RowStatus" NOT NULL DEFAULT 'VALID',
    "dedupeKey" TEXT NOT NULL,
    "sourceRowNo" INTEGER,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "ConfigValueType" NOT NULL DEFAULT 'NUMBER',
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_policy" (
    "id" TEXT NOT NULL,
    "locationType" "LocationType" NOT NULL,
    "abcClass" "AbcClass" NOT NULL,
    "xyzClass" "XyzClass" NOT NULL,
    "targetDays" INTEGER NOT NULL,
    "minDaysFactor" DECIMAL(6,3),
    "maxDaysFactor" DECIMAL(6,3),
    "locationId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run" (
    "id" TEXT NOT NULL,
    "calculationMonth" TEXT NOT NULL,
    "lookbackMonths" INTEGER NOT NULL,
    "periodsUsed" TEXT[],
    "configSnapshot" JSONB NOT NULL,
    "abcBasis" "AbcBasis" NOT NULL DEFAULT 'COGS_VALUE',
    "salesScope" "SalesScope" NOT NULL DEFAULT 'ALL',
    "abcAThreshold" DECIMAL(6,4) NOT NULL DEFAULT 0.70,
    "abcBThreshold" DECIMAL(6,4) NOT NULL DEFAULT 0.90,
    "xyzXThreshold" DECIMAL(6,4) NOT NULL DEFAULT 0.25,
    "xyzYThreshold" DECIMAL(6,4) NOT NULL DEFAULT 0.50,
    "skuCount" INTEGER NOT NULL DEFAULT 0,
    "status" "AnalysisRunStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "triggeredBy" TEXT,

    CONSTRAINT "analysis_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abc_xyz_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT,
    "salesValue" DECIMAL(20,6) NOT NULL,
    "salesShare" DECIMAL(12,10) NOT NULL,
    "cumulativeShare" DECIMAL(12,10) NOT NULL,
    "rank" INTEGER NOT NULL,
    "abcClass" "AbcClass" NOT NULL,
    "monthlyQty" DECIMAL(18,4)[],
    "averageMonthlyQty" DECIMAL(18,6) NOT NULL,
    "stdDev" DECIMAL(18,6) NOT NULL,
    "cv" DECIMAL(14,8),
    "xyzClass" "XyzClass" NOT NULL,
    "monthsWithSales" INTEGER NOT NULL,
    "abcXyz" "AbcXyzClass" NOT NULL,
    "inventoryStatus" "InventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abc_xyz_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_result" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT,
    "channelCode" TEXT,
    "abcClass" "AbcClass" NOT NULL,
    "xyzClass" "XyzClass" NOT NULL,
    "abcXyz" "AbcXyzClass" NOT NULL,
    "averageMonthlySales" DECIMAL(18,6) NOT NULL,
    "targetDays" INTEGER NOT NULL,
    "targetMonths" DECIMAL(10,6) NOT NULL,
    "recommendedStock" DECIMAL(18,4) NOT NULL,
    "currentStock" DECIMAL(18,4) NOT NULL,
    "currentStockValue" DECIMAL(20,6) NOT NULL,
    "currentStockDays" DECIMAL(14,4) NOT NULL,
    "shortage" DECIMAL(18,4) NOT NULL,
    "excess" DECIMAL(18,4) NOT NULL,
    "shortageValue" DECIMAL(20,6),
    "excessValue" DECIMAL(20,6),
    "stockStatus" "StockStatus" NOT NULL,
    "transferInQty" INTEGER NOT NULL DEFAULT 0,
    "transferOutQty" INTEGER NOT NULL DEFAULT 0,
    "newPurchaseQty" INTEGER NOT NULL DEFAULT 0,
    "decision" "DecisionType" NOT NULL,
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_recommendation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fromLocationId" TEXT NOT NULL,
    "toLocationId" TEXT NOT NULL,
    "suggestedQty" INTEGER NOT NULL,
    "estimatedValue" DECIMAL(20,6),
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT,
    "priorityRank" INTEGER NOT NULL DEFAULT 0,
    "priority" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_recommendation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "suggestedQty" INTEGER NOT NULL,
    "referenceUnitPrice" DECIMAL(20,6),
    "estimatedCost" DECIMAL(20,6),
    "reasonCode" TEXT NOT NULL,
    "reason" TEXT,
    "priority" "Severity" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_price_benchmark" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "productName" TEXT,
    "dimension" "PriceDimension" NOT NULL DEFAULT 'SUPPLIER',
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "minUnitPrice" DECIMAL(20,6),
    "maxUnitPrice" DECIMAL(20,6),
    "minSourceKey" TEXT,
    "maxSourceKey" TEXT,
    "priceGap" DECIMAL(20,6),
    "priceGapPct" DECIMAL(14,6),
    "gapSeverity" TEXT,
    "totalQuantity" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(20,6) NOT NULL,
    "weightedAvgUnitPrice" DECIMAL(20,6),
    "currentQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currentCost" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "potentialSaving" DECIMAL(20,6),
    "firstPeriod" TEXT,
    "lastPeriod" TEXT,
    "firstUnitPrice" DECIMAL(20,6),
    "lastUnitPrice" DECIMAL(20,6),
    "priceChangePct" DECIMAL(14,6),
    "priceIncreaseSeverity" TEXT,
    "marginAtRisk" BOOLEAN NOT NULL DEFAULT false,
    "marginRiskReasons" JSONB,
    "excludedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_price_benchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_price_point" (
    "id" TEXT NOT NULL,
    "benchmarkId" TEXT NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "lastPurchasePeriod" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(20,6) NOT NULL,
    "unitPrice" DECIMAL(20,6) NOT NULL,
    "lowestRank" INTEGER NOT NULL,
    "highestRank" INTEGER NOT NULL,

    CONSTRAINT "purchase_price_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendation" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "type" "RecommendationType" NOT NULL,
    "source" "RecommendationSource" NOT NULL DEFAULT 'RULE_ENGINE',
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "productId" TEXT,
    "locationId" TEXT,
    "productCode" TEXT,
    "locationCode" TEXT,
    "risk" TEXT NOT NULL,
    "priority" "AiPriority" NOT NULL DEFAULT 'MEDIUM',
    "reason" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "transferPossible" BOOLEAN NOT NULL DEFAULT false,
    "purchaseRequired" BOOLEAN NOT NULL DEFAULT false,
    "stopPurchase" BOOLEAN NOT NULL DEFAULT false,
    "recommendedQuantity" INTEGER NOT NULL DEFAULT 0,
    "ruleCode" TEXT,
    "ruleVersion" TEXT,
    "evidence" JSONB,
    "llmModel" TEXT,
    "llmPromptRef" TEXT,
    "llmTokensIn" INTEGER,
    "llmTokensOut" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "ai_recommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_review" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "action" "ReviewAction" NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "oldQuantity" INTEGER,
    "newQuantity" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_file" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT,
    "extension" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "sheetCount" INTEGER NOT NULL DEFAULT 0,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "stage" "ProcessingStage" NOT NULL DEFAULT 'UPLOADING',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "stageMessage" TEXT,
    "errorMessage" TEXT,
    "rowsValid" INTEGER NOT NULL DEFAULT 0,
    "rowsWarning" INTEGER NOT NULL DEFAULT 0,
    "rowsError" INTEGER NOT NULL DEFAULT 0,
    "rowsInserted" INTEGER NOT NULL DEFAULT 0,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "source_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batch" (
    "id" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT,
    "sheetName" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL DEFAULT 0,
    "datasetType" "DatasetType" NOT NULL DEFAULT 'UNKNOWN',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "columnMap" JSONB,
    "unmappedColumns" JSONB,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsValid" INTEGER NOT NULL DEFAULT 0,
    "rowsWarning" INTEGER NOT NULL DEFAULT 0,
    "rowsError" INTEGER NOT NULL DEFAULT 0,
    "rowsLoaded" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "importedBy" TEXT,

    CONSTRAINT "import_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_issue" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "ValidationSeverity" NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNo" INTEGER NOT NULL,
    "columnName" TEXT,
    "value" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actor" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_code_key" ON "company"("code");

-- CreateIndex
CREATE UNIQUE INDEX "channel_code_key" ON "channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "location_code_key" ON "location"("code");

-- CreateIndex
CREATE INDEX "location_companyId_idx" ON "location"("companyId");

-- CreateIndex
CREATE INDEX "location_type_idx" ON "location"("type");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_code_key" ON "supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "product_productCode_key" ON "product"("productCode");

-- CreateIndex
CREATE INDEX "product_manufacturerName_idx" ON "product"("manufacturerName");

-- CreateIndex
CREATE INDEX "product_exclusivity_idx" ON "product"("exclusivity");

-- CreateIndex
CREATE UNIQUE INDEX "sales_fact_dedupeKey_key" ON "sales_fact"("dedupeKey");

-- CreateIndex
CREATE INDEX "sales_fact_productId_periodKey_idx" ON "sales_fact"("productId", "periodKey");

-- CreateIndex
CREATE INDEX "sales_fact_locationId_periodKey_idx" ON "sales_fact"("locationId", "periodKey");

-- CreateIndex
CREATE INDEX "sales_fact_periodKey_idx" ON "sales_fact"("periodKey");

-- CreateIndex
CREATE INDEX "sales_fact_productId_locationId_periodKey_idx" ON "sales_fact"("productId", "locationId", "periodKey");

-- CreateIndex
CREATE INDEX "sales_fact_importBatchId_idx" ON "sales_fact"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_fact_dedupeKey_key" ON "purchase_fact"("dedupeKey");

-- CreateIndex
CREATE INDEX "purchase_fact_productId_periodKey_idx" ON "purchase_fact"("productId", "periodKey");

-- CreateIndex
CREATE INDEX "purchase_fact_locationId_periodKey_idx" ON "purchase_fact"("locationId", "periodKey");

-- CreateIndex
CREATE INDEX "purchase_fact_supplierId_periodKey_idx" ON "purchase_fact"("supplierId", "periodKey");

-- CreateIndex
CREATE INDEX "purchase_fact_periodKey_idx" ON "purchase_fact"("periodKey");

-- CreateIndex
CREATE INDEX "purchase_fact_importBatchId_idx" ON "purchase_fact"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_snapshot_dedupeKey_key" ON "stock_snapshot"("dedupeKey");

-- CreateIndex
CREATE INDEX "stock_snapshot_periodKey_idx" ON "stock_snapshot"("periodKey");

-- CreateIndex
CREATE INDEX "stock_snapshot_locationId_periodKey_idx" ON "stock_snapshot"("locationId", "periodKey");

-- CreateIndex
CREATE INDEX "stock_snapshot_importBatchId_idx" ON "stock_snapshot"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_snapshot_productId_locationId_year_month_key" ON "stock_snapshot"("productId", "locationId", "year", "month");

-- CreateIndex
CREATE INDEX "analysis_config_key_isActive_idx" ON "analysis_config"("key", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_config_key_version_key" ON "analysis_config"("key", "version");

-- CreateIndex
CREATE INDEX "inventory_policy_isActive_idx" ON "inventory_policy"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_policy_locationType_abcClass_xyzClass_locationId__key" ON "inventory_policy"("locationType", "abcClass", "xyzClass", "locationId", "version");

-- CreateIndex
CREATE INDEX "analysis_run_calculationMonth_idx" ON "analysis_run"("calculationMonth");

-- CreateIndex
CREATE INDEX "analysis_run_status_idx" ON "analysis_run"("status");

-- CreateIndex
CREATE INDEX "abc_xyz_result_runId_abcXyz_idx" ON "abc_xyz_result"("runId", "abcXyz");

-- CreateIndex
CREATE INDEX "abc_xyz_result_runId_rank_idx" ON "abc_xyz_result"("runId", "rank");

-- CreateIndex
CREATE INDEX "abc_xyz_result_runId_inventoryStatus_idx" ON "abc_xyz_result"("runId", "inventoryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "abc_xyz_result_runId_productId_key" ON "abc_xyz_result"("runId", "productId");

-- CreateIndex
CREATE INDEX "analysis_result_runId_abcXyz_idx" ON "analysis_result"("runId", "abcXyz");

-- CreateIndex
CREATE INDEX "analysis_result_runId_stockStatus_idx" ON "analysis_result"("runId", "stockStatus");

-- CreateIndex
CREATE INDEX "analysis_result_runId_decision_idx" ON "analysis_result"("runId", "decision");

-- CreateIndex
CREATE INDEX "analysis_result_runId_locationId_idx" ON "analysis_result"("runId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_result_runId_productId_locationId_key" ON "analysis_result"("runId", "productId", "locationId");

-- CreateIndex
CREATE INDEX "transfer_recommendation_runId_priority_idx" ON "transfer_recommendation"("runId", "priority");

-- CreateIndex
CREATE INDEX "purchase_recommendation_runId_priority_idx" ON "purchase_recommendation"("runId", "priority");

-- CreateIndex
CREATE INDEX "purchase_price_benchmark_runId_gapSeverity_idx" ON "purchase_price_benchmark"("runId", "gapSeverity");

-- CreateIndex
CREATE INDEX "purchase_price_benchmark_runId_marginAtRisk_idx" ON "purchase_price_benchmark"("runId", "marginAtRisk");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_price_benchmark_runId_productId_key" ON "purchase_price_benchmark"("runId", "productId");

-- CreateIndex
CREATE INDEX "purchase_price_point_benchmarkId_lowestRank_idx" ON "purchase_price_point"("benchmarkId", "lowestRank");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_price_point_benchmarkId_dimensionKey_key" ON "purchase_price_point"("benchmarkId", "dimensionKey");

-- CreateIndex
CREATE INDEX "ai_recommendation_runId_priority_idx" ON "ai_recommendation"("runId", "priority");

-- CreateIndex
CREATE INDEX "ai_recommendation_runId_risk_idx" ON "ai_recommendation"("runId", "risk");

-- CreateIndex
CREATE INDEX "ai_recommendation_status_priority_idx" ON "ai_recommendation"("status", "priority");

-- CreateIndex
CREATE INDEX "recommendation_review_recommendationId_idx" ON "recommendation_review"("recommendationId");

-- CreateIndex
CREATE INDEX "recommendation_review_reviewedBy_idx" ON "recommendation_review"("reviewedBy");

-- CreateIndex
CREATE INDEX "source_file_fileHash_idx" ON "source_file"("fileHash");

-- CreateIndex
CREATE INDEX "source_file_stage_idx" ON "source_file"("stage");

-- CreateIndex
CREATE INDEX "import_batch_sourceFileId_idx" ON "import_batch"("sourceFileId");

-- CreateIndex
CREATE INDEX "import_batch_status_idx" ON "import_batch"("status");

-- CreateIndex
CREATE INDEX "validation_issue_importBatchId_severity_idx" ON "validation_issue"("importBatchId", "severity");

-- CreateIndex
CREATE INDEX "validation_issue_importBatchId_code_idx" ON "validation_issue"("importBatchId", "code");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_fact" ADD CONSTRAINT "sales_fact_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_fact" ADD CONSTRAINT "sales_fact_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_fact" ADD CONSTRAINT "sales_fact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_fact" ADD CONSTRAINT "sales_fact_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_fact" ADD CONSTRAINT "purchase_fact_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_fact" ADD CONSTRAINT "purchase_fact_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_fact" ADD CONSTRAINT "purchase_fact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_fact" ADD CONSTRAINT "purchase_fact_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_fact" ADD CONSTRAINT "purchase_fact_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abc_xyz_result" ADD CONSTRAINT "abc_xyz_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abc_xyz_result" ADD CONSTRAINT "abc_xyz_result_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_result" ADD CONSTRAINT "analysis_result_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_recommendation" ADD CONSTRAINT "transfer_recommendation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_recommendation" ADD CONSTRAINT "transfer_recommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_recommendation" ADD CONSTRAINT "transfer_recommendation_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_recommendation" ADD CONSTRAINT "transfer_recommendation_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_recommendation" ADD CONSTRAINT "purchase_recommendation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_recommendation" ADD CONSTRAINT "purchase_recommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_price_benchmark" ADD CONSTRAINT "purchase_price_benchmark_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_price_benchmark" ADD CONSTRAINT "purchase_price_benchmark_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_price_point" ADD CONSTRAINT "purchase_price_point_benchmarkId_fkey" FOREIGN KEY ("benchmarkId") REFERENCES "purchase_price_benchmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendation" ADD CONSTRAINT "ai_recommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_review" ADD CONSTRAINT "recommendation_review_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "ai_recommendation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "source_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_issue" ADD CONSTRAINT "validation_issue_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
