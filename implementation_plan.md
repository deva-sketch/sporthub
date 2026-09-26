# Phase 2 – Database Architecture & Setup

**Goal**: Add a robust PostgreSQL foundation using Prisma ORM that supports all core entities for SportHub while keeping the existing Phase 1 scaffolding intact.

---

## User Review Required

> [!IMPORTANT]
> This plan introduces a new `database/prisma/schema.prisma` file, a migration, a seed script, a Prisma client singleton, and updates to Docker Compose and `.env.example`. It will also add a few placeholder backend files to expose the Prisma client.
>
> Approve the plan so we can create the files and run the migration/seed.

---

## Open Questions

> [!WARNING]
> * **Docker compose file location** – The repository currently lacks a `docker-compose.yml`. Should we create it at the project root (`sporthub/docker-compose.yml`) or inside the `sporthub/` folder? The plan assumes the root of the project (same level as `frontend/` and `backend/`).
>
> * **Database name** – The example `.env.example` contains only `DATABASE_URL`. Do you want a specific database name (e.g., `sporthub`) or can we rely on the default created by the Docker Postgres service?
>
> * **Seed password** – Development seed users will use a static password (`Password123!`). Confirm this is acceptable for local testing.

---

## Proposed Changes

### 1. New directories & files

- `database/prisma/schema.prisma` – Full Prisma data model (User, Role, Sport, Tournament, Team, Player, TeamMembership, Venue, Match, MatchEvent, Score, PlayerStatistic).
- `database/prisma/.gitkeep` – Ensure the folder is tracked.
- `backend/src/config/prisma.ts` – Singleton PrismaClient instance.
- `prisma/seed.ts` – Seed script to insert roles, sports, and a handful of demo records.
- `prisma/.env` – Local environment for Prisma CLI (referencing `${DATABASE_URL}` from the root `.env.example`).
- `docker-compose.yml` – Add `postgres` service with volume persistence and expose port `5432`. Ensure `backend` service depends on `postgres` and uses the service name `postgres` as the DB host.
- Update `.env.example` with a comment for `DATABASE_URL` example (`postgresql://postgres:postgres@localhost:5432/sporthub`).

### 2. Modified files

- `backend/package.json` – Add a script `seed` that runs `ts-node prisma/seed.ts` and a `prisma:generate` script.
- `README.md` – Add a **Database** section describing Prisma setup, migration commands, seed command, and Docker usage.

### 3. Prisma Schema Highlights

```prisma
model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         Role     @relation(fields: [roleId], references: [id])
  roleId       String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  player       Player?
}

enum RoleName {
  ADMIN
  ORGANIZER
  TEAM_MANAGER
  PLAYER
}

model Role {
  id    String   @id @default(uuid())
  name  RoleName @unique
  users User[]
}

model Sport {
  id          String    @id @default(uuid())
  name        String    @unique
  description String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  tournaments Tournament[]
  teams       Team[]
}

// ... remaining models (Tournament, Team, Player, TeamMembership, Venue, Match, MatchEvent, Score, PlayerStatistic) with proper relations, enums for status/format, indexes on foreign keys, and unique constraints as described in the task.
```

### 4. Migration & Client Generation

1. `npx prisma migrate dev --name init` – creates the initial migration and updates the DB.
2. `npx prisma generate` – generates the Prisma client used by the backend.

### 5. Seed Script Flow

- Upsert the four roles.
- Upsert the five sports.
- Create a demo admin user (email: `admin@example.com`, password hashed with bcrypt).
- Create a couple of demo venues, teams, players, a tournament, and a match linking them.

### 6. Verification Plan

- Run `docker compose up -d` – ensure Postgres container starts and persists data.
- Execute `npm run prisma:generate` (backend) to compile the client.
- Run `npm run seed` – verify rows appear in the DB.
- Build and start the backend (`npm run dev` or Docker) – check `/health` still works.
- Run `npx prisma studio` manually to inspect the schema (optional).

---

## Verification Plan

**Automated steps**
- `docker compose up -d`
- `npm run prisma:generate`
- `npm run migrate`
- `npm run seed`
- `npm run dev` (backend) – curl `http://localhost:4000/health`.

**Manual checks**
- Confirm tables exist via `psql` or Prisma Studio.
- Verify seed data counts (roles = 4, sports = 5, admin user present).

---

Please review the plan and answer the open questions. Once approved, I will create the files, run the migration, generate the client, and execute the seed.
