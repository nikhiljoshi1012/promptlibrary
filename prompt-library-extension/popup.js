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
    
    const contentPreview = prompt.prompt_content.length > 200
      ? prompt.prompt_content.substring(0, 200) + '...'
      : prompt.prompt_content;
    
    return `
      <div class="prompt-item" data-id="${escapeHtml(prompt.id)}">
        <div class="prompt-header">
          <div class="prompt-title">${escapeHtml(prompt.title)}</div>
          <div class="prompt-actions">
            <button class="btn-copy" data-id="${escapeHtml(prompt.id)}">Copy</button>
            <button class="btn-delete" data-id="${escapeHtml(prompt.id)}">Delete</button>
          </div>
        </div>
        ${tagsHtml}
        <div class="prompt-content">${escapeHtml(contentPreview)}</div>
        <div class="prompt-meta">Created: ${formatDate(prompt.created_at)}</div>
        ${sourceHtml}
      </div>
    `;
  }).join('');
  
  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll('.btn-copy').forEach(button => {
    button.addEventListener('click', async (e) => {
      const promptId = e.target.dataset.id;
      const prompts = await loadPrompts();
      const prompt = prompts.find(p => p.id === promptId);
      
      if (prompt) {
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
  
  if (!query.trim()) {
    renderPrompts(prompts);
    return;
  }
  
  const lowerQuery = query.toLowerCase();
  const filtered = prompts.filter(prompt => {
    return prompt.title.toLowerCase().includes(lowerQuery) ||
           prompt.prompt_content.toLowerCase().includes(lowerQuery) ||
           (prompt.tags && prompt.tags.some(tag => tag.toLowerCase().includes(lowerQuery)));
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
  const searchInput = document.getElementById('searchInput');
  
  promptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = titleInput.value.trim();
    const promptContent = promptInput.value.trim();
    const tagsString = tagsInput.value.trim();
    const sourceUrl = sourceUrlInput.value.trim();
    
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
    
    const newPrompt = {
      id: generateUUID(),
      title,
      prompt_content: promptContent,
      tags,
      source_url: sourceUrl || null,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    const prompts = await loadPrompts();
    prompts.push(newPrompt);
    await savePrompts(prompts);
    
    titleInput.value = '';
    promptInput.value = '';
    tagsInput.value = '';
    sourceUrlInput.value = '';
    
    renderPrompts(prompts);
  });
  
  searchInput.addEventListener('input', (e) => {
    searchPrompts(e.target.value);
  });
});
