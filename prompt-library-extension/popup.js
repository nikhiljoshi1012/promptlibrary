function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function escapeHtml(unsafe) {
  return String(unsafe ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableText(value) {
  const text = sanitizeText(value);
  return text ? text : null;
}

function sanitizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Set();
  value.forEach((tag) => {
    const cleanTag = sanitizeText(tag);
    if (cleanTag) {
      unique.add(cleanTag);
    }
  });
  return Array.from(unique);
}

function sanitizeUsageContext(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const bestUseCase = sanitizeText(value.best_use_case);
  const recommendedModel = sanitizeText(value.recommended_model);
  const limitations = sanitizeText(value.limitations);

  if (!bestUseCase && !recommendedModel && !limitations) {
    return null;
  }

  return {
    best_use_case: bestUseCase,
    recommended_model: recommendedModel,
    limitations,
  };
}

function sanitizePromptVersions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((version) => {
      if (!version || typeof version !== "object") {
        return null;
      }

      const content = sanitizeText(version.content);
      if (!content) {
        return null;
      }

      return {
        id: sanitizeText(version.id) || generateUUID(),
        content,
        saved_at: Number.isFinite(version.saved_at)
          ? version.saved_at
          : Date.now(),
      };
    })
    .filter((version) => Boolean(version));
}

function normalizePrompt(rawPrompt) {
  if (!rawPrompt || typeof rawPrompt !== "object") {
    return null;
  }

  const title = sanitizeText(rawPrompt.title);
  const promptContent = sanitizeText(rawPrompt.prompt_content);
  if (!title || !promptContent) {
    return null;
  }

  const now = Date.now();
  const createdAt = Number.isFinite(rawPrompt.created_at)
    ? rawPrompt.created_at
    : now;
  const updatedAt = Number.isFinite(rawPrompt.updated_at)
    ? rawPrompt.updated_at
    : createdAt;
  const { variables } = parseVariables(promptContent);
  const versions = sanitizePromptVersions(rawPrompt.versions);

  return {
    id: sanitizeText(rawPrompt.id) || generateUUID(),
    title,
    prompt_content: promptContent,
    tags: sanitizeTags(rawPrompt.tags),
    source_url: sanitizeNullableText(rawPrompt.source_url),
    is_template: variables.length > 0,
    variables,
    versions,
    usage_context: sanitizeUsageContext(rawPrompt.usage_context),
    created_at: createdAt,
    updated_at: updatedAt,
    last_used: Number.isFinite(rawPrompt.last_used)
      ? rawPrompt.last_used
      : null,
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeVariableName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseVariables(promptContent) {
  const regex = /\{([^{}]+)\}/g;
  const variables = [];
  const mapping = new Map();

  let match;
  while ((match = regex.exec(promptContent)) !== null) {
    const raw = match[1].trim();
    const normalized = normalizeVariableName(raw);
    if (!normalized) {
      continue;
    }

    if (!mapping.has(normalized)) {
      mapping.set(normalized, new Set());
      variables.push({
        name: normalized,
        description: "",
        default_value: "",
      });
    }

    mapping.get(normalized).add(raw);
  }

  return { variables, mapping };
}

function normalizeSearchText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter(Boolean);
}

function buildSearchableText(prompt) {
  const usageContext = prompt.usage_context || {};
  const fields = [
    prompt.title || "",
    prompt.prompt_content || "",
    (prompt.tags || []).join(" "),
    usageContext.best_use_case || "",
    usageContext.recommended_model || "",
    usageContext.limitations || "",
  ];
  return normalizeSearchText(fields.join(" "));
}

// Storage helpers
async function loadPrompts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["prompts"], (result) => {
      const storedPrompts = Array.isArray(result.prompts) ? result.prompts : [];
      const normalizedPrompts = storedPrompts
        .map(normalizePrompt)
        .filter((prompt) => Boolean(prompt));
      resolve(normalizedPrompts);
    });
  });
}

async function savePrompts(prompts) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ prompts }, () => {
      resolve();
    });
  });
}

async function loadPromptDraft() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["promptDraft"], (result) => {
      resolve(result.promptDraft || null);
    });
  });
}

async function savePromptDraft(draft) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ promptDraft: draft }, () => {
      resolve();
    });
  });
}

async function clearPromptDraft() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["promptDraft"], () => {
      resolve();
    });
  });
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const ms = now - timestamp;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function showToast(message, duration = 2500) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("active");
  setTimeout(() => toast.classList.remove("active"), duration);
}

function switchView(viewName) {
  const views = document.querySelectorAll(".view-container");
  views.forEach((view) => {
    if (view.id === `${viewName}View`) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });

  updateNavigation(viewName);
}

