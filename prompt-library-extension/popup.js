function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeHtml(unsafe) {
  return String(unsafe ?? '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
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
  if (!value || typeof value !== 'object') {
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
    limitations
  };
}

function sanitizePromptVersions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((version) => {
      if (!version || typeof version !== 'object') {
        return null;
      }

      const content = sanitizeText(version.content);
      if (!content) {
        return null;
      }

      return {
        id: sanitizeText(version.id) || generateUUID(),
        content,
        saved_at: Number.isFinite(version.saved_at) ? version.saved_at : Date.now()
      };
    })
    .filter((version) => Boolean(version));
}

function normalizePrompt(rawPrompt) {
  if (!rawPrompt || typeof rawPrompt !== 'object') {
    return null;
  }

  const title = sanitizeText(rawPrompt.title);
  const promptContent = sanitizeText(rawPrompt.prompt_content);
  if (!title || !promptContent) {
    return null;
  }

  const now = Date.now();
  const createdAt = Number.isFinite(rawPrompt.created_at) ? rawPrompt.created_at : now;
  const updatedAt = Number.isFinite(rawPrompt.updated_at) ? rawPrompt.updated_at : createdAt;
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
    updated_at: updatedAt
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeVariableName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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
        description: '',
        default_value: ''
      });
    }

    mapping.get(normalized).add(raw);
  }

  return { variables, mapping };
}

function normalizeSearchText(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeQuery(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return [];
  }
  return normalized.split(' ').filter(Boolean);
}

function buildSearchableText(prompt) {
  const usageContext = prompt.usage_context || {};
  const fields = [
    prompt.title || '',
    prompt.prompt_content || '',
    (prompt.tags || []).join(' '),
    usageContext.best_use_case || '',
    usageContext.recommended_model || '',
    usageContext.limitations || ''
  ];
  return normalizeSearchText(fields.join(' '));
}

async function loadPrompts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['prompts'], (result) => {
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
    chrome.storage.local.get(['promptDraft'], (result) => {
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
    chrome.storage.local.remove(['promptDraft'], () => {
      resolve();
    });
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), duration);
}

