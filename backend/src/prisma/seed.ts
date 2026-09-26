// src/prisma/seed.ts
import prisma from '../config/prisma.js';
import bcrypt from 'bcrypt';
import { RoleName } from '@prisma/client';

const users = [
  { name: 'Admin Dev', email: 'admin@sporthub.test', password: 'AdminPass123!', role: 'ADMIN' },
  { name: 'Organizer Dev', email: 'organizer@sporthub.test', password: 'OrgPass123!', role: 'ORGANIZER' },
  { name: 'TeamMgr Dev', email: 'manager@sporthub.test', password: 'ManagerPass123!', role: 'TEAM_MANAGER' },
  { name: 'Player Dev', email: 'player@sporthub.test', password: 'PlayerPass123!', role: 'PLAYER' },
];

async function main() {
  // Ensure roles exist (if not already seeded)
  const roleNames = ['ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'];
  for (const roleName of roleNames) {
    await prisma.role.upsert({
      where: { name: roleName as RoleName },
      update: {},
      create: { name: roleName as RoleName },
    });
  }

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash: hash },
      create: {
        name: u.name,
        email: u.email,
        passwordHash: hash,
        role: { connect: { name: u.role as RoleName } },
      },
    });
  }

  console.log('Seeding completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
