# LoftCommunity Data Model

> Complete database schema reference for the LoftCommunity backend.
> Source: `loft-backend/prisma/schema.prisma` — extracted 2026-07-23.

---

## 1. Overview

PostgreSQL database managed via Prisma ORM with 30 models, 16 enums, and a NextAuth-compatible authentication layer. The schema serves an employment/job portal platform (LoftCommunity) supporting job seekers, employers, job listings, applications, interviews, English proficiency testing, messaging, and notifications. The `Job` model follows the canonical job model shared with hirehub-backend (converged 2026-08-06).

## 2. Database Configuration

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- **Provider:** PostgreSQL
- **Connection:** via `DATABASE_URL` environment variable
- **Client:** `prisma-client-js` (auto-generated)

---

## 3. Models

### Account

- **Purpose:** Stores OAuth provider account linkages for NextAuth-compatible authentication.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | String | `@id @default(cuid())` |
  | userId | String | References `User.clerkId` |
  | type | String | |
  | provider | String | |
  | providerAccountId | String | |
  | refresh_token | String? | `@db.Text` |
  | access_token | String? | `@db.Text` |
  | expires_at | Int? | |
  | token_type | String? | |
  | scope | String? | |
  | id_token | String? | `@db.Text` |
  | session_state | String? | |

- **Relations:** `User` via `userId` → `User.clerkId` (onDelete: Cascade)
- **Indexes:** `@@unique([provider, providerAccountId])`
- **Notes:** NextAuth adapter model. Cascades on user deletion.

---

### Session

- **Purpose:** Stores active user sessions for NextAuth-compatible session management.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | String | `@id @default(cuid())` |
  | sessionToken | String | `@unique` |
  | userId | String | References `User.clerkId` |
  | expires | DateTime | |

- **Relations:** `User` via `userId` → `User.clerkId` (onDelete: Cascade)
- **Indexes:** `sessionToken` has `@unique`
- **Notes:** NextAuth adapter model. Cascades on user deletion.

---

### VerificationToken

- **Purpose:** Stores email verification tokens for NextAuth flow.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | identifier | String | |
  | token | String | `@unique` |
  | expires | DateTime | |

- **Relations:** None
- **Indexes:** `@@unique([identifier, token])`
- **Notes:** No model-level primary key (composite unique only). NextAuth adapter model.

---

### User

- **Purpose:** Core user entity for both job seekers and employers. Stores identity, profile data, employment status, English test scores, and tier/credits.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | clerkId | String | `@unique` — legacy Clerk identifier, "local\_\<timestamp\>" for credentials |
  | email | String | `@unique` |
  | name | String? | |
  | firstName | String? | |
  | lastName | String? | |
  | profileImage | String? | |
  | phone | String? | |
  | hashedPassword | String? | For credentials login |
  | dateOfBirth | DateTime? | |
  | address | String? | |
  | city | String? | |
  | country | String? | |
  | nationality | String? | |
  | isEmployer | Boolean | `@default(false)` |
  | isApplicant | Boolean | `@default(true)` |
  | isVerified | Boolean | `@default(false)` |
  | emailVerified | Boolean | `@default(false)` |
  | englishTestScore | Int? | |
  | englishTestDate | DateTime? | |
  | englishTestLevel | EnglishLevel? | `@default(BEGINNER)` |
  | tier | String | `@default("Free")` |
  | credits | String | `@default("10")` |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:**
  - `UserProfile?` — one-to-one
  - `Resume?` — one-to-one
  - `JobApplication[]` — one-to-many
  - `EmployerProfile?` — one-to-one
  - `EnglishTestResult[]` — one-to-many
  - `Message[]` (SentMessages) — one-to-many
  - `Message[]` (ReceivedMessages) — one-to-many
  - `CompanyMember[]` — one-to-many
  - `Account[]` — one-to-many (NextAuth)
  - `Session[]` — one-to-many (NextAuth)
- **Indexes:** `clerkId` has `@unique`, `email` has `@unique`
- **Notes:** `clerkId` is the canonical user identifier (remnant of Clerk auth migration). The `isEmployer`/`isApplicant` booleans model dual-role users. `tier` and `credits` are stored as strings (possibly for future string-based tier names).

---

### UserProfile