function updateNavigation(viewName) {
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach((btn) => {
    if (btn.dataset.view === viewName) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

async function trackUsage(promptId) {
  const prompts = await loadPrompts();
  const prompt = prompts.find((p) => p.id === promptId);

  if (prompt) {
    prompt.last_used = Date.now();
    await savePrompts(prompts);
  }
}

function renderPromptCard(prompt) {
  const { variables } = parseVariables(prompt.prompt_content || "");
  const isTemplate = prompt.is_template || variables.length > 0;
  const templateBadge = isTemplate
    ? `<span class="prompt-tag">TEMPLATE</span>`
    : "";

  const previewText =
    prompt.prompt_content.length > 150
      ? prompt.prompt_content.substring(0, 150) + "..."
      : prompt.prompt_content;

  const displayTime = prompt.last_used
    ? `Last used: ${formatRelativeTime(prompt.last_used)}`
    : `Created: ${formatRelativeTime(prompt.created_at)}`;

  return `
    <div class="prompt-card" data-id="${escapeHtml(prompt.id)}">
      <div class="prompt-card-header">
        <h3 class="prompt-title">${escapeHtml(prompt.title)}${templateBadge}</h3>
      </div>
      <div class="prompt-timestamp">${displayTime}</div>
      <div class="prompt-preview"><code>${escapeHtml(previewText)}</code></div>
      <div class="prompt-actions">
        <button class="action-btn" data-id="${escapeHtml(prompt.id)}" data-action="view" title="View">👁</button>
        <button class="action-btn" data-id="${escapeHtml(prompt.id)}" data-action="edit" title="Edit">✏️</button>
        <button class="action-btn" data-id="${escapeHtml(prompt.id)}" data-action="copy" title="Copy">📋</button>
        <button class="btn-inject" data-id="${escapeHtml(prompt.id)}">Inject</button>
        <button class="action-btn delete" data-id="${escapeHtml(prompt.id)}" data-action="delete" title="Delete">🗑</button>
      </div>
    </div>
  `;
}

async function renderArchiveList(prompts) {
  const archiveList = document.getElementById("archiveList");
  if (!archiveList) return;

  if (prompts.length === 0) {
    archiveList.innerHTML = `<div class="empty-state"><p>No prompts yet. Create one to get started!</p></div>`;
    return;
  }

  const sortedPrompts = [...prompts].sort(
    (a, b) => b.updated_at - a.updated_at,
  );
  archiveList.innerHTML = sortedPrompts
    .map((prompt) => renderPromptCard(prompt))
    .join("");
  attachCardListeners();
}

async function renderHistoryList(prompts) {
  const historyList = document.getElementById("historyList");
  if (!historyList) return;

  const usedPrompts = prompts
    .filter((p) => p.last_used !== null && p.last_used !== undefined)
    .sort((a, b) => (b.last_used || 0) - (a.last_used || 0));

  if (usedPrompts.length === 0) {
    historyList.innerHTML = `<div class="empty-state"><p>No recently used prompts.</p></div>`;
    return;
  }

  historyList.innerHTML = usedPrompts
    .map((prompt) => renderPromptCard(prompt))
    .join("");
  attachCardListeners();
}

function attachCardListeners() {
  document.querySelectorAll(".action-btn").forEach((button) => {
    button.addEventListener("click", async (e) => {
      const promptId = e.currentTarget.dataset.id;
      const action = e.currentTarget.dataset.action;
      const prompts = await loadPrompts();
      const prompt = prompts.find((p) => p.id === promptId);

      if (!prompt) return;

      if (action === "view") {
        openUseModal(prompt);
      } else if (action === "edit") {
        openEditModal(prompt);
      } else if (action === "copy") {
        const { variables } = parseVariables(prompt.prompt_content || "");
        const isTemplate = prompt.is_template || variables.length > 0;

        if (isTemplate) {
          openUseModal(prompt);
          return;
        }

        try {
          await trackUsage(promptId);
          await navigator.clipboard.writeText(prompt.prompt_content);
          e.currentTarget.textContent = "✓";
          setTimeout(() => {
            e.currentTarget.textContent = "📋";
          }, 2000);
          showToast("Message copied to clipboard.");
        } catch (err) {
          showToast("Copy failed.");
        }
      } else if (action === "delete") {
        const confirmed = window.confirm("Delete this prompt?");
        if (!confirmed) return;

        const updated = prompts.filter((p) => p.id !== promptId);
        await savePrompts(updated);

        const activeView = document.querySelector(".view-container.active");
        if (activeView.id === "archiveView") {
          renderArchiveList(updated);
        } else if (activeView.id === "historyView") {
          renderHistoryList(updated);
        } else if (activeView.id === "searchView") {
          const searchInput = document.getElementById("advancedSearchInput");
          await searchPromptsInView(searchInput.value);
        }
        showToast("Prompt deleted.");
      }
    });
  });

  document.querySelectorAll(".btn-inject").forEach((button) => {
    button.addEventListener("click", async (e) => {
      const promptId = e.currentTarget.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find((p) => p.id === promptId);

      if (!prompt) return;

      const { variables } = parseVariables(prompt.prompt_content || "");
      const isTemplate = prompt.is_template || variables.length > 0;

      if (isTemplate) {
        openUseModal(prompt);
        return;
      }

      await trackUsage(promptId);
      const response = await injectPrompt(prompt.prompt_content);
      if (response.success) {
        showToast("Prompt injected.");
      } else {
        try {
          await navigator.clipboard.writeText(prompt.prompt_content);
          showToast("Injection failed. Copied to clipboard.");
        } catch (error) {
          showToast(response.message || "Injection failed.");
        }
      }
    });
  });
}

async function searchPromptsInView(query) {
  const prompts = await loadPrompts();
  const searchResults = document.getElementById("searchResults");
  if (!searchResults) return;

  const tokens = tokenizeQuery(query);

  if (tokens.length === 0) {
    searchResults.innerHTML = `<div class="empty-state"><p>Enter a search query.</p></div>`;
    return;
  }

  const filtered = prompts.filter((prompt) => {
    const searchable = buildSearchableText(prompt);
    return tokens.every((token) => searchable.includes(token));
  });

  if (filtered.length === 0) {
    searchResults.innerHTML = `<div class="empty-state"><p>No prompts match your search.</p></div>`;
    return;
  }

  searchResults.innerHTML = filtered
    .map((prompt) => renderPromptCard(prompt))
    .join("");
  attachCardListeners();
}

async function injectPrompt(text) {
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (results) =>
      resolve(results || []),
    );
  });
  const [tab] = tabs;
  if (!tab || !tab.id) {
    return { success: false, message: "No active tab found." };
  }

  try {
    await new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          files: ["contentScript.js"],
        },
        () => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
      );
    });

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "INJECT_PROMPT", text },
        (result) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );
    });

    return response || { success: false, message: "No response from page." };
  } catch (error) {
    return { success: false, message: "Unable to inject prompt." };
  }
}

