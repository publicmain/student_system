# Student Academic Planning & Admission Management System

## System Documentation / 系统说明文档

---

## 1. System Overview / 系统概述

This is an all-in-one **Student Academic Planning and Admission Management System** designed for international education institutions (specifically Equistar International College, Singapore). It covers the complete student lifecycle from initial inquiry through enrollment, academic planning, and post-arrival management.

本系统是一套面向国际教育机构（新加坡 Equistar International College）的**学生升学规划与入学管理系统**，覆盖从初始咨询到入学、学业规划、入学后管理的完整生命周期。

**Tech Stack / 技术栈:**
- **Backend:** Node.js + Express 4.22
- **Database:** SQLite (via sql.js, in-process)
- **Frontend:** Single Page Application (Vanilla JS + Bootstrap 5)
- **PDF Generation:** Python (pymupdf + reportlab) via Node.js bridge
- **Email:** Nodemailer (SMTP)
- **AI:** OpenAI API integration for planning & evaluation
- **File Storage:** Local filesystem (`uploads/` directory)

---

## 2. User Roles / 用户角色

| Role | 中文 | Description | Key Access |
|------|------|-------------|------------|
| **principal** | 校长/管理员 | Full system admin | All modules, all settings |
| **counselor** | 升学规划师 | Academic planning advisor | Planning, students, applications, analytics |
| **mentor** | 导师 | Student mentor | Assigned students, tasks, materials |
| **intake_staff** | 入学管理员 | Admission coordinator | Intake cases, material collection, admission profiles |
| **student_admin** | 行政助理 | Admin assistant | Intake cases, admission profiles |
| **student** | 学生 | Student self-service | My portal, own profile only |
| **parent** | 家长 | Parent/guardian | Parent portal, linked student info |
| **agent** | 中介/代理 | External recruitment agent | Agent portal, referrals, material submission |
| **teacher** | 教师 | Subject teacher | Staff view (read-only) |

---

## 3. System Architecture / 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (SPA)                          │
│  public/index.html (shell) + public/app.js (routing+render)  │
│  public/agent.html (agent-facing form, separate page)        │
├─────────────────────────────────────────────────────────────┤
│                      BACKEND (Node.js)                        │
│  server.js (Express routes, business logic)                   │
│  ├── db.js (SQLite schema, 65+ tables)                       │
│  ├── mailer.js (SMTP email service)                          │
│  ├── ai-planner.js (OpenAI planning)                         │
│  ├── ai-eval.js (OpenAI evaluation)                          │
│  ├── pdf-filler-bridge.js (Python PDF bridge)                │
│  └── pdf-generator.js (JS fallback PDF)                      │
├─────────────────────────────────────────────────────────────┤
│                    PDF GENERATION (Python)                     │
│  pdf-filler/fill_saf.py (Student Application Form)           │
│  pdf-filler/fill_form16.py (Form 16 - Student Pass)          │
│  pdf-filler/fill_v36.py (V36 - Additional Info)              │
│  pdf-filler/pdf_utils.py (overlay builder, utilities)        │
│  pdf-filler/calibrate.py (coordinate calibration tool)       │
├─────────────────────────────────────────────────────────────┤
│                       DATA LAYER                              │
│  data.sqlite (persistent database)                            │
│  uploads/ (files, photos, signatures, generated PDFs)         │
│  templates/ (PDF templates for form filling)                  │
│  mail.log (email audit trail)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Business Modules / 核心业务模块

### Module A: Upgrade Planning / 升学规划模块

**Purpose:** Help counselors and mentors plan students' academic journeys toward university admission (UK, US, Canada, Australia).

**Pages:**
- **Dashboard** (`dashboard`) — Overview statistics, risk alerts, workload distribution
- **Counselor Workbench** (`counselor`) — Counselor's workspace for managing assigned students
- **Mentor Workbench** (`mentor`) — Mentor's workspace for day-to-day student support

**Key Features:**
- Student profile management
- Academic assessment tracking (IELTS, TOEFL, SAT, A-Level, IB)
- Subject enrollment (A-Level, IB subjects)
- Target university lists (stratified: 冲刺/意向/保底)
- Multi-route application management (UK-UG, US, CA, AU)
- Milestone task tracking with templates
- Personal statement drafting
- Communication logging (WeChat, Email, Phone)
- AI-powered planning generation
- Timeline auto-generation from templates
- Calendar export (ICS)