- **Purpose:** Extended professional profile for job seekers, including skills, education, work history, language proficiency, and availability preferences.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | `@unique` — references `User.clerkId` |
  | jobTitle | String? | |
  | summary | String? | `@db.Text` |
  | skills | String[] | Array of strings |
  | experienceYears | Int? | |
  | availability | AvailabilityType? | |
  | expectedSalary | Decimal? | |
  | currency | String | `@default("USD")` |
  | remoteWork | Boolean | `@default(false)` |
  | relocate | Boolean | `@default(false)` |
  | preferredLocations | String[] | |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:**
  - `User` via `userId` → `User.clerkId`
  - `Education[]` — one-to-many
  - `WorkExperience[]` — one-to-many
  - `LanguageSkill[]` — one-to-many
  - `UserSkill[]` — one-to-many (structured skills)
- **Indexes:** `userId` has `@unique`
- **Notes:** `skills` is a plain `String[]` array (legacy). `skillsRelation` (via `UserSkill`) is the newer structured skill system. `preferredLocations` is a string array for location preferences.

---

### Education

- **Purpose:** Stores individual education entries (degrees, certifications) linked to a user profile.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | profileId | Int | References `UserProfile.id` |
  | institution | String | |
  | degree | String | |
  | fieldOfStudy | String? | |
  | startDate | DateTime | |
  | endDate | DateTime? | |
  | isCurrent | Boolean | `@default(false)` |
  | grade | String? | |
  | description | String? | `@db.Text` |

- **Relations:** `UserProfile` via `profileId` → `UserProfile.id` (onDelete: Cascade)
- **Indexes:** None
- **Notes:** Cascades on profile deletion.

---

### WorkExperience

- **Purpose:** Stores work history entries linked to a user profile.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | profileId | Int | References `UserProfile.id` |
  | companyName | String | |
  | jobTitle | String | |
  | location | String? | |
  | startDate | DateTime | |
  | endDate | DateTime? | |
  | isCurrent | Boolean | `@default(false)` |
  | description | String? | `@db.Text` |

- **Relations:** `UserProfile` via `profileId` → `UserProfile.id` (onDelete: Cascade)
- **Indexes:** None
- **Notes:** Cascades on profile deletion.

---

### LanguageSkill

- **Purpose:** Stores language proficiency entries for a user profile.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | profileId | Int | References `UserProfile.id` |
  | language | String | |
  | proficiency | LanguageProficiency | Enum |

- **Relations:** `UserProfile` via `profileId` → `UserProfile.id` (onDelete: Cascade)
- **Indexes:** None
- **Notes:** Uses `LanguageProficiency` enum (BEGINNER, ELEMENTARY, INTERMEDIATE, ADVANCED, NATIVE).

---

### Resume

- **Purpose:** Stores uploaded resume/CV file metadata and parsed content.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | `@unique` — references `User.clerkId` |
  | fileName | String | |
  | fileUrl | String | |
  | fileType | String | "pdf", "doc", "docx" |
  | fileSize | Int | In bytes |
  | parsedData | Json? | Extracted text, skills, experience |
  | isUploaded | Boolean | `@default(false)` |
  | isVerified | Boolean | `@default(false)` |
  | uploadedAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:** `User` via `userId` → `User.clerkId`
- **Indexes:** `userId` has `@unique`
- **Notes:** One resume per user. `parsedData` is a JSON field storing extracted resume information.

---

### EmployerProfile

- **Purpose:** Employer-specific profile data including company information, contact details, and hiring preferences.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | `@unique` — references `User.clerkId` |
  | companyName | String | |
  | companyLogo | String? | |
  | companyWebsite | String? | |
  | companySize | CompanySize? | Enum |
  | industry | String | |
  | description | String? | `@db.Text` |
  | contactEmail | String | |
  | contactPhone | String? | |
  | address | String? | |
  | city | String? | |
  | country | String? | |
  | linkedIn | String? | |
  | twitter | String? | |
  | isVerified | Boolean | `@default(false)` |
  | verifiedAt | DateTime? | |
  | hiringMode | HiringMode | `@default(STANDARD)` |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:**
  - `User` via `userId` → `User.clerkId`
  - `Job[]` — one-to-many
- **Indexes:** `userId` has `@unique`
- **Notes:** One employer profile per user. `hiringMode` controls hiring workflow urgency.

---

### Company