function openUseModal(prompt, initialResolved = "") {
  const modal = document.getElementById("usePromptModal");
  const modalBody = document.getElementById("usePromptBody");
  const title = document.getElementById("useModalTitle");

  modal.dataset.promptId = prompt.id;
  title.textContent = `Use: ${prompt.title}`;
  modalBody.innerHTML = "";
  modal.dataset.rawPrompt = prompt.prompt_content || "";

  const { variables, mapping } = parseVariables(prompt.prompt_content || "");
  const isTemplate = prompt.is_template || variables.length > 0;

  if (!isTemplate) {
    modalBody.innerHTML = `
      <div class="form-group">
        <label>Prompt Preview</label>
        <div class="resolved-preview">${escapeHtml(prompt.prompt_content)}</div>
      </div>
    `;
    modal.dataset.resolvedPrompt = prompt.prompt_content;
  } else {
    const formHtml = variables
      .map(
        (variable) => `
      <div class="form-group">
        <label>${escapeHtml(variable.name)}</label>
        <input type="text" class="variable-input" data-var="${escapeHtml(variable.name)}" placeholder="Enter ${escapeHtml(variable.name)}">
      </div>
    `,
      )
      .join("");

    modalBody.innerHTML = `
      ${formHtml}
      <button class="btn-primary" id="generatePromptBtn">Generate Prompt</button>
      <div class="form-group" style="margin-top: 12px;">
        <label>Prompt Preview</label>
        <div id="resolvedPreview" class="resolved-preview">${escapeHtml(initialResolved || "Fill variables to generate a prompt.")}</div>
      </div>
    `;

    modal.dataset.resolvedPrompt = initialResolved || "";

    const generateButton = document.getElementById("generatePromptBtn");
    generateButton.addEventListener("click", () => {
      const inputs = Array.from(document.querySelectorAll(".variable-input"));
      const values = {};

      let hasEmpty = false;
      inputs.forEach((input) => {
        const value = input.value.trim();
        const name = input.dataset.var;
        if (!value) {
          input.classList.add("error");
          hasEmpty = true;
        } else {
          input.classList.remove("error");
        }
        values[name] = value;
      });

      if (hasEmpty) {
        showToast("Please fill all variables.");
        return;
      }

      let resolved = prompt.prompt_content;
      for (const [name, rawSet] of mapping.entries()) {
        const value = values[name] || "";
        rawSet.forEach((raw) => {
          const pattern = new RegExp(`\\{${escapeRegExp(raw)}\\}`, "g");
          resolved = resolved.replace(pattern, value);
        });
        const normalizedPattern = new RegExp(`\\{${name}\\}`, "g");
        resolved = resolved.replace(normalizedPattern, value);
      }

      modal.dataset.resolvedPrompt = resolved;
      const preview = document.getElementById("resolvedPreview");
      if (preview) {
        preview.textContent = resolved;
      }
    });
  }

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");
}