**Data Flow:**
```
Create Student → Assign Counselor/Mentor → Generate Timeline →
Track Tasks → Add Targets → Create Applications →
Monitor Progress → AI Planning → Export Calendar
```

---

### Module B: Student Management / 学生管理模块

**Pages:**
- **Student List** (`students`) — Searchable, filterable student directory
- **Student Detail** (`student-detail`) — Comprehensive student profile with tabs

**Student Detail Tabs:**
1. Overview (basic info, photo, enrollment status)
2. Academic (assessments, subjects, grades)
3. Targets (university list with application status)
4. Applications (application records with sub-details)
5. Tasks (milestone tracking)
6. Materials (document collection)
7. Personal Statement
8. Communications Log
9. Mentor Assignments

---

### Module C: Intake Management / 入学管理模块

**Purpose:** Process student admissions from initial case creation through visa, arrival, and post-arrival.

**Pages:**
- **Intake Dashboard** (`intake-dashboard`) — Statistics and pipeline overview
- **Intake Cases** (`intake-cases`) — Case listing with status filters
- **Intake Case Detail** (`intake-case-detail`) — Full case management with tabs

**Intake Case Tabs:**
1. Overview (case info, status, key dates)
2. Visa Case (application tracking, IPA status)
3. Finance (invoices, payments, reconciliation)
4. Documents (file exchange, case files)
5. Arrival & Orientation (arrival records, surveys)
6. ADM Documents (generated application forms — if linked)

**Case Status Flow:**
```
new → enrolled → visa_applied → visa_approved →
arrived → orientation_done → active → completed
```

---

### Module D: Material Collection / 材料收集模块 (MAT)

**Purpose:** Collect application materials from agents/companies via secure magic-link workspace.

**Pages:**
- **Material Requests** (`mat-requests`) — Request listing
- **Material Request Detail** (`mat-request-detail`) — Item tracking + UIF review
- **Material Companies** (`mat-companies`) — Company/contact management

**Key Flow:**
```
Create Request → Add Items → Send Email (magic link) →
Agent Opens Workspace → Uploads Documents + Fills UIF →
Staff Reviews Items → Approves/Rejects → Generate Documents
```

**Agent Workspace** (`agent.html`):
- Separate page accessed via magic token link
- Harvard Red themed, bilingual (中/EN)
- 12-step wizard form for comprehensive data collection
- Material upload with drag-and-drop
- Auto-save drafts
- Electronic signature canvas

---

### Module E: Admission Profiles / 入学申请表模块 (ADM)

**Purpose:** Manage student application forms and auto-generate official PDF documents.

**Pages:**
- **Admission Profiles** (`adm-profiles`) — Profile listing
- **Admission Form** (`adm-form`) — Multi-step form wizard (staff-facing)
- **Admission Case Detail** (`adm-case-detail`) — Profile review with document management

**Three Generated Documents:**
1. **Student Application Form (SAF)** — 3 pages, school's own application form
2. **Form 16 (eForm 16)** — 2 pages, ICA Student Pass application
3. **V36 (eForm V36)** — 2 pages, Additional information for Student Pass

**Document Generation Flow:**
```
Agent fills form → UIF submitted → Staff clicks "Generate" →
Server creates adm_profile → Writes to sub-tables →
Python PDF filler reads data → Overlays on PDF templates →
3 PDFs generated → Available for download/preview
```

---

### Module F: Agent/Recruitment Management / 中介管理模块

**Pages:**
- **Agent Management** (`agents-management`) — Agent registry (principal only)
- **Agent Portal** (`agent-portal`) — Self-service dashboard for agents

**Features:**
- Agent registration and credential management
- Referral tracking (which agent brought which student)
- Commission rules and calculation engine
- Commission payout approval workflow
- Agent self-portal (view referrals, commissions, students)

---

### Module G: System Administration / 系统管理模块

**Pages:**
- **Settings** (`settings`) — Global configuration
- **Analytics** (`analytics`) — Data visualization
- **Audit Log** (`audit`) — Action tracking
- **Admission Programs** (`admission-programs`) — University program database

---

## 5. Page Relationships / 页面关系图