- **Purpose:** Represents the Loft Community organization (single-tenant). Stores company-level metadata.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | name | String | `@default("Loft Community")` |
  | slug | String | `@unique @default("loft-community")` |
  | description | String? | `@db.Text` |
  | logo | String? | |
  | website | String? | |
  | contactEmail | String? | |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:**
  - `CompanyMember[]` — one-to-many
  - `Job[]` — one-to-many
- **Indexes:** `slug` has `@unique`
- **Notes:** Single-tenant design. The platform operates as one company with many members. `name` defaults to "Loft Community".

---

### CompanyMember

- **Purpose:** Join table linking users to a company with a specific role.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | companyId | Int | References `Company.id` |
  | userId | String | References `User.clerkId` |
  | role | CompanyRole | `@default(EMPLOYER)` |
  | createdAt | DateTime | `@default(now())` |

- **Relations:**
  - `Company` via `companyId` → `Company.id` (onDelete: Cascade)
  - `User` via `userId` → `User.clerkId` (onDelete: Cascade)
- **Indexes:** `@@unique([companyId, userId])`
- **Notes:** Composite unique on company+user. Cascades on both company and user deletion.

---

### Job

- **Purpose:** Core job listing entity. Stores job details, requirements, salary, and application metadata. Uses the canonical job model shared with hirehub-backend.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | String | `@id @default(cuid())` |
  | title | String | |
  | company | String | |
  | companyLogo | String? | |
  | location | String | |
  | remote | Boolean | `@default(false)` |
  | salaryMin | Int? | |
  | salaryMax | Int? | |
  | currency | String | `@default("USD")` |
  | tags | String[] | Array of strings |
  | category | String | |
  | seniority | String | |
  | description | String | |
  | requirements | String[] | Array of strings |
  | responsibilities | String[] | Array of strings |
  | postedDate | DateTime | `@default(now())` |
  | expiresAt | DateTime? | |
  | featured | Boolean | `@default(false)` |
  | employerId | String | References `User.clerkId` |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:**
  - `User` (employer) via `employerId` → `User.clerkId`
  - `JobApplication[]` — one-to-many
  - `SavedJob[]` — one-to-many
  - `Message[]` — one-to-many
- **Indexes:** `@@index([category])`, `@@index([seniority])`, `@@index([location])`, `@@index([remote])`, `@@index([employerId])`
- **Notes:** String `cuid` id (matching hirehub-backend) replaces the former integer id. `tags`, `requirements`, and `responsibilities` are plain string arrays. `category`/`seniority` are flat strings (no separate `JobCategory` model). Search filters (search/location/category/seniority/remote/salary/sort) run as one SQL query over these columns; see the backend spec for the search engine contract.

---

### JobApplication

- **Purpose:** Tracks job applications submitted by users, including screening results and timeline events.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | References `User.clerkId` |
  | jobId | String | References `Job.id` |
  | coverLetter | String? | `@db.Text` |
  | resumeUrl | String? | |
  | status | ApplicationStatus | `@default(PENDING)` |
  | englishTestRequired | Boolean | `@default(false)` |
  | englishTestScore | Int? | |
  | passedScreening | Boolean? | |
  | appliedAt | DateTime | `@default(now())` |
  | reviewedAt | DateTime? | |
  | interviewAt | DateTime? | |
  | rejectedAt | DateTime? | |
  | acceptedAt | DateTime? | |
  | employerNotes | String? | `@db.Text` |
  | isShortlisted | Boolean | `@default(false)` |

- **Relations:**
  - `User` via `userId` → `User.clerkId`
  - `Job` via `jobId` → `Job.id` (onDelete: Cascade)
  - `Interview?` — one-to-one
- **Indexes:** `@@index([userId])`
- **Notes:** Cascades on job deletion. `isShortlisted` replaces a previous localStorage hack. Full application lifecycle tracked via timestamp fields.

---

### Interview

- **Purpose:** Stores interview scheduling and feedback data for job applications.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | applicationId | Int | `@unique` — references `JobApplication.id` |
  | scheduledAt | DateTime | |
  | duration | Int | `@default(60)` — minutes |
  | type | InterviewType | Enum |
  | meetingLink | String? | |
  | location | String? | |
  | status | InterviewStatus | `@default(SCHEDULED)` |
  | completed | Boolean | `@default(false)` |
  | notes | String? | `@db.Text` |
  | feedback | String? | `@db.Text` |
  | rating | Int? | 1-5 |
  | createdAt | DateTime | `@default(now())` |
  | updatedAt | DateTime | `@updatedAt` |

