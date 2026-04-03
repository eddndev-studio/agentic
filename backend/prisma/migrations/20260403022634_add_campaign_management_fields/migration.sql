-- AlterTable
ALTER TABLE "AdSet" ADD COLUMN     "bidAmount" DOUBLE PRECISION,
ADD COLUMN     "billingEvent" TEXT,
ADD COLUMN     "dailyBudget" DOUBLE PRECISION,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "lifetimeBudget" DOUBLE PRECISION,
ADD COLUMN     "optimizationGoal" TEXT,
ADD COLUMN     "startTime" TIMESTAMP(3),
ADD COLUMN     "targeting" JSONB;

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "dailyBudget" DOUBLE PRECISION,
ADD COLUMN     "endTime" TIMESTAMP(3),
ADD COLUMN     "lifetimeBudget" DOUBLE PRECISION,
ADD COLUMN     "specialAdCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "startTime" TIMESTAMP(3);
