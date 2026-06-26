# 🔄 GitSync Hub

A premium, modern web-based synchronization and comparison dashboard designed to manage local Git changes and perform selective bulk operations across two projects (`PROJECT_A` and `PROJECT_B`).

## ✨ Features

- **Real-Time Git Status**: Scans active changes (untracked, modified, deleted) in two separate directories simultaneously.
- **Selective Bulk Actions**: Toggle and select files individually or in batches to perform:
  - 🔄 **Sync / Overwrite**: Copy source files directly to the destination repository.
  - 🧠 **Smart Merge**: Intelligently merge changes for text/JSON files, avoiding data losses.
  - 🗑️ **Discard Changes**: Perform safe Git checkouts and cleans to undo local modifications.
- **Identity Detection**: Automatically compares file buffers between panels. Identical files are flagged and action buttons are suppressed to prevent redundant synchronization.
- **Interactive Diff Viewer**: Open unified side-by-side or inline diff viewers for local Git modifications and cross-project comparisons.
- **Responsive Theme**: High-fidelity dark mode with glassmorphism layout, glowing sphere backdrops, and fluid animations.
- **Visual Directory Picker**: Configure paths directly from settings via an inline filesystem explorer.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: HTML5, CSS3 (Vanilla design tokens, interactive micro-animations), JavaScript (ES6 State Management)
- **Icons**: Lucide Icons

---

## 🚀 Getting Started

### 1. Installation
Clone this repository and install its dependencies:
```bash
npm install
```

### 2. Configuration
Create a `.env` file in the root folder (or copy `.env.example`):
```bash
cp .env.example .env
```
Open `.env` and set the absolute paths of the two projects you want to synchronize:
```env
PORT=3000
PROJECT_A_PATH=/path/to/project-a
PROJECT_B_PATH=/path/to/project-b
```

### 3. Launch Development Server
Start the local server using:
```bash
npm run dev
```
Open your browser and navigate to **[http://localhost:3000](http://localhost:3000)**.

---

## 👤 Developer
Created and maintained by **Abderrahmane Erradi**

---
