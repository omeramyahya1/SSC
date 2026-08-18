<div align="center">

<img src="src-tauri/icons/icon.png" alt="SSC Logo" width="96" height="96" />

# SSC — Solar System Calculator

**A professional cross-platform desktop application for solar energy businesses.**
Manage inventory, sales, projects, and automatic solar system configurations — all in one place, with full Arabic & English support.

<br/>

[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue?style=for-the-badge&logo=windows)](https://tauri.app)
[![Version](https://img.shields.io/badge/Version-0.1.1--beta.9-orange?style=for-the-badge)](package.json)
[![License](https://img.shields.io/badge/License-Private-red?style=for-the-badge)](#)
[![Bilingual](https://img.shields.io/badge/Language-Arabic%20%7C%20English-green?style=for-the-badge&logo=googletranslate&logoColor=white)](#)

</div>

---

## 📖 Overview

**SSC (Solar System Calculator)** is a feature-rich desktop application built for solar energy companies and distributors. It streamlines every aspect of the business — from calculating the right solar configuration for a client's electrical needs to issuing invoices and tracking payments — all within a single, bilingual (Arabic/English) interface with full RTL support.

---

## ✨ Features

### ⚡ Automatic Solar System Calculator

Intelligently calculates the optimal solar system configuration based on a client's electrical appliances and consumption. Outputs the recommended number of **solar panels**, **battery capacity**, and **inverter size** — eliminating manual engineering guesswork.

### 📦 Inventory Management

Track all solar products and components in real time. Manage stock levels, product categories, pricing, and supplier information for panels, batteries, inverters, cables, and accessories.

### 🛒 Sales Management

Handle the complete sales lifecycle — from creating quotations to finalizing sales orders. Associate sales with clients, projects, and products with full audit trails.

### 🧾 Invoice Issuance

Generate professional, branded PDF invoices directly from the application. Invoices support bilingual output (Arabic/English) and are automatically populated from sales data.

### 💳 Payments Handling

Record, track, and reconcile client payments against invoices. Monitor outstanding balances, payment history, and generate financial summaries per client or project.

### 📁 Projects Management

Organize work around client projects. Link inventory, sales, invoices, and payments to a specific project for a complete 360° view of each engagement.

### 🏢 Enterprise & Multi-User Management

Support for multiple users with role-based access control. Manage teams, assign permissions, and maintain data integrity across your organization through a centralized Supabase backend.

---

## 🛠️ Tech Stack

### Frontend

[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Radix UI](https://img.shields.io/badge/Radix_UI-161618?style=for-the-badge&logo=radixui&logoColor=white)](https://www.radix-ui.com)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-EF0078?style=for-the-badge&logo=framer&logoColor=white)](https://www.framer.com/motion)

### Desktop Shell

[![Tauri](https://img.shields.io/badge/Tauri_2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org)

### Backend / Sidecar

[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
[![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-CC2927?style=for-the-badge&logo=databricks&logoColor=white)](https://www.sqlalchemy.org)

### Database & Auth

[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org)

### i18n & State

[![i18next](https://img.shields.io/badge/i18next-26A69A?style=for-the-badge&logo=i18next&logoColor=white)](https://www.i18next.com)
[![Zustand](https://img.shields.io/badge/Zustand-443E38?style=for-the-badge&logo=react&logoColor=white)](https://zustand-demo.pmnd.rs)
[![React Hook Form](https://img.shields.io/badge/React_Hook_Form-EC5990?style=for-the-badge&logo=reacthookform&logoColor=white)](https://react-hook-form.com)
[![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)](https://zod.dev)

---

## 🖼️ Screenshots

> Place your screenshots inside `public/screenshots/` and they will appear here.

|                   Login                    |               Projects Dashboard               |
| :----------------------------------------: | :--------------------------------------------: |
| ![Dashboard](public/screenshots/login.png) | ![Calculator](public/screenshots/projects.png) |

|                   Inventory                    |                  Invoices                   |
| :--------------------------------------------: | :-----------------------------------------: |
| ![Inventory](public/screenshots/inventory.png) | ![Invoices](public/screenshots/invoice.png) |

|                        Finance                        |                   Payments                   |
| :---------------------------------------------------: | :------------------------------------------: |
| ![Projects](public/screenshots/finance_dashboard.png) | ![Payments](public/screenshots/payments.png) |

|                        Components                        |
| :------------------------------------------------------: |
| ![Projects](public/screenshots/components_selection.png) |

---

## 🗂️ Project Structure

```
SSC/
├── src/                    # React frontend (TypeScript)
│   ├── components/         # Reusable UI components
│   ├── pages/              # Application pages/views
│   └── ...
├── src-python/             # Python sidecar (Flask + SQLAlchemy)
│   ├── app.py              # Flask entry point
│   └── ...
├── src-tauri/              # Tauri desktop shell (Rust)
│   ├── tauri.conf.json     # App configuration
│   └── ...
├── public/
│   ├── locales/            # i18n translation files (ar / en)
│   └── screenshots/        # App screenshots for README
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Rust](https://rustup.rs) (stable toolchain)
- [Python](https://www.python.org) 3.11+
- [Tauri CLI](https://tauri.app/start/prerequisites/) (`npm install -g @tauri-apps/cli`)

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Python Sidecar

The Python Flask backend runs as a compiled sidecar alongside the app. Build it before launching:

```bash
npm run build:py
```

---

## 💻 Development

### Run in Development Mode (standard)

```bash
npm run tauri dev
```

### Run in Beta Mode

```bash
npm run tauri:beta
```

> This sets `SSC_MODE=beta` and uses the beta Vite config.

### Frontend Only (Vite dev server)

```bash
npm run dev
# or
npm run dev:beta
```

---

## 📦 Building for Production

### Build Frontend + Tauri App (native installer)

```bash
npm run tauri build
```

This compiles the React frontend, bundles the Python sidecar, and packages everything into a native installer for your platform (`.exe` for Windows, `.deb`/`.AppImage` for Linux).

### Frontend Build Only

```bash
npm run build
```

### Lint

```bash
npm run lint
```

---

## 🌐 Internationalization

SSC supports **Arabic (RTL)** and **English (LTR)** out of the box via [i18next](https://www.i18next.com).

Translation files are located in:

```
public/locales/
├── ar/
│   └── translation.json
└── en/
    └── translation.json
```

---

## 📄 License

This is a proprietary application. All rights reserved.

---

<div align="center">
  Built with ❤️ using <a href="https://tauri.app">Tauri</a> & <a href="https://react.dev">React</a>.
</div>