- **Relations:** `JobApplication` via `applicationId` → `JobApplication.id` (onDelete: Cascade)
- **Indexes:** `applicationId` has `@unique`
- **Notes:** One-to-one with `JobApplication`. Cascades on application deletion. `rating` is 1-5 integer.

---

### SavedJob

- **Purpose:** Join table for users saving/bookmarking job listings.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | |
  | jobId | String | References `Job.id` |
  | createdAt | DateTime | `@default(now())` |

- **Relations:** `Job` via `jobId` → `Job.id` (onDelete: Cascade)
- **Indexes:** `@@unique([userId, jobId])`
- **Notes:** Composite unique prevents duplicate saves. No explicit `User` relation defined (userId is a plain string field, not a FK constraint). Cascades on job deletion.

---

### EnglishTestQuestion

- **Purpose:** Stores questions for the English proficiency test, including options, correct answers, and difficulty.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | question | String | `@db.Text` |
  | questionType | QuestionType | Enum |
  | difficulty | QuestionDifficulty | Enum |
  | options | Json? | Array of options |
  | correctAnswer | String | |
  | explanation | String? | `@db.Text` |
  | category | TestCategory | Enum |
  | points | Int | `@default(1)` |
  | isActive | Boolean | `@default(true)` |
  | createdAt | DateTime | `@default(now())` |

- **Relations:** None
- **Indexes:** None
- **Notes:** No foreign key relationships. `options` is a JSON field storing an array of choice objects. `isActive` allows soft-deactivation of questions.

---

### EnglishTestResult

- **Purpose:** Records results of English proficiency tests taken by users.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | References `User.clerkId` |
  | testType | TestType | Enum |
  | score | Int | |
  | totalQuestions | Int | |
  | correctAnswers | Int | |
  | duration | Int | In seconds |
  | breakdown | Json? | Score by category |
  | level | EnglishLevel | Enum |
  | passed | Boolean | |
  | completedAt | DateTime | `@default(now())` |
  | certificateUrl | String? | |

- **Relations:** `User` via `userId` → `User.clerkId`
- **Indexes:** None
- **Notes:** `breakdown` is a JSON field storing per-category score details. `certificateUrl` links to generated certificate if passed.

---

### Notification

- **Purpose:** Stores user notifications for application updates, messages, job alerts, etc.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | |
  | title | String | |
  | message | String | `@db.Text` |
  | type | NotificationType | Enum |
  | data | Json? | |
  | link | String? | |
  | isRead | Boolean | `@default(false)` |
  | readAt | DateTime? | |
  | createdAt | DateTime | `@default(now())` |

- **Relations:** None (no FK constraint to User)
- **Indexes:** `@@index([userId])`
- **Notes:** No explicit `User` relation defined (userId is a plain string field). `data` is a JSON field for arbitrary payload. Indexed on `userId` for efficient queries.

---

### Skill

- **Purpose:** Global skill registry — reusable skill definitions referenced by users and jobs.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | name | String | `@unique` |
  | category | String? | |
  | isCustom | Boolean | `@default(false)` |
  | createdAt | DateTime | `@default(now())` |

- **Relations:**
  - `UserSkill[]` — one-to-many
- **Indexes:** `name` has `@unique`
- **Notes:** `isCustom` distinguishes user-created skills from platform-provided ones.

---

### UserSkill

- **Purpose:** Join table linking users (via UserProfile) to skills with a proficiency level.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | Int | References `UserProfile.id` |
  | skillId | Int | References `Skill.id` |
  | level | SkillLevel? | Enum |

- **Relations:**
  - `Skill` via `skillId` → `Skill.id`
  - `UserProfile` via `userId` → `UserProfile.id` (onDelete: Cascade)
- **Indexes:** `@@unique([userId, skillId])`
- **Notes:** Composite unique prevents duplicate skill assignments. `userId` here references `UserProfile.id` (not `User.clerkId`).

---

### Message

- **Purpose:** Direct messaging between users, optionally linked to a job listing.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | senderId | String | References `User.clerkId` |
  | receiverId | String | References `User.clerkId` |
  | content | String | `@db.Text` |
  | jobId | String? | References `Job.id` |
  | conversationId | String? | Groups messages: "jobId-userId" or "userId-userId" |
  | readAt | DateTime? | |
  | createdAt | DateTime | `@default(now())` |

