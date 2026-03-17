-- AlterTable
ALTER TABLE "Template" ADD COLUMN "excludeGroups" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Template" ADD COLUMN "ignoredLabels" TEXT[] DEFAULT ARRAY[]::TEXT[];
