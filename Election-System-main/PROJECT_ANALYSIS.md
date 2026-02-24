# Election System - Project Analysis

## 🎯 Overview

This is a **full-stack election management system** built with modern web technologies. It's a monorepo that includes:
- **Backend**: Express.js REST API with PostgreSQL database
- **Frontend**: React + TypeScript with Tailwind CSS UI
- **Shared**: Type-safe schema definitions and API contracts

---

## 🏗️ Architecture

### Tech Stack

**Backend:**
- Express.js (Node.js framework)
- PostgreSQL (database)
- Drizzle ORM (type-safe database queries)
- Passport.js (authentication)
- Zod (schema validation)

**Frontend:**
- React 18 + TypeScript
- Vite (bundler)
- TanStack React Query (data fetching)
- Framer Motion (animations)
- Tailwind CSS (styling)
- Radix UI (headless components)
- Wouter (routing)

**Forms & Validation:**
- React Hook Form (form handling)
- Zod (schema validation)

---

## 📊 Database Schema

### Core Tables

1. **users** - Voters and administrators
   - `id` (PK)
   - `username` (unique)
   - `password` (hashed)
   - `isAdmin` (boolean)
   - `name` (full name)
   - `createdAt`

2. **elections** - Election events
   - `id` (PK)
   - `title`
   - `description`
   - `startDate` / `endDate`
   - `isPublished` (boolean)
   - `createdAt`

3. **candidates** - People running in elections
   - `id` (PK)
   - `electionId` (FK to elections)
   - `name`
   - `platform` (campaign platform text)
   - `symbol` (e.g., "Tree", "Flower", "Star")
   - `party` (e.g., "Green Party", "Independent")
   - `status` ("pending" | "approved" | "rejected")
   - `appliedAt` / `createdAt`

4. **votes** - Individual votes cast
   - `id` (PK)
   - `voterId` (FK to users)
   - `electionId` (FK to elections)
   - `candidateId` (FK to candidates)
   - `createdAt`
   - **Unique index**: (voterId, electionId) - prevents duplicate voting

### Key Features:
- Each voter can only vote once per election (enforced by unique constraint)
- Candidates must be approved before voters can vote for them
- Candidates can apply to multiple elections

---

## 🔐 Authentication & Authorization

### Flow
1. **Registration**: Users create account with username/password (hashed with scrypt)
2. **Login**: Passport.js validates credentials, creates session
3. **Session Management**: Express-session with PostgreSQL session store
4. **Authorization**: Checked via `req.user?.isAdmin` flag

### User Types
- **Voter**: Regular user who can cast votes and view elections
- **Admin**: Can create/edit elections, manage candidates, view analytics

### Routes Protection
- Checked in middleware before route handler
- Returns `401` if unauthenticated, `403` if unauthorized

---

## 📡 API Structure

### Authentication Endpoints
```
POST   /api/register
POST   /api/login
POST   /api/logout
GET    /api/user
```

### Election Endpoints
```
GET    /api/elections                 (list all with vote status for voters)
GET    /api/elections/:id             (get election + candidates)
POST   /api/elections                 (admin only - create)
PATCH  /api/elections/:id             (admin only - update)
DELETE /api/elections/:id             (admin only - delete)
POST   /api/elections/:id/publish     (admin only - publish)
```

### Voting Endpoints
```
POST   /api/elections/:electionId/vote
GET    /api/elections/:electionId/results
GET    /api/user/votes               (get user's voting history)
```

### Candidate Endpoints
```
GET    /api/elections/:electionId/candidates
POST   /api/candidates               (voter applies to be candidate)
PATCH  /api/candidates/:id           (admin approves/rejects)
```

### Admin Analytics Endpoints
```
GET    /api/analytics               (system-wide stats)
GET    /api/analytics/elections
GET    /api/analytics/candidates
GET    /api/analytics/voters
```

---

## 🎨 Frontend Structure

### Pages

**Public Pages:**
- `login-page.tsx` - User login form
- `register-page.tsx` - User registration

**Voter Pages:**
- `dashboard.tsx` - Main page showing active/upcoming/past elections with stats
- `elections.tsx` - Full elections list with filters
- `election-detail.tsx` - View specific election candidates and vote
- `my-votes.tsx` - History of user's past votes
- `apply-candidate.tsx` - Form for voter to apply as candidate

**Admin Pages:**
- `admin-dashboard.tsx` - Admin homepage with quick stats
- `admin-candidates.tsx` - Manage candidate applications (approve/reject)
- `admin-election-detail.tsx` - Edit election details
- `create-election.tsx` - Form to create new election
- `admin-analytics.tsx` - System-wide statistics and charts
- `admin-voters.tsx` - List of all registered voters

### Key Components

**Layout:**
- `layout-shell.tsx` - Wraps all pages, provides navigation/header

**Custom Components:**
- `election-card.tsx` - Reusable card displaying election info with action buttons

**UI Component Library:**
- Large collection of shadcn/ui components (buttons, cards, forms, dialogs, etc.)
- Located in `components/ui/` folder

