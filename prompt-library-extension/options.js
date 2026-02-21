let selectedPrompts = new Set();

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
  const variables = parseVariables(promptContent);

  return {
    id: sanitizeText(rawPrompt.id) || generateUUID(),
    title,
    prompt_content: promptContent,
    tags: sanitizeTags(rawPrompt.tags),
    source_url: sanitizeNullableText(rawPrompt.source_url),
    is_template: variables.length > 0,
    variables,
    usage_context: sanitizeUsageContext(rawPrompt.usage_context),
    created_at: createdAt,
    updated_at: updatedAt
  };
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
  const names = new Set();
  let match;

  while ((match = regex.exec(promptContent)) !== null) {
    const normalized = normalizeVariableName(match[1]);
    if (!normalized || names.has(normalized)) {
      continue;
    }
    names.add(normalized);
    variables.push({
      name: normalized,
      description: '',
      default_value: ''
    });
  }

  return variables;
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

function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function showNotification(message, duration = 3000) {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.classList.add('active');
  
  setTimeout(() => {
    notification.classList.remove('active');
  }, duration);
}

function updateStats(prompts) {
  const totalPrompts = prompts.length;
  const uniqueTags = new Set();
  let totalCharacters = 0;
  
  prompts.forEach(prompt => {
    totalCharacters += (prompt.prompt_content || '').length;
    if (prompt.tags) {
      prompt.tags.forEach(tag => uniqueTags.add(tag));
    }
  });
  
  document.getElementById('totalPrompts').textContent = totalPrompts;
  document.getElementById('totalTags').textContent = uniqueTags.size;
  document.getElementById('totalCharacters').textContent = totalCharacters.toLocaleString();
}

