function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
      resolve(result.prompts || []);
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

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
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

    const { variables } = parseVariables(prompt.prompt_content || '');
    const isTemplate = prompt.is_template || variables.length > 0;
    const templateBadge = isTemplate ? `<span class="prompt-badge">Template</span>` : '';

    const contentPreview = prompt.prompt_content.length > 200
      ? prompt.prompt_content.substring(0, 200) + '...'
      : prompt.prompt_content;

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
            <button class="btn-use" data-id="${escapeHtml(prompt.id)}">Use</button>
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
      const prompts = await loadPrompts();
      const updatedPrompts = prompts.filter(p => p.id !== promptId);

      await savePrompts(updatedPrompts);
      renderPrompts(updatedPrompts);
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

  document.getElementById('closeUseModal').addEventListener('click', closeUseModal);
  document.getElementById('usePromptModal').addEventListener('click', (e) => {
    if (e.target.id === 'usePromptModal') {
      closeUseModal();
    }
  });

  document.getElementById('useModalCopy').addEventListener('click', async () => {
    const modal = document.getElementById('usePromptModal');
    const resolvedPrompt = modal.dataset.resolvedPrompt || '';
    if (!resolvedPrompt) {
      showToast('Generate a prompt first.');
      return;
    }

    try {
      await navigator.clipboard.writeText(resolvedPrompt);
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

    renderPrompts(existingPrompts);
  });

  searchInput.addEventListener('input', (e) => {
    searchPrompts(e.target.value);
  });
});