- **Relations:**
  - `User` (sender) via `senderId` → `User.clerkId` — relation name `SentMessages`
  - `User` (receiver) via `receiverId` → `User.clerkId` — relation name `ReceivedMessages`
  - `Job?` via `jobId` → `Job.id`
- **Indexes:** `@@index([senderId])`, `@@index([receiverId])`
- **Notes:** `conversationId` is a string convention for grouping messages (e.g., `"42-user_abc"` for job-related, `"user_abc-user_def"` for direct). Read receipt tracked via `readAt`.

---

### Report

- **Purpose:** Stores user-submitted reports (content moderation).
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | reporterId | String | |
  | reportedType | String | Polymorphic type identifier |
  | reportedId | Int | Polymorphic ID |
  | reason | String | |
  | status | ReportStatus | `@default(PENDING)` |
  | createdAt | DateTime | `@default(now())` |

- **Relations:** None
- **Indexes:** None
- **Notes:** Polymorphic reporting — `reportedType` + `reportedId` can point to any entity (user, job, message, etc.). No FK constraints.

---

### NotificationPreference

- **Purpose:** Per-user notification delivery preferences.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | userId | String | `@unique` |
  | applicationUpdates | Boolean | `@default(true)` |
  | newMessages | Boolean | `@default(true)` |
  | jobAlerts | Boolean | `@default(true)` |
  | marketing | Boolean | `@default(true)` |

- **Relations:** None (no FK constraint to User)
- **Indexes:** `userId` has `@unique`
- **Notes:** One preference record per user. No explicit `User` relation defined.

---

### RateLimit

- **Purpose:** API rate limiting counter storage.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | Int | `@id @default(autoincrement())` |
  | key | String | `@unique` |
  | count | Int | `@default(1)` |
  | windowStart | DateTime | |
  | expiresAt | DateTime | |

- **Relations:** None
- **Indexes:** `key` has `@unique`, `@@index([expiresAt])`
- **Notes:** Sliding window rate limiter. `expiresAt` indexed for efficient cleanup/TTL queries.

---

### CacheEntry

- **Purpose:** General-purpose key-value cache with TTL expiration.
- **Fields:**

  | Name | Type | Attributes |
  |------|------|------------|
  | id | String | `@id @default(cuid())` |
  | key | String | `@unique` |
  | data | Json | |
  | createdAt | DateTime | `@default(now())` |
  | expiresAt | DateTime | |

- **Relations:** None
- **Indexes:** `key` has `@unique`, `@@index([expiresAt])`
- **Notes:** JSON blob storage with expiration. `expiresAt` indexed for efficient cleanup.

---

## 4. Relationships

```
User (1) ──── (0..1) UserProfile       [userId → clerkId]
User (1) ──── (0..1) Resume            [userId → clerkId]
User (1) ──── (0..1) EmployerProfile   [userId → clerkId]
User (1) ──── (0..*) JobApplication    [userId → clerkId]
User (1) ──── (0..*) EnglishTestResult [userId → clerkId]
User (1) ──── (0..*) Message (sender)  [senderId → clerkId]
User (1) ──── (0..*) Message (receiver)[receiverId → clerkId]
User (1) ──── (0..*) CompanyMember     [userId → clerkId]
User (1) ──── (0..*) Account           [userId → clerkId, CASCADE]
User (1) ──── (0..*) Session           [userId → clerkId, CASCADE]

UserProfile (1) ──── (0..*) Education        [profileId → id, CASCADE]
UserProfile (1) ──── (0..*) WorkExperience   [profileId → id, CASCADE]
UserProfile (1) ──── (0..*) LanguageSkill    [profileId → id, CASCADE]
UserProfile (1) ──── (0..*) UserSkill        [userId → id, CASCADE]

Company (1) ──── (0..*) CompanyMember  [companyId → id, CASCADE]

User (employer) (1) ──── (0..*) Job   [employerId → clerkId]

Job (1) ──── (0..*) JobApplication    [jobId → id, CASCADE]
Job (1) ──── (0..*) SavedJob          [jobId → id, CASCADE]
Job (1) ──── (0..*) Message           [jobId → id]

JobApplication (1) ──── (0..1) Interview [applicationId → id, CASCADE]

Skill (1) ──── (0..*) UserSkill       [skillId → id]
```