function renderTable(prompts) {
  const tableContainer = document.getElementById('tableContainer');
  
  if (prompts.length === 0) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <p>No prompts found. Create prompts using the extension popup.</p>
      </div>
    `;
    return;
  }
  
  const sortedPrompts = [...prompts].sort((a, b) => b.updated_at - a.updated_at);
  
  const tableHtml = `
    <table id="promptsTable">
      <thead>
        <tr>
          <th><input type="checkbox" id="selectAllCheckbox"></th>
          <th>Title</th>
          <th>Tags</th>
          <th>Content Preview</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${sortedPrompts.map(prompt => {
          const promptContent = prompt.prompt_content || '';
          const contentPreview = promptContent.substring(0, 100);
          const previewText = promptContent.length > 100 ? contentPreview + '...' : contentPreview;
          
          const tagsHtml = prompt.tags && prompt.tags.length > 0
            ? prompt.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')
            : '-';
          
          return `
            <tr data-id="${escapeHtml(prompt.id)}">
              <td><input type="checkbox" class="prompt-checkbox" data-id="${escapeHtml(prompt.id)}" ${selectedPrompts.has(prompt.id) ? 'checked' : ''}></td>
              <td><strong>${escapeHtml(prompt.title)}</strong></td>
              <td><div class="tags-cell">${tagsHtml}</div></td>
              <td>${escapeHtml(previewText)}</td>
              <td>${formatDate(prompt.created_at)}</td>
              <td>
                <button class="btn btn-primary action-btn edit-btn" data-id="${escapeHtml(prompt.id)}">Edit</button>
                <button class="btn btn-danger action-btn delete-btn" data-id="${escapeHtml(prompt.id)}">Delete</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  tableContainer.innerHTML = tableHtml;
  attachTableEventListeners();
}

function attachTableEventListeners() {
  document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.prompt-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = e.target.checked;
      if (e.target.checked) {
        selectedPrompts.add(checkbox.dataset.id);
      } else {
        selectedPrompts.delete(checkbox.dataset.id);
      }
    });
  });
  
  document.querySelectorAll('.prompt-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedPrompts.add(e.target.dataset.id);
      } else {
        selectedPrompts.delete(e.target.dataset.id);
      }
    });
  });
  
  document.querySelectorAll('.edit-btn').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);
      
      if (prompt) {
        openEditModal(prompt);
      }
    });
  });
  
  document.querySelectorAll('.delete-btn').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      
      if (confirm('Are you sure you want to delete this prompt?')) {
        const prompts = await loadPrompts();
        const updatedPrompts = prompts.filter(p => p.id !== promptId);
        await savePrompts(updatedPrompts);
        selectedPrompts.delete(promptId);
        
        updateStats(updatedPrompts);
        renderTable(updatedPrompts);
        showNotification('Prompt deleted successfully');
      }
    });
  });
}

function openEditModal(prompt) {
  const modal = document.getElementById('editModal');
  document.getElementById('editId').value = prompt.id;
  document.getElementById('editTitle').value = prompt.title;
  document.getElementById('editContent').value = prompt.prompt_content;
  document.getElementById('editTags').value = prompt.tags ? prompt.tags.join(', ') : '';
  document.getElementById('editSourceUrl').value = prompt.source_url || '';
  const usageContext = prompt.usage_context || {};
  document.getElementById('editBestUseCase').value = usageContext.best_use_case || '';
  document.getElementById('editRecommendedModel').value = usageContext.recommended_model || '';
  document.getElementById('editLimitations').value = usageContext.limitations || '';
  
  modal.classList.add('active');
}

function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal.classList.remove('active');
}

async function exportPrompts() {
  const prompts = await loadPrompts();
  const dataStr = JSON.stringify(prompts, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `prompt-library-export-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  showNotification('Prompts exported successfully');
}

async function importPrompts(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const importedPrompts = JSON.parse(e.target.result);
        
        if (!Array.isArray(importedPrompts)) {
          reject(new Error('Invalid file format: expected an array of prompts'));
          return;
        }
        
        const existingPrompts = await loadPrompts();
        const existingIds = new Set(existingPrompts.map(p => p.id));
        const validImportedPrompts = importedPrompts
          .map(normalizePrompt)
          .filter((prompt) => Boolean(prompt));
        const dedupedImportedPrompts = [];
        const importedIds = new Set();

        validImportedPrompts.forEach((prompt) => {
          if (importedIds.has(prompt.id)) {
            return;
          }
          importedIds.add(prompt.id);
          dedupedImportedPrompts.push(prompt);
        });

        const newPrompts = dedupedImportedPrompts.filter(p => !existingIds.has(p.id));
        const mergedPrompts = [...existingPrompts, ...newPrompts];
        
        await savePrompts(mergedPrompts);
        resolve(newPrompts.length);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const prompts = await loadPrompts();
  updateStats(prompts);
  renderTable(prompts);
  
  document.getElementById('exportBtn').addEventListener('click', exportPrompts);
  
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.prompt-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedPrompts.add(checkbox.dataset.id);
    });
    document.getElementById('selectAllCheckbox').checked = true;
  });
  
  document.getElementById('deselectAllBtn').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('.prompt-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    selectedPrompts.clear();
    document.getElementById('selectAllCheckbox').checked = false;
  });
  
  document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
    if (selectedPrompts.size === 0) {
      showNotification('No prompts selected', 2000);
      return;
    }
    
    if (confirm(`Are you sure you want to delete ${selectedPrompts.size} selected prompt(s)?`)) {
      const prompts = await loadPrompts();
      const updatedPrompts = prompts.filter(p => !selectedPrompts.has(p.id));
      await savePrompts(updatedPrompts);
      selectedPrompts.clear();
      
      updateStats(updatedPrompts);
      renderTable(updatedPrompts);
      showNotification(`${prompts.length - updatedPrompts.length} prompt(s) deleted successfully`);
    }
  });
  
  document.getElementById('importBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
      showNotification('Please select a file to import', 2000);
      return;
    }
    
    try {
      const importedCount = await importPrompts(file);
      const prompts = await loadPrompts();
      
      updateStats(prompts);
      renderTable(prompts);
      showNotification(`Successfully imported ${importedCount} new prompt(s)`);
      fileInput.value = '';
    } catch (error) {
      showNotification('Error importing prompts: ' + error.message, 4000);
    }
  });
  
  document.getElementById('closeModal').addEventListener('click', closeEditModal);
  
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
  
  document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const promptId = document.getElementById('editId').value;
    const title = document.getElementById('editTitle').value.trim();
    const content = document.getElementById('editContent').value.trim();
    const tagsString = document.getElementById('editTags').value.trim();
    const sourceUrl = document.getElementById('editSourceUrl').value.trim();
    const bestUseCase = document.getElementById('editBestUseCase').value.trim();
    const recommendedModel = document.getElementById('editRecommendedModel').value.trim();
    const limitations = document.getElementById('editLimitations').value.trim();
    
    if (!title || !content) {
      document.getElementById('editTitle').classList.toggle('error', !title);
      document.getElementById('editContent').classList.toggle('error', !content);
      return;
    }
    
    document.getElementById('editTitle').classList.remove('error');
    document.getElementById('editContent').classList.remove('error');
    
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

    const variables = parseVariables(content);
    
    const prompts = await loadPrompts();
    const promptIndex = prompts.findIndex(p => p.id === promptId);
    
    if (promptIndex !== -1) {
      prompts[promptIndex] = {
        ...prompts[promptIndex],
        title,
        prompt_content: content,
        tags,
        source_url: sourceUrl || null,
        is_template: variables.length > 0,
        variables,
        usage_context: usageContext,
        updated_at: Date.now()
      };
      
      await savePrompts(prompts);
      
      updateStats(prompts);
      renderTable(prompts);
      closeEditModal();
      showNotification('Prompt updated successfully');
    }
  });
});
