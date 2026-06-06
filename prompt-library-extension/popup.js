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

      const content = sanitizeText(version.content || version.prompt_content);
      if (!content) {
        return null;
      }

      return {
        id: sanitizeText(version.id) || generateUUID(),
        title: sanitizeText(version.title),
        content,
        tags: sanitizeTags(version.tags),
        usage_context: sanitizeUsageContext(version.usage_context),
        version_note: sanitizeText(version.version_note),
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

const searchWorker = new Worker("searchWorker.js");

function performSearch(query, prompts) {
  return new Promise((resolve) => {
    const searchId = Date.now().toString() + Math.random().toString();
    const handler = (e) => {
      if (e.data.searchId === searchId) {
        searchWorker.removeEventListener("message", handler);
        resolve(e.data.results);
      }
    };
    searchWorker.addEventListener("message", handler);
    searchWorker.postMessage({ query, prompts, searchId });
  });
}

// Storage helpers
async function loadPrompts() {
  const storedPrompts = await dbLoadPrompts();
  const normalizedPrompts = storedPrompts
    .map(normalizePrompt)
    .filter((prompt) => Boolean(prompt));
  return normalizedPrompts;
}

async function savePrompts(prompts) {
  await dbSavePrompts(prompts);
}

async function loadPromptDraft() {
  return await dbLoadPromptDraft();
}

async function savePromptDraft(draft) {
  await dbSavePromptDraft(draft);
}

async function clearPromptDraft() {
  await dbClearPromptDraft();
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

let currentObservers = {};

function renderChunkedList(containerId, prompts) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (currentObservers[containerId]) {
    currentObservers[containerId].disconnect();
    currentObservers[containerId] = null;
  }

  if (prompts.length === 0) {
    if (containerId === 'archiveList') {
      container.innerHTML = `<div class="empty-state"><p>No prompts yet. Create one to get started!</p></div>`;
    } else if (containerId === 'historyList') {
      container.innerHTML = `<div class="empty-state"><p>No recently used prompts.</p></div>`;
    } else if (containerId === 'searchResults') {
      container.innerHTML = `<div class="empty-state"><p>No prompts match your search.</p></div>`;
    }
    return;
  }

  container.innerHTML = '';
  const chunkSize = 20;
  let currentIndex = 0;

  const loadNextChunk = () => {
    const chunk = prompts.slice(currentIndex, currentIndex + chunkSize);
    if (chunk.length === 0) return;

    const oldSentinel = container.querySelector('.scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const html = chunk.map(prompt => renderPromptCard(prompt)).join('');
    container.insertAdjacentHTML('beforeend', html);

    currentIndex += chunkSize;

    if (currentIndex < prompts.length) {
      const sentinel = document.createElement('div');
      sentinel.className = 'scroll-sentinel';
      sentinel.style.height = '1px';
      container.appendChild(sentinel);
      
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          loadNextChunk();
        }
      });
      observer.observe(sentinel);
      currentObservers[containerId] = observer;
    }
  };

  loadNextChunk();
  attachCardListeners();
}

async function renderArchiveList(prompts) {
  const sortedPrompts = [...prompts].sort((a, b) => b.updated_at - a.updated_at);
  renderChunkedList('archiveList', sortedPrompts);
}

async function renderHistoryList(prompts) {
  const usedPrompts = prompts
    .filter((p) => p.last_used !== null && p.last_used !== undefined)
    .sort((a, b) => (b.last_used || 0) - (a.last_used || 0));
  renderChunkedList('historyList', usedPrompts);
}

let cardListenersAttached = false;
function attachCardListeners() {
  if (cardListenersAttached) return;
  cardListenersAttached = true;

  document.querySelector('.main-content').addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('.action-btn');
    const injectBtn = e.target.closest('.btn-inject');

    if (actionBtn) {
      const promptId = actionBtn.dataset.id;
      const action = actionBtn.dataset.action;
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
          actionBtn.textContent = "✓";
          setTimeout(() => {
            actionBtn.textContent = "📋";
          }, 2000);
          showToast("Message copied to clipboard.");
        } catch (err) {
          showToast("Copy failed.");
        }
      } else if (action === "delete") {
        const confirmed = window.confirm("Delete this prompt?");
        if (!confirmed) return;

        // Targeted DOM removal instead of full re-render
        await dbDeletePrompt(promptId);
        const card = actionBtn.closest('.prompt-card');
        if (card) card.remove();
        showToast("Prompt deleted.");
      }
    } else if (injectBtn) {
      const promptId = injectBtn.dataset.id;
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
    }
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

  document.getElementById("editPromptVersionNote").value = "";
  renderPopupVersionHistory(prompt);

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
  const container = document.getElementById("popupVersionHistoryContainer");
  if (container) {
    container.innerHTML = "";
  }
}

