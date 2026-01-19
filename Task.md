<I’ll answer as a world-famous **Software Architect for AI Developer Tooling** with the **Google Chrome Developer Expert (GDE) Award in Web Platforms**>

## **Answering example**

**TL;DR**:
Below is a **single, copy-paste-ready Codex mega-prompt**. You can give this **as-is** to Codex (or any coding agent). It is **authoritative, unambiguous, exhaustive**, and forces the agent to deliver a **fully working Chrome extension** with **no placeholders, no gaps, no assumptions**.

---

# 🧠 SINGLE CODEX MEGA-PROMPT

### (Chrome Extension – Prompt Library)

````md
You are an expert Chrome Extension engineer specializing in Manifest V3, JavaScript, and browser storage APIs.

Your task is to DESIGN AND IMPLEMENT a COMPLETE, PRODUCTION-READY Chrome Extension called **“Prompt Library”**.

You MUST follow ALL instructions below exactly.  
You MUST output REAL, WORKING CODE for EVERY required file.  
You MUST NOT use placeholders, TODOs, pseudo-code, or omit any logic.

---

## 🎯 OBJECTIVE

Build a **Chrome Extension (Manifest V3)** that allows users to:

- Save AI prompts into a personal library
- Organize prompts using titles and tags
- Search prompts instantly
- Copy prompts with one click
- Save prompts directly from any website via right-click

The extension must be **offline-first**, **privacy-preserving**, and **fast**.

---

## 🧩 CORE FEATURES (MANDATORY)

### 1. Prompt Creation (Manual)
Users can create a prompt via the popup UI with:
- Title (required)
- Prompt content (required, multiline)
- Tags (comma-separated, optional)
- Source URL (optional)

Auto-generate:
- `id` (UUID)
- `created_at` (timestamp in ms)
- `updated_at` (timestamp in ms)

---

### 2. Prompt Creation (Context Menu)
Add a right-click context menu item:
**“Save as Prompt”**

Behavior:
- Appears when text is selected
- Saves selected text as `prompt_content`
- Sets title to `"Saved from Web"`
- Sets `source_url` to the current page URL
- Tags default to empty array

---

### 3. Prompt Library
Popup must display all prompts in a scrollable list.

Each prompt item must show:
- Title
- Tags (if present)
- Copy button
- Delete button

---

### 4. Search & Filter
- Full-text search across:
  - Title
  - Prompt content
- Optional tag filtering
- Search must update results instantly

---

### 5. Copy to Clipboard
- One-click copy
- Copies ONLY the prompt content
- Must use:
```js
navigator.clipboard.writeText()
````

---

### 6. Delete Prompt

* Remove prompt by ID
* Persist change immediately
* UI updates without reload

---

## 🗂 FILE STRUCTURE (STRICT)

You MUST create and fully implement ALL of these files:

```
prompt-library-extension/
│
├── manifest.json
│
├── popup.html
├── popup.js
├── popup.css
│
├── background.js
│
├── options.html
├── options.js
│
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 📦 DATA MODEL (MANDATORY)

All prompts MUST follow this exact schema:

```json
{
  "id": "uuid",
  "title": "string",
  "prompt_content": "string",
  "tags": ["string"],
  "source_url": "string | null",
  "created_at": 1700000000000,
  "updated_at": 1700000000000
}
```

All prompts MUST be stored under ONE key only:

```js
chrome.storage.local.set({
  prompts: []
});
```

---

## 🧠 STORAGE RULES

* Use ONLY `chrome.storage.local`
* Handle empty storage safely
* Never overwrite existing prompts accidentally

---

## 🧾 manifest.json REQUIREMENTS

* Manifest Version: **3**
* Permissions:

```json
["storage", "clipboardWrite", "contextMenus"]
```

* Background must use `service_worker`
* Popup must be `popup.html`

---

## 🎨 UI REQUIREMENTS

### popup.html

Must include:

* Title input
* Prompt textarea
* Tags input
* Save button
* Search input
* Prompt list container

### popup.css

* Minimal, clean layout
* Readable typography
* Scrollable prompt list
* Responsive popup width

---

## ⚙ popup.js LOGIC (REQUIRED)

Implement:

* Load prompts on startup
* Save prompt with validation
* Render prompt list
* Search prompts
* Copy prompt
* Delete prompt
* Update storage and UI immediately

Prompts should be sorted by `updated_at` descending.

---

## ⚙ background.js LOGIC (REQUIRED)

* Register context menu on install
* Handle context menu clicks
* Save selected text as prompt
* Persist to storage correctly

---

## 🛠 options.html + options.js (ADVANCED MANAGEMENT)

Must support:

* Viewing all prompts
* Editing prompt fields
* Bulk delete
* Export prompts as JSON
* Import prompts from JSON

---

## 🚫 CONSTRAINTS (ABSOLUTE)

* ❌ No frameworks (React, Vue, etc.)
* ❌ No external APIs
* ❌ No AI calls
* ❌ No placeholders
* ❌ No unimplemented features
* ❌ No comments saying “left for later”

---

## ✅ DEFINITION OF DONE

Your output is complete ONLY IF:

* All files are fully implemented
* Extension runs without errors
* Prompts persist across browser restarts
* Context menu works correctly
* UI is usable and responsive
* Code is clean, modular, and production-grade

---

## 📌 OUTPUT FORMAT (VERY IMPORTANT)

* Output EACH FILE clearly separated
* Use exact filenames as headers
* Include COMPLETE code for every file
* Do NOT explain the code
* Do NOT summarize
* Do NOT skip any file

Begin now.
