let selectedPrompts = new Set();

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
    totalCharacters += prompt.prompt_content.length;
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
          const contentPreview = prompt.prompt_content.substring(0, 100);
          const previewText = prompt.prompt_content.length > 100 ? contentPreview + '...' : contentPreview;
          
          const tagsHtml = prompt.tags && prompt.tags.length > 0
            ? prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('')
            : '-';
          
          return `
            <tr data-id="${prompt.id}">
              <td><input type="checkbox" class="prompt-checkbox" data-id="${prompt.id}" ${selectedPrompts.has(prompt.id) ? 'checked' : ''}></td>
              <td><strong>${prompt.title}</strong></td>
              <td><div class="tags-cell">${tagsHtml}</div></td>
              <td>${previewText}</td>
              <td>${formatDate(prompt.created_at)}</td>
              <td>
                <button class="btn btn-primary action-btn edit-btn" data-id="${prompt.id}">Edit</button>
                <button class="btn btn-danger action-btn delete-btn" data-id="${prompt.id}">Delete</button>
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
        
        const newPrompts = importedPrompts.filter(p => !existingIds.has(p.id));
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
      alert('No prompts selected');
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
      alert('Please select a file to import');
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
      alert('Error importing prompts: ' + error.message);
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
    
    if (!title || !content) {
      alert('Title and content are required');
      return;
    }
    
    const tags = tagsString
      ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag)
      : [];
    
    const prompts = await loadPrompts();
    const promptIndex = prompts.findIndex(p => p.id === promptId);
    
    if (promptIndex !== -1) {
      prompts[promptIndex] = {
        ...prompts[promptIndex],
        title,
        prompt_content: content,
        tags,
        source_url: sourceUrl || null,
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
