import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
    const email = "demo@aura.local";
    const passwordHash = await bcrypt.hash("DemoPass123!", 12);

    const user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash, firstName: "Aura", lastName: "Demo" },
    });

    await prisma.userPrefs.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id, theme: "light", unitSystem: "metric" },
    });

    console.log("Seed OK →", user.email);
}

main().finally(() => prisma.$disconnect());