```
                    ┌──────────────┐
                    │   Login      │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼──────────┐
    │ Dashboard  │  │ Student    │  │ Intake      │
    │ (planning) │  │ Portal     │  │ Dashboard   │
    └─────┬──────┘  └────────────┘  └──────┬──────┘
          │                                │
    ┌─────▼──────┐                   ┌─────▼──────┐
    │ Student    │◄──────────────────│ Intake     │
    │ List       │   (linked via     │ Cases      │
    └─────┬──────┘   student_id)     └─────┬──────┘
          │                                │
    ┌─────▼──────┐                   ┌─────▼──────┐
    │ Student    │                   │ Case       │
    │ Detail     │                   │ Detail     │
    └────────────┘                   └─────┬──────┘
          │                                │
          │ (assessments,                  │ (visa, finance,
          │  applications,                 │  documents,
          │  tasks, PS)                    │  arrival)
          │                                │
          │         ┌──────────────┐       │
          └────────►│ MAT Requests │◄──────┘
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐     ┌──────────────┐
                    │ Request      │────►│ Agent        │
                    │ Detail       │     │ Workspace    │
                    └──────┬───────┘     │ (agent.html) │
                           │             └──────────────┘
                    ┌──────▼───────┐
                    │ Generate     │
                    │ Documents    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼──┐  ┌─────▼──┐  ┌─────▼──┐
        │  SAF   │  │ Form16 │  │  V36   │
        │ (PDF)  │  │ (PDF)  │  │ (PDF)  │
        └────────┘  └────────┘  └────────┘
```

---

## 6. Key Data Flows / 核心数据流

### Flow 1: Student Planning Lifecycle

```
1. Principal/Counselor creates student record
2. Assigns counselor + mentor
3. Counselor generates timeline from template
4. Milestone tasks created automatically
5. Counselor adds target universities (冲刺/意向/保底)
6. Student completes assessments (IELTS, etc.)
7. Counselor creates applications (UK-UG, US, etc.)
8. System tracks application status
9. AI generates planning recommendations
10. Export timeline to calendar (ICS)
```

### Flow 2: Agent → Material Collection → PDF Generation

```
1. Staff creates Material Request for an agent
2. System sends email with magic-link to agent
3. Agent opens agent.html workspace:
   a. Fills 12-step application form (personal, family, education, etc.)
   b. Uploads required documents (passport, transcripts, etc.)
   c. Signs electronically (canvas signature)
   d. Submits
4. Staff reviews submitted materials in system
5. Staff clicks "Generate Application Documents"
6. Server:
   a. Creates adm_profile from UIF data
   b. Writes family, education, employment to sub-tables
   c. Saves signature image & ID photo
   d. Triggers Python PDF generation
7. Python:
   a. Reads data from DB via bridge
   b. Loads original PDF templates
   c. Overlays text, checkboxes, images, signatures
   d. Saves 3 final PDFs (SAF, Form 16, V36)
8. Staff downloads or previews generated documents
```

### Flow 3: Intake Case Processing

```
1. Agent referral → Create intake case
2. Assign counselor to case
3. Collect documents (file exchange with student/agent)
4. Process visa application (IPA tracking)
5. Record student arrival
6. Generate invoices → Collect payments
7. Conduct orientation
8. Send post-arrival survey
9. Case marked complete
```

---

## 7. Database Schema Overview / 数据库概览

**65+ tables organized by module:**

### Core Tables
| Table | Purpose |
|-------|---------|
| `users` | All system user accounts |
| `students` | Student master records |
| `staff` | Staff profiles & credentials |
| `parent_guardians` | Parent/guardian info |
| `student_parents` | Student-parent linking |
| `mentor_assignments` | Mentor-student assignments |

### Planning Tables
| Table | Purpose |
|-------|---------|
| `subjects` | Available subjects (A-Level, IB, etc.) |
| `subject_enrollments` | Student subject registrations |
| `admission_assessments` | Test scores & evaluations |
| `target_uni_lists` | Target universities per student |
| `applications` | University application records |
| `milestone_tasks` | Planning tasks with deadlines |
| `material_items` | Supporting documents |
| `personal_statements` | PS drafts & versions |
| `communications` | Communication logs |
| `timeline_templates` | Reusable planning templates |

### Intake Tables
| Table | Purpose |
|-------|---------|
| `intake_cases` | Admission cases |
| `visa_cases` | Visa tracking |
| `arrival_records` | Arrival management |
| `finance_invoices` | Financial records |
| `finance_payments` | Payment tracking |
| `file_exchange_records` | Document exchange |
| `case_files` | Case documents |
| `case_signatures` | Contract signatures |

