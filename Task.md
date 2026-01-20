---

# 📘 Codex Feature Specifications

## Prompt OS – Killer Features (Implementation Ready)

---

## 1️⃣ Prompt Templates with Variables

### Feature Name

**Prompt Templates with Variables**

---

### Goal

Allow prompts to contain **dynamic placeholders** that users can fill at usage time, turning prompts into reusable, parameterized tools.

---

### Functional Description

A prompt may include **variables** using the syntax:

```
{variable_name}
```

Example:

```
Summarize this {document_type} for a {audience} in a {tone}.
```

When the user selects this prompt:

* The system detects all variables
* Prompts the user to input values
* Generates a **final resolved prompt**

---

### Data Model Extension

Each prompt object must support:

```json
{
  "is_template": true,
  "variables": [
    {
      "name": "document_type",
      "description": "Type of document to summarize",
      "default_value": ""
    }
  ]
}
```

Rules:

* Variables are **derived automatically** by parsing `{}` in prompt content
* Variable names must be:

  * lowercase
  * snake_case
  * unique per prompt

---

### UI Requirements

When user clicks **Use Prompt**:

1. Detect variables
2. Render a form with:

   * Label = variable name
   * Optional description
   * Input field (text)
3. Button: **Generate Prompt**
4. Show final prompt preview
5. Allow:

   * Copy
   * Inject (see Feature #2)

---

### Edge Cases

* If no variables → behave like normal prompt
* Missing values → block generation
* Duplicate variable names → de-duplicate automatically
* Escaped `{}` not supported in v1

---

### Acceptance Criteria

* Variables auto-detected
* User must fill all variables
* Final prompt is correctly substituted
* Original template remains unchanged

---

## 2️⃣ One-Click Prompt Injection

### Feature Name

**One-Click Prompt Injection**

---

### Goal

Insert a prompt **directly into the active AI input field** instead of copying to clipboard.

---

### Functional Description

When the user clicks **Inject Prompt**:

* The extension detects the currently focused text input
* Inserts the prompt content at cursor position
* Does NOT overwrite existing text unless explicitly selected

Supported targets:

* ChatGPT
* Claude
* Gemini
* Any `<textarea>` or `contenteditable` input

---

### Technical Requirements

* Use a **content script**
* Inject script only on user action
* Must support:

  * `<textarea>`
  * `<input type="text">`
  * `contenteditable=true`

---

### Injection Logic

1. Identify active element
2. Validate it is editable
3. Insert text using:

   * `value` manipulation OR
   * `document.execCommand` fallback
4. Trigger `input` and `change` events

---

### UI Requirements

Each prompt card must have:

* **Copy** button
* **Inject** button

If injection fails:

* Fallback to clipboard copy
* Show warning toast

---

### Edge Cases

* No focused input → show error
* Read-only input → block injection
* Multiple AI tabs → inject only into active tab

---

### Acceptance Criteria

* Prompt appears instantly in input box
* Cursor moves to end of inserted text
* No page reload
* No console errors

---

## 3️⃣ Prompt Usage Context (“When to use this”)

### Feature Name

**Prompt Usage Context Metadata**

---

### Goal

Attach **usage knowledge** to prompts so users know **when and how** to use them effectively.

---

### Functional Description

Each prompt can store contextual metadata explaining:

* When to use it
* Best AI model
* Known limitations

This metadata is **not copied or injected**, only displayed.

---

### Data Model Extension

```json
{
  "usage_context": {
    "best_use_case": "Explain complex financial documents",
    "recommended_model": "GPT-4 / Claude 3",
    "limitations": "Struggles with scanned PDFs"
  }
}
```

---

### UI Requirements

* Editable section in:

  * Prompt creation
  * Prompt edit view
* Read-only preview in prompt list (collapsed)
* Expandable “ℹ️ Context” section

---

### Behavior Rules

* Optional but strongly encouraged
* Does not affect search by default
* Displayed during prompt selection

---

### Edge Cases

* Empty context → hide section
* Long text → truncate with “Show more”

---

### Acceptance Criteria

* Metadata persists correctly
* Editing context updates prompt
* Context is never copied/injected

---

## 4️⃣ Fast Semantic Search

### Feature Name

**Fast Semantic Search (Local)**

---

### Goal

Enable **instant retrieval** of prompts by intent, keywords, or tags.

---

### Functional Description

Search input filters prompts in real time based on:

* Title
* Prompt content
* Tags
* Usage context fields

Search is **case-insensitive** and **token-based**.

---

### Search Logic

For each prompt:

* Concatenate searchable fields
* Normalize (lowercase)
* Match if ALL query tokens exist

Example:
Search:

```
summarize finance
```

Matches prompts containing both terms anywhere.

---

### Performance Requirements

* No debounce delay
* Works with 500+ prompts
* No blocking UI thread

---

### UI Requirements

* Search input at top
* Results update on every keystroke
* Highlight matching text (optional)

---

### Edge Cases

* Empty search → show all
* No matches → show empty state
* Special characters ignored

---

### Acceptance Criteria

* Search feels instant
* Results are accurate
* No flickering or lag

---

## 🔑 Codex Implementation Rules (IMPORTANT)

* Implement features incrementally
* Do NOT hardcode AI providers
* No external APIs required
* All logic must be local-first
* Code must be readable and modular

---