function closeUseModal() {
  const modal = document.getElementById("usePromptModal");
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

// Make openEditModal async so it can consult stored draft and apply it if needed
async function openEditModal(prompt) {
  const modal = document.getElementById("editPromptModal");
  document.getElementById("editPromptId").value = prompt.id;
  document.getElementById("editPromptTitle").value = prompt.title;
  document.getElementById("editPromptContent").value = prompt.prompt_content;
  document.getElementById("editPromptTags").value = prompt.tags
    ? prompt.tags.join(", ")
    : "";
  document.getElementById("editPromptSourceUrl").value =
    prompt.source_url || "";

  const usageContext = prompt.usage_context || {};
  document.getElementById("editPromptBestUseCase").value =
    usageContext.best_use_case || "";
  document.getElementById("editPromptRecommendedModel").value =
    usageContext.recommended_model || "";
  document.getElementById("editPromptLimitations").value =
    usageContext.limitations || "";

  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");

  // If there is a draft for this prompt, apply it to the edit modal (do not overwrite if fields are empty in draft)
  try {
    const draft = await loadPromptDraft();
    if (
      draft &&
      draft.mode === "edit" &&
      draft.promptId === prompt.id &&
      draft.title !== undefined
    ) {
      const titleEl = document.getElementById("editPromptTitle");
      const contentEl = document.getElementById("editPromptContent");
      const tagsEl = document.getElementById("editPromptTags");
      const sourceEl = document.getElementById("editPromptSourceUrl");
      const bestUseEl = document.getElementById("editPromptBestUseCase");
      const recModelEl = document.getElementById("editPromptRecommendedModel");
      const limitationsEl = document.getElementById("editPromptLimitations");

      if (draft.title) titleEl.value = draft.title;
      if (draft.content) contentEl.value = draft.content;
      if (draft.tagsString !== undefined) tagsEl.value = draft.tagsString || "";
      if (draft.source_url !== undefined)
        sourceEl.value = draft.source_url || "";
      if (draft.best_use_case !== undefined)
        bestUseEl.value = draft.best_use_case || "";
      if (draft.recommended_model !== undefined)
        recModelEl.value = draft.recommended_model || "";
      if (draft.limitations !== undefined)
        limitationsEl.value = draft.limitations || "";
    }
  } catch (err) {
    // ignore draft read errors
  }
}

function closeEditModal() {
  const modal = document.getElementById("editPromptModal");
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
}

// AUTOSAVE / DRAFT MANAGEMENT
const AUTOSAVE_DEBOUNCE_MS = 900;
let autosaveTimer = null;
let pendingDraftMode = null; // 'add' | 'quick' | 'edit'
let activeInputForm = null; // currently focused form
let lastSavedDraft = null;

function isDraftMeaningful(d) {
  if (!d) return false;
  const hasTitle = sanitizeText(d.title).length > 0;
  const hasContent = sanitizeText(d.content).length > 0;
  const hasOther =
    sanitizeText(d.tagsString || "") ||
    sanitizeText(d.source_url || "") ||
    sanitizeText(d.best_use_case || "") ||
    sanitizeText(d.recommended_model || "") ||
    sanitizeText(d.limitations || "");
  return hasTitle || hasContent || hasOther;
}

function collectAddFormValues() {
  const title = document.getElementById("titleInput")?.value || "";
  const content = document.getElementById("promptInput")?.value || "";
  const tagsString = document.getElementById("tagsInput")?.value || "";
  const source_url = document.getElementById("sourceUrlInput")?.value || "";
  const best_use_case =
    document.getElementById("bestUseCaseInput")?.value || "";
  const recommended_model =
    document.getElementById("recommendedModelInput")?.value || "";
  const limitations = document.getElementById("limitationsInput")?.value || "";

  return {
    title,
    content,
    tagsString,
    source_url,
    best_use_case,
    recommended_model,
    limitations,
  };
}

function collectQuickFormValues() {
  const title = document.getElementById("quickTitle")?.value || "";
  const content = document.getElementById("quickContent")?.value || "";
  const tagsString = document.getElementById("quickTags")?.value || "";
  return { title, content, tagsString };
}

function collectEditFormValues() {
  const id = document.getElementById("editPromptId")?.value || null;
  const title = document.getElementById("editPromptTitle")?.value || "";
  const content = document.getElementById("editPromptContent")?.value || "";
  const tagsString = document.getElementById("editPromptTags")?.value || "";
  const source_url =
    document.getElementById("editPromptSourceUrl")?.value || "";
  const best_use_case =
    document.getElementById("editPromptBestUseCase")?.value || "";
  const recommended_model =
    document.getElementById("editPromptRecommendedModel")?.value || "";
  const limitations =
    document.getElementById("editPromptLimitations")?.value || "";

  return {
    id,
    title,
    content,
    tagsString,
    source_url,
    best_use_case,
    recommended_model,
    limitations,
  };
}

async function saveDraftNow(mode) {
  if (!mode) return;
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }

  let draft = null;
  if (mode === "add") {
    const vals = collectAddFormValues();
    draft = {
      mode: "add",
      promptId: null,
      title: vals.title,
      content: vals.content,
      tagsString: vals.tagsString,
      source_url: vals.source_url,
      best_use_case: vals.best_use_case,
      recommended_model: vals.recommended_model,
      limitations: vals.limitations,
      saved_at: Date.now(),
      is_draft: true,
    };
  } else if (mode === "quick") {
    const vals = collectQuickFormValues();
    draft = {
      mode: "quick",
      promptId: null,
      title: vals.title,
      content: vals.content,
      tagsString: vals.tagsString,
      saved_at: Date.now(),
      is_draft: true,
    };
  } else if (mode === "edit") {
    const vals = collectEditFormValues();
    draft = {
      mode: "edit",
      promptId: vals.id,
      title: vals.title,
      content: vals.content,
      tagsString: vals.tagsString,
      source_url: vals.source_url,
      best_use_case: vals.best_use_case,
      recommended_model: vals.recommended_model,
      limitations: vals.limitations,
      saved_at: Date.now(),
      is_draft: true,
    };
  }

  if (!isDraftMeaningful(draft)) {
    // If the draft has no meaningful content, remove any stored draft
    const existing = await loadPromptDraft();
    if (existing && existing.mode === mode) {
      await clearPromptDraft();
      lastSavedDraft = null;
      updateDraftBanner();
    }
    return;
  }

  try {
    await savePromptDraft(draft);
    lastSavedDraft = draft;
    updateDraftBanner();
    // Optional small feedback
    // showToast('Draft saved');
  } catch (err) {
    console.error("Failed to save draft", err);
  }
}