### MAT (Material Collection) Tables
| Table | Purpose |
|-------|---------|
| `mat_companies` | Agent companies |
| `mat_contacts` | Company contacts |
| `mat_requests` | Collection requests |
| `mat_request_items` | Individual items per request |
| `mat_uif_submissions` | Student info form data (JSON) |
| `mat_magic_tokens` | Secure access tokens |
| `mat_audit_logs` | Action audit trail |

### ADM (Admission Profile) Tables
| Table | Purpose |
|-------|---------|
| `adm_profiles` | Master application profile (100+ columns) |
| `adm_family_members` | Family member records |
| `adm_residence_history` | 5-year residence history |
| `adm_education_history` | Education background |
| `adm_employment_history` | Work experience |
| `adm_guardian_info` | Guardian details (minors) |
| `adm_parent_pr_additional` | SC/PR parent extra info |
| `adm_spouse_pr_additional` | SC/PR spouse extra info |
| `adm_signatures` | Electronic signatures |
| `adm_generated_documents` | Generated PDF tracking |

---

## 8. PDF Generation System / PDF 生成系统

### Architecture
```
Node.js (server.js)
  └── pdf-filler-bridge.js
        ├── _buildDataPayload() → reads all DB tables
        ├── Spawns Python subprocess
        └── Passes JSON data + template paths

Python (pdf-filler/)
  ├── fill_saf.py    → Student Application Form (3 pages, A4)
  ├── fill_form16.py → Form 16 (2 pages, Letter)
  ├── fill_v36.py    → V36 (2 pages, Letter)
  └── pdf_utils.py   → OverlayBuilder (ReportLab overlay + PyMuPDF merge)
```

### How It Works
1. **Template Preservation:** Original PDF templates are never modified
2. **Overlay Approach:** ReportLab generates a transparent overlay with text/checkboxes/images
3. **Merge:** PyMuPDF merges overlay onto template page-by-page
4. **Chinese Support:** SimHei font auto-detected from Windows system fonts
5. **Coordinate System:** Top-left origin (PyMuPDF standard), internally converted for ReportLab

### Key Features
- Boolean values use `to_bool()` for proper Python evaluation
- Dates auto-converted from `YYYY-MM-DD` to `DD/MM/YYYY`
- Long text auto-shrinks font size (min 5pt) before truncating
- Checkboxes rendered as `✓` marks at precise coordinates
- Signature images embedded from uploaded PNG files
- ID photos placed in designated template areas
- Conditional sections (SC/PR parents, guardian for minors)
- "No information to declare" auto-checked when arrays empty

### Calibration Tool
- `python pdf-filler/calibrate.py` starts at `localhost:5566`
- Visual field positioning on template background
- Drag-and-drop coordinate adjustment
- One-click regeneration after changes

---

## 9. Agent Workspace / 代理工作台

### Access
- URL: `agent.html?token=<magic_token>&demo=1` (demo mode)
- Token valid for 72 hours, single-use per request
- No login required — token-based authentication

### Design
- **Theme:** Harvard Red (`#A51C30`)
- **Bilingual:** Chinese (default) / English toggle
- **Responsive:** Desktop + Mobile support
- **Welcome Page:** Preparation checklist before starting

### 12-Step Form Wizard
| Step | Content | Key Fields |
|------|---------|------------|
| 1 | Course & Pass Type | Course name, intake, SG pass type |
| 2 | Personal Details | Name, gender, DOB, nationality, marital status |
| 3 | Passport & Address | Passport info, home address, SG address |
| 4 | Family Members | Dynamic rows: parents, step-parents, spouse, siblings |
| 5 | Residence History | Countries resided 1+ year in last 5 years |
| 6 | Education & Language | Schools, qualifications, language scores |
| 7 | Employment | Work history with "currently employed" toggle |
| 8 | Financial Support | Income/savings for applicant, parents, spouse |
| 9 | Declarations | Antecedent Q1-Q4, guardian info (if under 18) |
| 10 | Consent & Signature | PDPA, photo upload, electronic signature |
| 11 | Materials Upload | Document upload with status tracking |
| 12 | Review & Submit | Summary of all data, final submission |

### Conditional Logic
- **Under 18:** Guardian section appears in Step 9, guardian signature in Step 10
- **Married:** Spouse financial fields appear in Step 8
- **SC/PR Family:** Additional info block appears per family member in Step 4
- **Other Financial Support = Yes:** Details and amount fields appear
- **No Education/Employment:** "No information to declare" toggle hides form

---

## 10. Security / 安全机制