---

## 5. Enums

| Enum | Values | Used By |
|------|--------|---------|
| **EnglishLevel** | BEGINNER, ELEMENTARY, INTERMEDIATE, UPPER_INTERMEDIATE, ADVANCED, NATIVE | User.englishTestLevel, EnglishTestResult.level |
| **LanguageProficiency** | BEGINNER, ELEMENTARY, INTERMEDIATE, ADVANCED, NATIVE | LanguageSkill.proficiency |
| **QuestionType** | READING, WRITING, LISTENING, SPEAKING, GRAMMAR, VOCABULARY, MULTIPLE_CHOICE | EnglishTestQuestion.questionType |
| **QuestionDifficulty** | EASY, MEDIUM, HARD | EnglishTestQuestion.difficulty |
| **TestCategory** | GRAMMAR, VOCABULARY, READING, WRITING, LISTENING, SPEAKING, COMPREHENSION | EnglishTestQuestion.category |
| **TestType** | PLACEMENT, CERTIFICATION, SKILLS_ASSESSMENT | EnglishTestResult.testType |
| **ApplicationStatus** | PENDING, REVIEWING, SHORTLISTED, INTERVIEW, OFFERED, HIRED, REJECTED, WITHDRAWN | JobApplication.status |
| **InterviewType** | PHONE, VIDEO, ONSITE, TECHNICAL, FINAL | Interview.type |
| **InterviewStatus** | SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, RESCHEDULED | Interview.status |
| **CompanySize** | STARTUP (1-10), SMALL (11-50), MEDIUM (51-200), LARGE (201-500), ENTERPRISE (500+) | EmployerProfile.companySize |
| **HiringMode** | STANDARD, EXPRESS, URGENT | EmployerProfile.hiringMode |
| **AvailabilityType** | IMMEDIATELY, TWO_WEEKS, ONE_MONTH, TWO_MONTHS, NOT_AVAILABLE | UserProfile.availability |
| **SkillLevel** | EXPERT, INTERMEDIATE, BEGINNER | UserSkill.level |
| **CompanyRole** | ADMIN, EMPLOYER | CompanyMember.role |
| **NotificationType** | APPLICATION_RECEIVED, APPLICATION_SHORTLISTED, APPLICATION_REJECTED, JOB_RECOMMENDED, JOB_EXPIRED, PROFILE_VIEWED, MESSAGE, ENGLISH_TEST_INVITE, INTERVIEW_SCHEDULED | Notification.type |
| **ReportStatus** | PENDING, REVIEWED, RESOLVED, DISMISSED | Report.status |

---

## 6. Index Strategy

### Unique Constraints (@unique / @@unique)

| Model | Field(s) | Type |
|-------|----------|------|
| Account | `[provider, providerAccountId]` | Compound |
| Session | `sessionToken` | Single |
| VerificationToken | `token` | Single |
| VerificationToken | `[identifier, token]` | Compound |
| User | `clerkId` | Single |
| User | `email` | Single |
| UserProfile | `userId` | Single |
| Resume | `userId` | Single |
| EmployerProfile | `userId` | Single |
| Company | `slug` | Single |
| CompanyMember | `[companyId, userId]` | Compound |
| Interview | `applicationId` | Single |
| SavedJob | `[userId, jobId]` | Compound |
| UserSkill | `[userId, skillId]` | Compound |
| Skill | `name` | Single |
| NotificationPreference | `userId` | Single |
| RateLimit | `key` | Single |
| CacheEntry | `key` | Single |

### Explicit Indexes (@@index)

| Model | Field(s) | Purpose |
|-------|----------|---------|
| Job | `[category]` | Faceted category filter |
| Job | `[seniority]` | Faceted seniority filter |
| Job | `[location]` | Location filter |
| Job | `[remote]` | Remote filter |
| Job | `[employerId]` | Fast lookup of an employer's jobs |
| JobApplication | `[userId]` | Fast lookup of applications by user |
| Notification | `[userId]` | Fast lookup of notifications by user |
| Message | `[senderId]` | Fast lookup of sent messages |
| Message | `[receiverId]` | Fast lookup of received messages |
| RateLimit | `[expiresAt]` | TTL cleanup queries |
| CacheEntry | `[expiresAt]` | TTL cleanup queries |

---

## 7. Key Design Decisions

