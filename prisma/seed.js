const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const ADMIN_EMAIL = "admin@plannex.com";
  const ADMIN_PASSWORD = "Admin123!";

  console.log(" Checking admin account...");


  const existingAdmin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existingAdmin) {
    console.log("✅ Admin account already exists:");
    console.log(`   Email: ${ADMIN_EMAIL}`);
    return;
  }

  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      fullName: "System Administrator",
      passwordHash: hashed,     
      role: "ADMIN",
      status: "active",
      emailVerified: true,      
    },
  });

  console.log("   Admin created successfully:");
  console.log(`   Email: ${admin.email}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error("❌ Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
