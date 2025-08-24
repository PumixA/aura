-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserPrefs" (
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "unitSystem" TEXT NOT NULL DEFAULT 'metric',
    "locale" TEXT NOT NULL DEFAULT 'fr-FR',
    "widgetsOrder" JSONB,

    CONSTRAINT "UserPrefs_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pairedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DevicePairingToken" (
    "deviceId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevicePairingToken_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "public"."LedState" (
    "deviceId" TEXT NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#FFFFFF',
    "brightness" INTEGER NOT NULL DEFAULT 50,
    "preset" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LedState_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "public"."MusicState" (
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pause',
    "volume" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicState_pkey" PRIMARY KEY ("deviceId")
);

-- CreateTable
CREATE TABLE "public"."DeviceWidget" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeviceWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Audit" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deviceId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "Device_ownerId_idx" ON "public"."Device"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "DevicePairingToken_token_key" ON "public"."DevicePairingToken"("token");

-- CreateIndex
CREATE INDEX "DevicePairingToken_expiresAt_idx" ON "public"."DevicePairingToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceWidget_deviceId_key_key" ON "public"."DeviceWidget"("deviceId", "key");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Audit_userId_idx" ON "public"."Audit"("userId");

-- CreateIndex
CREATE INDEX "Audit_deviceId_idx" ON "public"."Audit"("deviceId");

-- CreateIndex
CREATE INDEX "Audit_type_createdAt_idx" ON "public"."Audit"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserPrefs" ADD CONSTRAINT "UserPrefs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DevicePairingToken" ADD CONSTRAINT "DevicePairingToken_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LedState" ADD CONSTRAINT "LedState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicState" ADD CONSTRAINT "MusicState_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeviceWidget" ADD CONSTRAINT "DeviceWidget_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Audit" ADD CONSTRAINT "Audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Audit" ADD CONSTRAINT "Audit_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