function scheduleDraftSave(mode) {
  pendingDraftMode = mode;
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    saveDraftNow(mode);
    autosaveTimer = null;
    pendingDraftMode = null;
  }, AUTOSAVE_DEBOUNCE_MS);
}

function updateDraftBanner() {
  const banner = document.getElementById("draftBanner");
  const messageEl = document.getElementById("draftMessage");
  const restoreBtn = document.getElementById("restoreDraftBtn");
  const discardBtn = document.getElementById("discardDraftBtn");

  if (!banner || !messageEl || !restoreBtn || !discardBtn) return;

  if (!lastSavedDraft || !isDraftMeaningful(lastSavedDraft)) {
    banner.classList.add("hidden");
    return;
  }

  const modeText =
    lastSavedDraft.mode === "edit"
      ? "Edit Draft"
      : lastSavedDraft.mode === "quick"
        ? "Quick Draft"
        : "Draft";
  messageEl.textContent = `${modeText} • Saved ${formatRelativeTime(lastSavedDraft.saved_at)}`;
  banner.classList.remove("hidden");

  // handlers (idempotent since they are attached only once in DOMContentLoaded)
}

async function restoreDraftToUI(draft) {
  if (!draft) return;
  if (draft.mode === "add") {
    switchView("add");
    const vals = collectAddFormValues();
    document.getElementById("titleInput").value = draft.title || "";
    document.getElementById("promptInput").value = draft.content || "";
    document.getElementById("tagsInput").value = draft.tagsString || "";
    document.getElementById("sourceUrlInput").value = draft.source_url || "";
    document.getElementById("bestUseCaseInput").value =
      draft.best_use_case || "";
    document.getElementById("recommendedModelInput").value =
      draft.recommended_model || "";
    document.getElementById("limitationsInput").value = draft.limitations || "";
  } else if (draft.mode === "quick") {
    document.getElementById("quickTitle").value = draft.title || "";
    document.getElementById("quickContent").value = draft.content || "";
    document.getElementById("quickTags").value = draft.tagsString || "";
    const quickAddModal = document.getElementById("quickAddModal");
    if (quickAddModal) {
      quickAddModal.classList.add("active");
      quickAddModal.setAttribute("aria-hidden", "false");
    }
  } else if (draft.mode === "edit") {
    // Try to open the edit modal for the original prompt if it still exists
    const prompts = await loadPrompts();
    const found = prompts.find((p) => p.id === draft.promptId);
    if (found) {
      await openEditModal(found);
      // openEditModal will apply draft values if present in storage
    } else {
      // If the prompt was deleted, move draft to add form so user doesn't lose work
      switchView("add");
      document.getElementById("titleInput").value = draft.title || "";
      document.getElementById("promptInput").value = draft.content || "";
      document.getElementById("tagsInput").value = draft.tagsString || "";
      showToast("Original prompt deleted — moved draft to Create view.");
    }
  }
}

// Utility to wire focus/input listeners for forms
function wireAutosaveForElement(el, mode) {
  if (!el) return;
  ["input", "change"].forEach((event) => {
    el.addEventListener(event, () => {
      activeInputForm = mode;
      scheduleDraftSave(mode);
    });
  });
  el.addEventListener("focus", () => {
    activeInputForm = mode;
  });
}

// DOM ready