### React Hooks

**Custom Hooks:**
- `use-auth.tsx` - Manages user auth state, login/register/logout mutations
- `use-elections.tsx` - Fetches elections list with filtering
- `use-mobile.tsx` - Detects if viewport is mobile
- `use-toast.ts` - Toast notification system

---

## 🔄 Data Flow

### Typical User Journey

#### 1. **Registration & Login**
```
User → RegisterPage → POST /api/register → Express creates user (hashed pwd) → Session established
User → LoginPage → POST /api/login → Passport validates → Session created → Redirect to /dashboard
```

#### 2. **Voting**
```
User → Dashboard → Click Election → ElectionDetail → View candidates → Click "Vote" 
→ POST /api/elections/:electionId/vote → Server checks:
   - User authenticated ✓
   - Election ongoing ✓ 
   - User hasn't voted yet ✓
   - Candidate exists & approved ✓
→ Vote recorded → UI updates (hasVoted = true)
```

#### 3. **Admin Creating Election**
```
Admin → CreateElection page → Fill form (title, description, dates) 
→ POST /api/elections → Server validates dates, creates election
→ Server returns election ID
→ Admin can now add candidates manually (via admin panel)
```

#### 4. **Candidate Application**
```
Voter → ApplyCandidate page → Fill form (election, name, platform, symbol, party)
→ POST /api/candidates → Server creates with status="pending"
→ Admin → AdminCandidates page → Reviews pending applications
→ PATCH /api/candidates/:id → Admin approves (status → "approved")
→ Candidate now visible to voters
```

---

## 📦 Project Structure

```
Election-System/
├── shared/                 # Shared types, schemas, API contracts
│   ├── schema.ts          # Drizzle table definitions + Zod schemas
│   └── routes.ts          # API type definitions
│
├── server/                # Express backend
│   ├── index.ts           # Server entry point
│   ├── routes.ts          # All API route handlers
│   ├── auth.ts            # Passport config + auth endpoints
│   ├── storage.ts         # Database queries (Drizzle ORM)
│   ├── db.ts              # Database connection setup
│   └── migrate.ts         # Database migrations
│
├── client/                # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main router component
│   │   ├── pages/         # Page components (routes)
│   │   ├── components/    # Reusable UI components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utilities (queryClient, utils)
│   │   ├── index.css      # Global styles
│   │   └── main.tsx       # React entry point
│   └── index.html         # HTML template
│
├── package.json           # Dependencies for entire monorepo
├── tsconfig.json          # TypeScript config
├── vite.config.ts         # Vite bundler config
├── tailwind.config.ts     # Tailwind CSS setup
└── drizzle.config.ts      # Drizzle ORM config
```

---

## 🚀 Development Workflow

### Setup
```bash
npm install              # Install all dependencies
npm run db:push          # Run database migrations
npm run dev              # Start dev server (Vite + Express)
```

### Build & Run
```bash
npm run build            # Build for production
npm start                # Run production server
npm run check            # TypeScript type checking
```

### Key Scripts
- `dev`: Runs Express server with hot reload + Vite dev server
- `build`: Bundles React frontend + Express backend into one output
- `db:push`: Applies schema changes to PostgreSQL database

---

## 🔑 Key Features

### ✅ For Voters
- Register/login with secure password hashing
- Browse active, upcoming, and past elections
- Vote once per election (enforced at DB level)
- View detailed candidate info (platform, symbol, party)
- Apply to be a candidate yourself
- See vote history

### ✅ For Admins
- Create and manage elections (with date ranges)
- Publish/unpublish elections
- Review and approve/reject candidate applications
- View system analytics (total voters, elections, votes)
- Monitor candidate applications
- See voter participation stats

### ✅ Technical
- Type-safe: Full TypeScript + Zod validation
- Session-based auth with secure password hashing
- Single vote guarantee per election (unique constraint)
- Responsive UI with Tailwind CSS
- Real-time updates with React Query
- Smooth animations with Framer Motion

---

## 🗄️ Database Initialization

The system automatically:
1. Creates tables from schema on first run
2. Runs any pending migrations
3. Seeds a default admin user (credentials available in admin panel or docs)

---

## 📋 Current State

- ✅ Core voting system implemented
- ✅ Authentication & authorization working
- ✅ Basic admin dashboard
- ✅ Candidate application system
- ✅ Vote history tracking
- ✅ Analytics endpoints ready
- ⚠️ Some admin features may still be in development

---

## 🎓 Learning Points

This codebase demonstrates:
1. **Full-stack TypeScript**: Shared types between frontend and backend
2. **Modern React patterns**: Hooks, Query, React Router
3. **Backend architecture**: Express middleware, Passport auth, ORM usage
4. **Database design**: Relationships, constraints, migrations
5. **Component-based UI**: Radix UI + Tailwind for accessible design
6. **Form handling**: React Hook Form + Zod validation
7. **Session management**: Cookie-based sessions with PostgreSQL store