function trimPromptVersions(versions) {
  const MAX_PROMPT_VERSIONS = 30;
  if (!Array.isArray(versions) || versions.length <= MAX_PROMPT_VERSIONS) {
    return Array.isArray(versions) ? versions : [];
  }
  return [...versions]
    .sort((a, b) => a.saved_at - b.saved_at)
    .slice(-MAX_PROMPT_VERSIONS);
}

function renderPopupVersionHistory(prompt) {
  const container = document.getElementById("popupVersionHistoryContainer");
  const section = document.getElementById("popupVersionHistorySection");
  if (!container || !section) return;

  const versions = trimPromptVersions(sanitizePromptVersions(prompt.versions));
  if (versions.length === 0) {
    section.classList.add("hidden");
    container.innerHTML = '<div class="version-empty">No previous versions yet.</div>';
    return;
  }

  section.classList.remove("hidden");
  const sortedVersions = [...versions].sort((a, b) => b.saved_at - a.saved_at);
  container.innerHTML = sortedVersions.map((version, index) => {
    const preview = version.content.length > 140
      ? `${version.content.slice(0, 140)}...`
      : version.content;

    const titleText = version.title ? `<strong>${escapeHtml(version.title)}</strong>` : '<em>Unnamed</em>';
    const noteText = version.version_note ? `<span class="version-note">${escapeHtml(version.version_note)}</span>` : '';
    const tagsHtml = version.tags && version.tags.length > 0
      ? `<div class="version-tags">${version.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';

    return `
      <div class="version-item">
        <div class="version-meta">
          <span>${formatRelativeTime(version.saved_at)} - ${titleText}</span>
          ${noteText}
        </div>
        ${tagsHtml}
        <div class="version-preview">${escapeHtml(preview)}</div>
        <button type="button" class="btn-secondary action-btn restore-version-btn" data-version-index="${index}">Restore</button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.restore-version-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number.parseInt(event.currentTarget.dataset.versionIndex, 10);
      if (Number.isNaN(index) || !sortedVersions[index]) {
        return;
      }

      const ver = sortedVersions[index];
      document.getElementById('editPromptTitle').value = ver.title || '';
      document.getElementById('editPromptContent').value = ver.content || '';
      document.getElementById('editPromptTags').value = ver.tags ? ver.tags.join(', ') : '';
      if (ver.usage_context) {
        document.getElementById('editPromptBestUseCase').value = ver.usage_context.best_use_case || '';
        document.getElementById('editPromptRecommendedModel').value = ver.usage_context.recommended_model || '';
        document.getElementById('editPromptLimitations').value = ver.usage_context.limitations || '';
      } else {
        document.getElementById('editPromptBestUseCase').value = '';
        document.getElementById('editPromptRecommendedModel').value = '';
        document.getElementById('editPromptLimitations').value = '';
      }
      showToast('Version restored into editor. Save to apply.', 2200);
    });
  });
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

    const updateCharCount = (input, label, limit) => {
      if (!label) return;
      const count = input.value.length;
      if (limit) {
        label.textContent = `${count}/${limit}`;
        label.classList.toggle("over-limit", count > limit);
      } else {
        label.textContent = `${count} chars`;
        label.classList.remove("over-limit");
      }
    };

    const updateCharCounts = () => {
      updateCharCount(titleInput, titleCharCount, TITLE_LIMIT);
      updateCharCount(promptInput, promptCharCount, null); // No limit for prompt
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
    searchInput.addEventListener("input", async (e) => {
      const query = e.target.value.trim();
      const allPrompts = await loadPrompts();

      if (!query) {
        renderArchiveList(allPrompts);
        return;
      }

      const filtered = await performSearch(query, allPrompts);
      renderArchiveList(filtered);
    });
  }

  // Advanced search view handler
  const advancedSearchInput = document.getElementById("advancedSearchInput");
  if (advancedSearchInput) {
    advancedSearchInput.addEventListener("input", async (e) => {
      const query = e.target.value.trim();
      const allPrompts = await loadPrompts();

      if (!query) {
        document.getElementById("searchResults").innerHTML = `<div class="empty-state"><p>Enter a search query.</p></div>`;
        return;
      }

      const filtered = await performSearch(query, allPrompts);
      renderChunkedList("searchResults", filtered);
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
      const versionNote = document
        .getElementById("editPromptVersionNote")
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
        const shouldSnapshot = previousPrompt.prompt_content !== content || previousPrompt.title !== title || JSON.stringify(previousPrompt.tags) !== JSON.stringify(tags) || versionNote !== '';
        let versions = trimPromptVersions(sanitizePromptVersions(previousPrompt.versions));

        if (shouldSnapshot) {
          versions = trimPromptVersions([
            ...versions,
            {
              id: generateUUID(),
              title: previousPrompt.title,
              content: previousPrompt.prompt_content,
              tags: previousPrompt.tags,
              usage_context: previousPrompt.usage_context,
              version_note: versionNote,
              saved_at: Date.now(),
            },
          ]);
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