| Feature | Implementation |
|---------|---------------|
| Authentication | Session-based, httpOnly, 8-hour rolling |
| Password | bcrypt cost 12, forced change on first login |
| Rate Limiting | Login: 10/15min, Password: 5/15min, AI: 20/hour |
| RBAC | Role-based middleware on every API route |
| File Upload | 10MB limit, extension whitelist, MIME check |
| XSS | HTML escaping, Content Security Policy headers |
| SQL Injection | Parameterized queries throughout |
| Audit | All actions logged with IP, timestamp, user |
| Agent Access | 72-hour magic tokens, single request scope |
| CORS | Same-origin only |

---

## 11. File Structure / 文件结构

```
Student system/
├── server.js              # Main backend (5400+ lines)
├── db.js                  # Database schema & migrations (2200+ lines)
├── mailer.js              # Email service
├── ai-planner.js          # AI planning integration
├── ai-eval.js             # AI evaluation integration
├── pdf-filler-bridge.js   # Node.js ↔ Python bridge
├── pdf-generator.js       # JS fallback PDF generator
├── adm-field-mapping.js   # Master field schema & validation
├── session-store.js       # SQLite session storage
├── start.bat              # Windows startup script
├── package.json           # Dependencies
├── .env                   # Environment variables (SMTP, etc.)
│
├── public/                # Frontend
│   ├── index.html         # SPA shell (sidebar, modals)
│   ├── app.js             # All page renders (10500+ lines)
│   ├── style.css          # Global styles
│   ├── agent.html         # Agent workspace (standalone)
│   ├── esic-logo.jpg      # School logo
│   └── react/             # Optional React components
│
├── pdf-filler/            # Python PDF generation
│   ├── main.py            # CLI entry (analyze, grid, generate)
│   ├── fill_saf.py        # Student Application Form filler
│   ├── fill_form16.py     # Form 16 filler
│   ├── fill_v36.py        # V36 filler
│   ├── pdf_utils.py       # OverlayBuilder + helpers
│   └── calibrate.py       # Visual calibration tool (port 5566)
│
├── templates/             # PDF templates
│   ├── 2026 Student Application Form.pdf
│   ├── form-16_application-for-stp_fss_kid_pei.pdf
│   └── Form 36_ICA.pdf
│
├── uploads/               # User files, generated PDFs, signatures
├── logo/                  # School logo source
└── data.sqlite            # Persistent database
```

---

## 12. Getting Started / 快速启动

### Prerequisites
- Node.js 18+
- Python 3.10+ with packages: `pymupdf`, `reportlab`, `Pillow`

### Installation
```bash
npm install
pip install pymupdf reportlab Pillow
```

### Configuration
Create `.env` file:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=School Name <your@gmail.com>
OPENAI_API_KEY=sk-...
```

### Run
```bash
# Windows
start.bat

# Manual
node server.js
# Server starts on http://localhost:3000

# PDF Calibration Tool (optional)
python pdf-filler/calibrate.py
# Starts on http://localhost:5566
```

### Default Accounts
| Username | Password | Role |
|----------|----------|------|
| principal | 123456 | Administrator |
| counselor | 123456 | Counselor |
| mentor | 123456 | Mentor |

---

## 13. API Overview / API 概览

**Total: 180+ REST API endpoints**

| Module | Routes | Base Path |
|--------|--------|-----------|
| Auth | 3 | `/api/auth/*` |
| Dashboard | 3 | `/api/dashboard/*` |
| Students | 30+ | `/api/students/*` |
| Applications | 7 | `/api/applications/*` |
| Tasks & Materials | 12 | `/api/tasks/*, /api/materials/*` |
| Staff | 5 | `/api/staff/*` |
| Templates | 8 | `/api/templates/*` |
| University Programs | 10 | `/api/uni-programs/*` |
| Evaluations | 15 | `/api/admission-evals/*, /api/benchmark-evals/*` |
| AI Planning | 6 | `/api/ai-plans/*` |
| Intake Cases | 35+ | `/api/intake-cases/*` |
| Agent Market | 15+ | `/api/agents/*, /api/referrals/*` |
| MAT Collection | 20+ | `/api/mat-*` |
| ADM Profiles | 15+ | `/api/adm-profiles/*` |
| Agent Workspace | 6 | `/api/agent/*` |
| Settings & System | 15+ | `/api/settings/*, /api/audit/*` |

---

*Document generated: 2026-03-25*
*System version: 1.0.0*
