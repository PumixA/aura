-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "apiKeyHash" TEXT,
ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false;