function renderPrompts(prompts) {
  const promptsList = document.getElementById('promptsList');
  const promptCount = document.getElementById('promptCount');

  promptCount.textContent = prompts.length;

  if (prompts.length === 0) {
    promptsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon" aria-label="Empty prompt library">📝</div>
        <div class="empty-state-text">No prompts yet. Create your first prompt above!</div>
      </div>
    `;
    return;
  }

  const sortedPrompts = [...prompts].sort((a, b) => b.updated_at - a.updated_at);

  promptsList.innerHTML = sortedPrompts.map(prompt => {
    const tagsHtml = prompt.tags && prompt.tags.length > 0
      ? `<div class="prompt-tags">${prompt.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`
      : '';

    const sourceHtml = prompt.source_url
      ? `<div class="prompt-meta">Source: ${escapeHtml(prompt.source_url)}</div>`
      : '';

    const promptContent = prompt.prompt_content || '';
    const { variables } = parseVariables(promptContent);
    const isTemplate = prompt.is_template || variables.length > 0;
    const templateBadge = isTemplate ? `<span class="prompt-badge">Template</span>` : '';

    const contentPreview = promptContent.length > 200
      ? promptContent.substring(0, 200) + '...'
      : promptContent;

    const usageContext = prompt.usage_context || {};
    const hasContext = usageContext.best_use_case || usageContext.recommended_model || usageContext.limitations;
    const contextHtml = hasContext
      ? `
        <details class="context-details">
          <summary>ℹ️ Context</summary>
          ${usageContext.best_use_case ? `<div class="context-line"><strong>Best use:</strong> ${escapeHtml(usageContext.best_use_case)}</div>` : ''}
          ${usageContext.recommended_model ? `<div class="context-line"><strong>Model:</strong> ${escapeHtml(usageContext.recommended_model)}</div>` : ''}
          ${usageContext.limitations ? `<div class="context-line"><strong>Limitations:</strong> ${escapeHtml(usageContext.limitations)}</div>` : ''}
        </details>
      `
      : '';

    return `
      <div class="prompt-item" data-id="${escapeHtml(prompt.id)}">
        <div class="prompt-header">
          <div class="prompt-title">${escapeHtml(prompt.title)}${templateBadge}</div>
          <div class="prompt-actions">
            <button class="btn-use" data-id="${escapeHtml(prompt.id)}">View</button>
            <button class="btn-edit" data-id="${escapeHtml(prompt.id)}">Edit</button>
            <button class="btn-copy" data-id="${escapeHtml(prompt.id)}">Copy</button>
            <button class="btn-inject" data-id="${escapeHtml(prompt.id)}">Inject</button>
            <button class="btn-delete" data-id="${escapeHtml(prompt.id)}">Delete</button>
          </div>
        </div>
        ${tagsHtml}
        <div class="prompt-content">${escapeHtml(contentPreview)}</div>
        ${contextHtml}
        <div class="prompt-meta">Created: ${formatDate(prompt.created_at)}</div>
        ${sourceHtml}
      </div>
    `;
  }).join('');

  attachEventListeners();
}

async function injectPrompt(text) {
  const tabs = await new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (results) => resolve(results || []));
  });
  const [tab] = tabs;
  if (!tab || !tab.id) {
    return { success: false, message: 'No active tab found.' };
  }

  try {
    await new Promise((resolve, reject) => {
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['contentScript.js']
      }, () => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { type: 'INJECT_PROMPT', text }, (result) => {
        const error = chrome.runtime.lastError;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });

    return response || { success: false, message: 'No response from page.' };
  } catch (error) {
    return { success: false, message: 'Unable to inject prompt.' };
  }
}

function openUseModal(prompt, initialResolved = '') {
  const modal = document.getElementById('usePromptModal');
  const modalBody = document.getElementById('usePromptBody');
  const title = document.getElementById('useModalTitle');

  title.textContent = `Use: ${prompt.title}`;
  modalBody.innerHTML = '';
  modal.dataset.rawPrompt = prompt.prompt_content || '';

  const { variables, mapping } = parseVariables(prompt.prompt_content || '');
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
    const formHtml = variables.map(variable => `
      <div class="form-group">
        <label>${escapeHtml(variable.name)}</label>
        <input type="text" class="variable-input" data-var="${escapeHtml(variable.name)}" placeholder="Enter ${escapeHtml(variable.name)}">
      </div>
    `).join('');

    modalBody.innerHTML = `
      ${formHtml}
      <button class="btn-primary" id="generatePromptBtn">Generate Prompt</button>
      <div class="form-group" style="margin-top: 12px;">
        <label>Prompt Preview</label>
        <div id="resolvedPreview" class="resolved-preview">${escapeHtml(initialResolved || 'Fill variables to generate a prompt.')}</div>
      </div>
    `;

    modal.dataset.resolvedPrompt = initialResolved || '';

    const generateButton = document.getElementById('generatePromptBtn');
    generateButton.addEventListener('click', () => {
      const inputs = Array.from(document.querySelectorAll('.variable-input'));
      const values = {};

      let hasEmpty = false;
      inputs.forEach(input => {
        const value = input.value.trim();
        const name = input.dataset.var;
        if (!value) {
          input.classList.add('error');
          hasEmpty = true;
        } else {
          input.classList.remove('error');
        }
        values[name] = value;
      });

      if (hasEmpty) {
        showToast('Please fill all variables.');
        return;
      }

      let resolved = prompt.prompt_content;
      for (const [name, rawSet] of mapping.entries()) {
        const value = values[name] || '';
        rawSet.forEach(raw => {
          const pattern = new RegExp(`\\{${escapeRegExp(raw)}\\}`, 'g');
          resolved = resolved.replace(pattern, value);
        });
        const normalizedPattern = new RegExp(`\\{${name}\\}`, 'g');
        resolved = resolved.replace(normalizedPattern, value);
      }

      modal.dataset.resolvedPrompt = resolved;
      const preview = document.getElementById('resolvedPreview');
      if (preview) {
        preview.textContent = resolved;
      }
    });
  }

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeUseModal() {
  const modal = document.getElementById('usePromptModal');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function openEditModal(prompt) {
  const modal = document.getElementById('editPromptModal');
  document.getElementById('editPromptId').value = prompt.id;
  document.getElementById('editPromptTitle').value = prompt.title;
  document.getElementById('editPromptContent').value = prompt.prompt_content;
  document.getElementById('editPromptTags').value = prompt.tags ? prompt.tags.join(', ') : '';
  document.getElementById('editPromptSourceUrl').value = prompt.source_url || '';
  
  const usageContext = prompt.usage_context || {};
  document.getElementById('editPromptBestUseCase').value = usageContext.best_use_case || '';
  document.getElementById('editPromptRecommendedModel').value = usageContext.recommended_model || '';
  document.getElementById('editPromptLimitations').value = usageContext.limitations || '';
  
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

function closeEditModal() {
  const modal = document.getElementById('editPromptModal');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
}

function attachEventListeners() {
  document.querySelectorAll('.btn-copy').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);

      if (!prompt) {
        return;
      }

      const { variables } = parseVariables(prompt.prompt_content || '');
      const isTemplate = prompt.is_template || variables.length > 0;

      if (isTemplate) {
        openUseModal(prompt);
        return;
      }

      try {
        await navigator.clipboard.writeText(prompt.prompt_content);
        e.target.textContent = '✓ Copied';
        e.target.classList.add('copied');

        setTimeout(() => {
          e.target.textContent = 'Copy';
          e.target.classList.remove('copied');
        }, 2000);
      } catch (err) {
        e.target.textContent = 'Failed';
        setTimeout(() => {
          e.target.textContent = 'Copy';
        }, 2000);
      }
    });
  });

  document.querySelectorAll('.btn-inject').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);

      if (!prompt) {
        return;
      }

      const { variables } = parseVariables(prompt.prompt_content || '');
      const isTemplate = prompt.is_template || variables.length > 0;
      if (isTemplate) {
        openUseModal(prompt);
        return;
      }

      const response = await injectPrompt(prompt.prompt_content);
      if (response.success) {
        showToast('Prompt injected.');
      } else {
        try {
          await navigator.clipboard.writeText(prompt.prompt_content);
          showToast('Injection failed. Copied to clipboard.');
        } catch (error) {
          showToast(response.message || 'Injection failed.');
        }
      }
    });
  });

  document.querySelectorAll('.btn-use').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);
      if (prompt) {
        openUseModal(prompt);
      }
    });
  });

  document.querySelectorAll('.btn-delete').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const confirmed = window.confirm('Delete this prompt?');
      if (!confirmed) {
        return;
      }
      const prompts = await loadPrompts();
      const updatedPrompts = prompts.filter(p => p.id !== promptId);

      await savePrompts(updatedPrompts);
      renderPrompts(updatedPrompts);
    });
  });

  document.querySelectorAll('.btn-edit').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);
      if (prompt) {
        openEditModal(prompt);
      }
    });
  });
}

async function searchPrompts(query) {
  const prompts = await loadPrompts();
  const tokens = tokenizeQuery(query);

  if (tokens.length === 0) {
    renderPrompts(prompts);
    return;
  }

  const filtered = prompts.filter(prompt => {
    const searchable = buildSearchableText(prompt);
    return tokens.every(token => searchable.includes(token));
  });

  renderPrompts(filtered);
}

document.addEventListener('DOMContentLoaded', async () => {
  const prompts = await loadPrompts();
  renderPrompts(prompts);

  const promptForm = document.getElementById('promptForm');
  const titleInput = document.getElementById('titleInput');
  const promptInput = document.getElementById('promptInput');
  const tagsInput = document.getElementById('tagsInput');
  const sourceUrlInput = document.getElementById('sourceUrlInput');
  const bestUseCaseInput = document.getElementById('bestUseCaseInput');
  const recommendedModelInput = document.getElementById('recommendedModelInput');
  const limitationsInput = document.getElementById('limitationsInput');
  const searchInput = document.getElementById('searchInput');
  const togglePromptFormBtn = document.getElementById('togglePromptFormBtn');
  const draftStatus = document.getElementById('draftStatus');
  const titleCharCount = document.getElementById('titleCharCount');
  const promptCharCount = document.getElementById('promptCharCount');

  document.getElementById('openDashboardBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  const TITLE_LIMIT = 80;
  const PROMPT_LIMIT = 1200;

  const setDraftStatus = (state, message) => {
    if (!draftStatus) {
      return;
    }
    draftStatus.dataset.state = state;
    draftStatus.textContent = message;
  };

  const updateCharCount = (input, label, limit) => {
    if (!label) {
      return;
    }
    const count = input.value.length;
    label.textContent = `${count}/${limit}`;
    label.classList.toggle('over-limit', count > limit);
  };

  const updateCharCounts = () => {
    updateCharCount(titleInput, titleCharCount, TITLE_LIMIT);
    updateCharCount(promptInput, promptCharCount, PROMPT_LIMIT);
  };

  const applyDraftToForm = (draft) => {
    if (!draft) {
      return;
    }

    titleInput.value = draft.title || '';
    promptInput.value = draft.promptContent || '';
    tagsInput.value = draft.tags || '';
    sourceUrlInput.value = draft.sourceUrl || '';
    bestUseCaseInput.value = draft.bestUseCase || '';
    recommendedModelInput.value = draft.recommendedModel || '';
    limitationsInput.value = draft.limitations || '';

    updateCharCounts();
  };

  const collectDraftFromForm = () => {
    const draft = {
      title: titleInput.value,
      promptContent: promptInput.value,
      tags: tagsInput.value,
      sourceUrl: sourceUrlInput.value,
      bestUseCase: bestUseCaseInput.value,
      recommendedModel: recommendedModelInput.value,
      limitations: limitationsInput.value
    };

    const hasValue = Object.values(draft).some((value) => value && value.trim());
    return hasValue ? draft : null;
  };

  let draftSaveTimer = null;
  const scheduleDraftSave = () => {
    if (draftSaveTimer) {
      clearTimeout(draftSaveTimer);
    }
    setDraftStatus('saving', 'Saving draft...');
    draftSaveTimer = setTimeout(() => {
      const draft = collectDraftFromForm();
      if (!draft) {
        clearPromptDraft();
        setDraftStatus('idle', 'Autosave on');
        return;
      }
      savePromptDraft(draft).then(() => {
        setDraftStatus('saved', `Draft saved · ${formatTime(Date.now())}`);
      });
    }, 250);
  };

  const promptDraft = await loadPromptDraft();
  if (promptDraft) {
    applyDraftToForm(promptDraft);
    setDraftStatus('restored', 'Draft restored');
  } else {
    setDraftStatus('idle', 'Autosave on');
  }

  document.getElementById('closeUseModal').addEventListener('click', closeUseModal);
  document.getElementById('usePromptModal').addEventListener('click', (e) => {
    if (e.target.id === 'usePromptModal') {
      closeUseModal();
    }
  });

  document.getElementById('useModalCopy').addEventListener('click', async () => {
    const modal = document.getElementById('usePromptModal');
    const resolvedPrompt = modal.dataset.resolvedPrompt || '';
    const rawPrompt = modal.dataset.rawPrompt || '';
    const promptToCopy = resolvedPrompt || rawPrompt;

    if (!promptToCopy) {
      showToast('No prompt content available to copy.');
      return;
    }

    try {
      await navigator.clipboard.writeText(promptToCopy);
      showToast('Prompt copied.');
    } catch (error) {
      showToast('Copy failed.');
    }
  });

  document.getElementById('useModalInject').addEventListener('click', async () => {
    const modal = document.getElementById('usePromptModal');
    const resolvedPrompt = modal.dataset.resolvedPrompt || '';
    if (!resolvedPrompt) {
      showToast('Generate a prompt first.');
      return;
    }

    const response = await injectPrompt(resolvedPrompt);
    if (response.success) {
      showToast('Prompt injected.');
    } else {
      try {
        await navigator.clipboard.writeText(resolvedPrompt);
        showToast('Injection failed. Copied to clipboard.');
      } catch (error) {
        showToast(response.message || 'Injection failed.');
      }
    }
  });

  document.getElementById('closeEditModal').addEventListener('click', closeEditModal);

  document.getElementById('cancelEditBtn').addEventListener('click', closeEditModal);

  document.getElementById('editPromptModal').addEventListener('click', (e) => {
    if (e.target.id === 'editPromptModal') {
      closeEditModal();
    }
  });

  document.getElementById('editPromptForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const promptId = document.getElementById('editPromptId').value;
    const title = document.getElementById('editPromptTitle').value.trim();
    const content = document.getElementById('editPromptContent').value.trim();
    const tagsString = document.getElementById('editPromptTags').value.trim();
    const sourceUrl = document.getElementById('editPromptSourceUrl').value.trim();
    const bestUseCase = document.getElementById('editPromptBestUseCase').value.trim();
    const recommendedModel = document.getElementById('editPromptRecommendedModel').value.trim();
    const limitations = document.getElementById('editPromptLimitations').value.trim();

    if (!title || !content) {
      showToast('Title and content are required.');
      return;
    }

    const tags = tagsString
      ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    const usageContext = (bestUseCase || recommendedModel || limitations)
      ? {
          best_use_case: bestUseCase,
          recommended_model: recommendedModel,
          limitations
        }
      : null;

    const { variables } = parseVariables(content);

    const prompts = await loadPrompts();
    const promptIndex = prompts.findIndex(p => p.id === promptId);

    if (promptIndex !== -1) {
      const previousPrompt = prompts[promptIndex];
      const shouldSnapshot = previousPrompt.prompt_content !== content;
      let versions = sanitizePromptVersions(previousPrompt.versions);

      if (shouldSnapshot) {
        const MAX_PROMPT_VERSIONS = 10;
        versions = [
          ...versions,
          {
            id: generateUUID(),
            content: previousPrompt.prompt_content,
            saved_at: Date.now()
          }
        ];
        
        if (versions.length > MAX_PROMPT_VERSIONS) {
          versions = versions.slice(-MAX_PROMPT_VERSIONS);
        }
      }

      prompts[promptIndex] = {
        ...previousPrompt,
        title,
        prompt_content: content,
        tags,
        source_url: sourceUrl || null,
        is_template: variables.length > 0,
        variables,
        versions,
        usage_context: usageContext,
        updated_at: Date.now()
      };

      await savePrompts(prompts);
      renderPrompts(prompts);
      closeEditModal();
      showToast('Prompt updated successfully.');
    }
  });

  togglePromptFormBtn.addEventListener('click', () => {
    const isCollapsed = promptForm.classList.contains('collapsed');
    if (isCollapsed) {
      promptForm.classList.remove('collapsed');
      togglePromptFormBtn.textContent = '-';
      togglePromptFormBtn.title = 'hide form';
      titleInput.focus();
    } else {
      promptForm.classList.add('collapsed');
      togglePromptFormBtn.textContent = '+';
      togglePromptFormBtn.title = 'make a new prompt';
    }
  });

  [
    titleInput,
    promptInput,
    tagsInput,
    sourceUrlInput,
    bestUseCaseInput,
    recommendedModelInput,
    limitationsInput
  ].forEach((input) => {
    input.addEventListener('input', () => {
      updateCharCounts();
      scheduleDraftSave();
    });
    input.addEventListener('change', scheduleDraftSave);
  });

  updateCharCounts();

  promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = titleInput.value.trim();
    const promptContent = promptInput.value.trim();
    const tagsString = tagsInput.value.trim();
    const sourceUrl = sourceUrlInput.value.trim();
    const bestUseCase = bestUseCaseInput.value.trim();
    const recommendedModel = recommendedModelInput.value.trim();
    const limitations = limitationsInput.value.trim();

    if (!title || !promptContent) {
      titleInput.classList.toggle('error', !title);
      promptInput.classList.toggle('error', !promptContent);
      return;
    }

    titleInput.classList.remove('error');
    promptInput.classList.remove('error');

    const tags = tagsString
      ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];

    const { variables } = parseVariables(promptContent);
    const usageContext = (bestUseCase || recommendedModel || limitations)
      ? {
          best_use_case: bestUseCase,
          recommended_model: recommendedModel,
          limitations
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
      updated_at: Date.now()
    };

    const existingPrompts = await loadPrompts();
    existingPrompts.push(newPrompt);
    await savePrompts(existingPrompts);

    titleInput.value = '';
    promptInput.value = '';
    tagsInput.value = '';
    sourceUrlInput.value = '';
    bestUseCaseInput.value = '';
    recommendedModelInput.value = '';
    limitationsInput.value = '';

    await clearPromptDraft();
    setDraftStatus('idle', 'Autosave on');
    updateCharCounts();

    renderPrompts(existingPrompts);

    promptForm.classList.add('collapsed');
    togglePromptFormBtn.textContent = '+';
    togglePromptFormBtn.title = 'make a new prompt';
  });

  searchInput.addEventListener('input', (e) => {
    searchPrompts(e.target.value);
  });
});