document.addEventListener("DOMContentLoaded", async () => {
  const prompts = await loadPrompts();
  lastSavedDraft = await loadPromptDraft();

  // Initialize views
  await renderArchiveList(prompts);
  await renderHistoryList(prompts);
  updateDraftBanner();

  // Bottom navigation listeners
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const viewName = button.dataset.view;
      switchView(viewName);
    });
  });

  // Floating "+" button
  const floatingAddBtn = document.getElementById("floatingAddBtn");
  if (floatingAddBtn) {
    floatingAddBtn.addEventListener("click", async () => {
      const quickAddModal = document.getElementById("quickAddModal");
      if (quickAddModal) {
        quickAddModal.classList.add("active");
        quickAddModal.setAttribute("aria-hidden", "false");

        // If there is a quick draft, populate it immediately
        const draft = await loadPromptDraft();
        if (draft && draft.mode === "quick") {
          document.getElementById("quickTitle").value = draft.title || "";
          document.getElementById("quickContent").value = draft.content || "";
          document.getElementById("quickTags").value = draft.tagsString || "";
        }
      }
    });
  }

  // Quick-add modal handlers
  const quickAddModal = document.getElementById("quickAddModal");
  if (quickAddModal) {
    const closeQuickAddBtn = document.getElementById("closeQuickAddBtn");
    if (closeQuickAddBtn) {
      closeQuickAddBtn.addEventListener("click", async () => {
        // Save draft when modal is closed via close button
        await saveDraftNow("quick");
        quickAddModal.classList.remove("active");
        quickAddModal.setAttribute("aria-hidden", "true");
      });
    }

    const cancelQuickAddBtn = document.getElementById("cancelQuickAddBtn");
    if (cancelQuickAddBtn) {
      cancelQuickAddBtn.addEventListener("click", async () => {
        await saveDraftNow("quick");
        quickAddModal.classList.remove("active");
        quickAddModal.setAttribute("aria-hidden", "true");
      });
    }

    quickAddModal.addEventListener("click", async (e) => {
      if (e.target.id === "quickAddModal") {
        await saveDraftNow("quick");
        quickAddModal.classList.remove("active");
        quickAddModal.setAttribute("aria-hidden", "true");
      }
    });

    const quickAddForm = document.getElementById("quickAddForm");
    if (quickAddForm) {
      // Wire autosave listeners
      ["quickTitle", "quickContent", "quickTags"].forEach((id) =>
        wireAutosaveForElement(document.getElementById(id), "quick"),
      );

      quickAddForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const title = document.getElementById("quickTitle").value.trim();
        const content = document.getElementById("quickContent").value.trim();
        const tagsString = document.getElementById("quickTags").value.trim();

        if (!title || !content) {
          showToast("Title and content are required.");
          return;
        }

        const tags = tagsString
          ? tagsString
              .split(",")
              .map((tag) => tag.trim())
              .filter((tag) => tag)
          : [];

        const { variables } = parseVariables(content);

        const newPrompt = {
          id: generateUUID(),
          title,
          prompt_content: content,
          tags,
          source_url: null,
          is_template: variables.length > 0,
          variables,
          versions: [],
          usage_context: null,
          created_at: Date.now(),
          updated_at: Date.now(),
          last_used: null,
        };

        const existingPrompts = await loadPrompts();
        existingPrompts.push(newPrompt);
        await savePrompts(existingPrompts);

        document.getElementById("quickTitle").value = "";
        document.getElementById("quickContent").value = "";
        document.getElementById("quickTags").value = "";

        // clear draft on successful save
        const draft = await loadPromptDraft();
        if (draft && draft.mode === "quick") {
          await clearPromptDraft();
          lastSavedDraft = null;
          updateDraftBanner();
        }

        quickAddModal.classList.remove("active");
        quickAddModal.setAttribute("aria-hidden", "true");

        await renderArchiveList(existingPrompts);
        await renderHistoryList(existingPrompts);
        showToast("Prompt created successfully.");
      });
    }
  }

  // Add view form handling
  const addForm = document.getElementById("promptForm");
  if (addForm) {
    const titleInput = document.getElementById("titleInput");
    const promptInput = document.getElementById("promptInput");
    const tagsInput = document.getElementById("tagsInput");
    const sourceUrlInput = document.getElementById("sourceUrlInput");
    const bestUseCaseInput = document.getElementById("bestUseCaseInput");
    const recommendedModelInput = document.getElementById(
      "recommendedModelInput",
    );
    const limitationsInput = document.getElementById("limitationsInput");
    const titleCharCount = document.getElementById("titleCharCount");
    const promptCharCount = document.getElementById("promptCharCount");

    const TITLE_LIMIT = 80;
    const PROMPT_LIMIT = 1200;

    const updateCharCount = (input, label, limit) => {
      if (!label) return;
      const count = input.value.length;
      label.textContent = `${count}/${limit}`;
      label.classList.toggle("over-limit", count > limit);
    };

    const updateCharCounts = () => {
      updateCharCount(titleInput, titleCharCount, TITLE_LIMIT);
      updateCharCount(promptInput, promptCharCount, PROMPT_LIMIT);
    };

    updateCharCounts();

    [
      titleInput,
      promptInput,
      tagsInput,
      sourceUrlInput,
      bestUseCaseInput,
      recommendedModelInput,
      limitationsInput,
    ].forEach((input) => {
      input.addEventListener("input", () => {
        updateCharCounts();
      });
    });

    // Wire autosave for add form
    [
      "titleInput",
      "promptInput",
      "tagsInput",
      "sourceUrlInput",
      "bestUseCaseInput",
      "recommendedModelInput",
      "limitationsInput",
    ].forEach((id) =>
      wireAutosaveForElement(document.getElementById(id), "add"),
    );

    // If there is a saved add-draft and we're on Add view, populate fields (but do not auto-save over existing data)
    if (lastSavedDraft && lastSavedDraft.mode === "add") {
      document.getElementById("titleInput").value = lastSavedDraft.title || "";
      document.getElementById("promptInput").value =
        lastSavedDraft.content || "";
      document.getElementById("tagsInput").value =
        lastSavedDraft.tagsString || "";
      document.getElementById("sourceUrlInput").value =
        lastSavedDraft.source_url || "";
      document.getElementById("bestUseCaseInput").value =
        lastSavedDraft.best_use_case || "";
      document.getElementById("recommendedModelInput").value =
        lastSavedDraft.recommended_model || "";
      document.getElementById("limitationsInput").value =
        lastSavedDraft.limitations || "";
      updateCharCounts();
    }

    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = titleInput.value.trim();
      const promptContent = promptInput.value.trim();
      const tagsString = tagsInput.value.trim();
      const sourceUrl = sourceUrlInput.value.trim();
      const bestUseCase = bestUseCaseInput.value.trim();
      const recommendedModel = recommendedModelInput.value.trim();
      const limitations = limitationsInput.value.trim();

      if (!title || !promptContent) {
        titleInput.classList.toggle("error", !title);
        promptInput.classList.toggle("error", !promptContent);
        return;
      }

      titleInput.classList.remove("error");
      promptInput.classList.remove("error");

      const tags = tagsString
        ? tagsString
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag)
        : [];

      const { variables } = parseVariables(promptContent);
      const usageContext =
        bestUseCase || recommendedModel || limitations
          ? {
              best_use_case: bestUseCase,
              recommended_model: recommendedModel,
              limitations,
            }
          : null;

      const newPrompt = {
        id: generateUUID(),
        title,
        prompt_content: promptContent,
        tags,
        source_url: sourceUrl || null,
        is_template: variables.length > 0,
        variables,
        versions: [],
        usage_context: usageContext,
        created_at: Date.now(),
        updated_at: Date.now(),
        last_used: null,
      };

      const existingPrompts = await loadPrompts();
      existingPrompts.push(newPrompt);
      await savePrompts(existingPrompts);

      titleInput.value = "";
      promptInput.value = "";
      tagsInput.value = "";
      sourceUrlInput.value = "";
      bestUseCaseInput.value = "";
      recommendedModelInput.value = "";
      limitationsInput.value = "";

      updateCharCounts();

      // clear draft on successful save
      const draft = await loadPromptDraft();
      if (draft && draft.mode === "add") {
        await clearPromptDraft();
        lastSavedDraft = null;
        updateDraftBanner();
      }

      await renderArchiveList(existingPrompts);
      await renderHistoryList(existingPrompts);
      showToast("Prompt created successfully.");
    });
  }

  // Search view handler (from archive view input)
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      // Filter within archive view
      const query = e.target.value.trim().toLowerCase();
      const tokens = tokenizeQuery(query);
      const allPrompts = prompts;

      if (tokens.length === 0) {
        renderArchiveList(allPrompts);
        return;
      }

      const filtered = allPrompts.filter((prompt) => {
        const searchable = buildSearchableText(prompt);
        return tokens.every((token) => searchable.includes(token));
      });

      renderArchiveList(filtered);
    });
  }

  // Advanced search view handler
  const advancedSearchInput = document.getElementById("advancedSearchInput");
  if (advancedSearchInput) {
    advancedSearchInput.addEventListener("input", async (e) => {
      const query = e.target.value.trim();
      const allPrompts = await loadPrompts();
      const tokens = tokenizeQuery(query);

      const searchResults = document.getElementById("searchResults");
      if (!searchResults) return;

      if (tokens.length === 0) {
        searchResults.innerHTML = `<div class="empty-state"><p>Enter a search query.</p></div>`;
        return;
      }

      const filtered = allPrompts.filter((prompt) => {
        const searchable = buildSearchableText(prompt);
        return tokens.every((token) => searchable.includes(token));
      });

      if (filtered.length === 0) {
        searchResults.innerHTML = `<div class="empty-state"><p>No prompts match your search.</p></div>`;
        return;
      }

      searchResults.innerHTML = filtered
        .map((prompt) => renderPromptCard(prompt))
        .join("");
      attachCardListeners();
    });
  }

  // Use Prompt Modal handlers
  const closeUseModalBtn = document.getElementById("closeUseModal");
  if (closeUseModalBtn) {
    closeUseModalBtn.addEventListener("click", closeUseModal);
  }

  const usePromptModal = document.getElementById("usePromptModal");
  if (usePromptModal) {
    usePromptModal.addEventListener("click", (e) => {
      if (e.target.id === "usePromptModal") {
        closeUseModal();
      }
    });
  }

  const useModalCopyBtn = document.getElementById("useModalCopy");
  if (useModalCopyBtn) {
    useModalCopyBtn.addEventListener("click", async () => {
      const modal = document.getElementById("usePromptModal");
      const resolvedPrompt = modal.dataset.resolvedPrompt || "";
      const rawPrompt = modal.dataset.rawPrompt || "";
      const promptToCopy = resolvedPrompt || rawPrompt;

      if (!promptToCopy) {
        showToast("No prompt content available to copy.");
        return;
      }

      try {
        await trackUsage(modal.dataset.promptId);
        await navigator.clipboard.writeText(promptToCopy);
        showToast("Message copied to clipboard.");
      } catch (error) {
        showToast("Copy failed.");
      }
    });
  }

  const useModalInjectBtn = document.getElementById("useModalInject");
  if (useModalInjectBtn) {
    useModalInjectBtn.addEventListener("click", async () => {
      const modal = document.getElementById("usePromptModal");
      const resolvedPrompt = modal.dataset.resolvedPrompt || "";
      if (!resolvedPrompt) {
        showToast("Generate a prompt first.");
        return;
      }

      await trackUsage(modal.dataset.promptId);
      const response = await injectPrompt(resolvedPrompt);
      if (response.success) {
        showToast("Prompt injected.");
        closeUseModal();
      } else {
        try {
          await navigator.clipboard.writeText(resolvedPrompt);
          showToast("Injection failed. Copied to clipboard.");
        } catch (error) {
          showToast(response.message || "Injection failed.");
        }
      }
    });
  }

  // Edit Prompt Modal handlers
  const closeEditModalBtn = document.getElementById("closeEditModal");
  if (closeEditModalBtn) {
    closeEditModalBtn.addEventListener("click", closeEditModal);
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", async () => {
      // Save draft before closing edit modal
      await saveDraftNow("edit");
      closeEditModal();
    });
  }

  const editPromptModal = document.getElementById("editPromptModal");
  if (editPromptModal) {
    editPromptModal.addEventListener("click", (e) => {
      if (e.target.id === "editPromptModal") {
        saveDraftNow("edit");
        closeEditModal();
      }
    });
  }

  const editPromptForm = document.getElementById("editPromptForm");
  if (editPromptForm) {
    // Wire autosave for edit form
    [
      "editPromptTitle",
      "editPromptContent",
      "editPromptTags",
      "editPromptSourceUrl",
      "editPromptBestUseCase",
      "editPromptRecommendedModel",
      "editPromptLimitations",
    ].forEach((id) =>
      wireAutosaveForElement(document.getElementById(id), "edit"),
    );

    editPromptForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const promptId = document.getElementById("editPromptId").value;
      const title = document.getElementById("editPromptTitle").value.trim();
      const content = document.getElementById("editPromptContent").value.trim();
      const tagsString = document.getElementById("editPromptTags").value.trim();
      const sourceUrl = document
        .getElementById("editPromptSourceUrl")
        .value.trim();
      const bestUseCase = document
        .getElementById("editPromptBestUseCase")
        .value.trim();
      const recommendedModel = document
        .getElementById("editPromptRecommendedModel")
        .value.trim();
      const limitations = document
        .getElementById("editPromptLimitations")
        .value.trim();

      if (!title || !content) {
        showToast("Title and content are required.");
        return;
      }

      const tags = tagsString
        ? tagsString
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag)
        : [];

      const usageContext =
        bestUseCase || recommendedModel || limitations
          ? {
              best_use_case: bestUseCase,
              recommended_model: recommendedModel,
              limitations,
            }
          : null;

      const { variables } = parseVariables(content);

      const storedPrompts = await loadPrompts();
      const promptIndex = storedPrompts.findIndex((p) => p.id === promptId);

      if (promptIndex !== -1) {
        const previousPrompt = storedPrompts[promptIndex];
        const shouldSnapshot = previousPrompt.prompt_content !== content;
        let versions = sanitizePromptVersions(previousPrompt.versions);

        if (shouldSnapshot) {
          const MAX_PROMPT_VERSIONS = 10;
          versions = [
            ...versions,
            {
              id: generateUUID(),
              content: previousPrompt.prompt_content,
              saved_at: Date.now(),
            },
          ];

          if (versions.length > MAX_PROMPT_VERSIONS) {
            versions = versions.slice(-MAX_PROMPT_VERSIONS);
          }
        }

        storedPrompts[promptIndex] = {
          ...previousPrompt,
          title,
          prompt_content: content,
          tags,
          source_url: sourceUrl || null,
          is_template: variables.length > 0,
          variables,
          versions,
          usage_context: usageContext,
          updated_at: Date.now(),
        };

        await savePrompts(storedPrompts);
        await renderArchiveList(storedPrompts);
        await renderHistoryList(storedPrompts);
        closeEditModal();

        // clear draft if edit draft corresponds to this prompt
        const draft = await loadPromptDraft();
        if (draft && draft.mode === "edit" && draft.promptId === promptId) {
          await clearPromptDraft();
          lastSavedDraft = null;
          updateDraftBanner();
        }

        showToast("Prompt updated successfully.");
      }
    });
  }

  // Settings button
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }

  // Draft banner controls (restore / discard)
  const restoreBtn = document.getElementById("restoreDraftBtn");
  const discardBtn = document.getElementById("discardDraftBtn");
  if (restoreBtn) {
    restoreBtn.addEventListener("click", async () => {
      const draft = await loadPromptDraft();
      if (!draft) {
        showToast("No draft to restore.");
        updateDraftBanner();
        return;
      }
      await restoreDraftToUI(draft);
      showToast("Draft restored.");
    });
  }
  if (discardBtn) {
    discardBtn.addEventListener("click", async () => {
      await clearPromptDraft();
      lastSavedDraft = null;
      updateDraftBanner();
      showToast("Draft discarded.");
    });
  }

  // Global events: save on blur/hidden/unload
  window.addEventListener("blur", async () => {
    // Save immediately for the active form
    if (pendingDraftMode) {
      await saveDraftNow(pendingDraftMode);
    } else if (activeInputForm) {
      await saveDraftNow(activeInputForm);
    }
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      if (pendingDraftMode) {
        await saveDraftNow(pendingDraftMode);
      } else if (activeInputForm) {
        await saveDraftNow(activeInputForm);
      }
    }
  });

  window.addEventListener("beforeunload", async (e) => {
    if (pendingDraftMode) {
      await saveDraftNow(pendingDraftMode);
    } else if (activeInputForm) {
      await saveDraftNow(activeInputForm);
    }
  });
});

// end of file