1. **`clerkId` as Primary User Identifier** — The `User.clerkId` field is the canonical identifier used across nearly all relations, a legacy of migrating from Clerk authentication. For credentials-based users, the format is `local_<timestamp>`. The `User.id` (autoincrement integer) is rarely used as a foreign key.

2. **Single-Tenant Company Model** — The `Company` model defaults to "Loft Community" with slug "loft-community". The platform operates as a single organization with many members (via `CompanyMember`), not a multi-tenant marketplace.

3. **NextAuth-Compatible Auth Layer** — `Account`, `Session`, and `VerificationToken` models follow the NextAuth database adapter schema. OAuth tokens are stored as `@db.Text` fields to handle large token payloads.

4. **Canonical Job Model** — The `Job` model uses the canonical shape shared with hirehub-backend: string `cuid` id, flat `category`/`seniority` strings, `tags`/`requirements`/`responsibilities` as `String[]`, and `postedDate`/`expiresAt` lifecycle timestamps. There is no `JobCategory` taxonomy model, no structured `JobRequiredSkill` join, and no `status`/`jobType`/`workMode` enums — filtering and sorting run as SQL over the flat columns (see the backend spec's search engine contract).

5. **Cascading Deletes** — Applied on:
   - Account/Session → User (auth cleanup)
   - Education/WorkExperience/LanguageSkill/UserSkill → UserProfile (profile cleanup)
   - CompanyMember → Company + User (membership cleanup)
   - JobApplication/SavedJob/Message → Job (job cleanup)
   - Interview → JobApplication (application cleanup)

6. **Polymorphic Reporting** — The `Report` model uses `reportedType` (string) + `reportedId` (int) instead of typed foreign keys, allowing it to reference any entity type.

7. **Conversation Grouping** — Messages use a string-based `conversationId` convention (e.g., `"jobId-userId"` or `"userId-userId"`) rather than a dedicated conversation entity.

8. **JSON Fields for Flexible Data** — `Resume.parsedData`, `EnglishTestQuestion.options`, `EnglishTestResult.breakdown`, and `Notification.data` use PostgreSQL JSON columns for schema-less structured data.

9. **No Foreign Key on Some User References** — `SavedJob.userId`, `Notification.userId`, `NotificationPreference.userId`, and `Report.reporterId` are plain strings without explicit Prisma `@relation` directives to `User`, though they logically reference `User.clerkId`.

10. **Tier/Credits as Strings** — `User.tier` and `User.credits` are `String` type rather than enum/int, suggesting they may be used as display values or are designed for flexible future changes.

---

## 8. Schema Patterns

### JSON Fields for Flexible Data
- `Resume.parsedData` — extracted resume content (skills, experience)
- `EnglishTestQuestion.options` — array of multiple-choice options
- `EnglishTestResult.breakdown` — per-category score breakdown
- `Notification.data` — arbitrary notification payload

### Self-Referencing Relations
(none — no model currently self-references)

### Optional Relations
- `Message.jobId` is nullable — direct messages not linked to jobs
- `Interview` is optional per `JobApplication` — not all applications reach interview stage

### Default Values
- `User.isApplicant`: `true` — new users are applicants by default
- `User.englishTestLevel`: `BEGINNER`
- `User.tier`: `"Free"`, `credits`: `"10"`
- `Job.remote`: `false`
- `Job.currency`: `"USD"`
- `Job.postedDate`: `now()`
- `Job.featured`: `false`
- `UserProfile.currency`: `"USD"`
- `Interview.duration`: `60` (minutes)
- `EnglishTestQuestion.points`: `1`
- `CompanyMember.role`: `EMPLOYER`
- `EmployerProfile.hiringMode`: `STANDARD`

### Timestamp Patterns
- `createdAt` with `@default(now())` on most models
- `updatedAt` with `@updatedAt` on mutable models
- Lifecycle timestamps on `JobApplication` (appliedAt, reviewedAt, interviewAt, rejectedAt, acceptedAt)
- `Job.postedDate` (publish) / `Job.expiresAt` (expiry) for listing lifecycle

### ID Generation
- Most models use `@default(autoincrement())` (integer PKs)
- `Job`, NextAuth models (`Account`, `Session`, `VerificationToken`), and `CacheEntry` use `@default(cuid())` (string PKs)
- `UserSkill` and `Skill` use integer autoincrement
