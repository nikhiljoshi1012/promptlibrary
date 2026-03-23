// Initialize context menus on install and startup
chrome.runtime.onInstalled.addListener(() => {
  initializeContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  initializeContextMenus();
});

// Initialize all context menus
function initializeContextMenus() {
  // Create "Save as Prompt" menu for selected text
  chrome.contextMenus.create({
    id: 'saveAsPrompt',
    title: 'Save as Prompt',
    contexts: ['selection']
  }, () => {
    if (chrome.runtime.lastError) {
      console.log('Context menu already exists or error:', chrome.runtime.lastError.message);
    }
  });
  
  // Build "Inject Prompt" menu
  chrome.storage.local.get(['prompts'], (result) => {
    if (!result.prompts) {
      chrome.storage.local.set({ prompts: [] });
    }
    buildPromptContextMenu(result.prompts || []);
  });
}

// Rebuild context menu when prompts change
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.prompts) {
    buildPromptContextMenu(changes.prompts.newValue || []);
  }
});

function buildPromptContextMenu(prompts) {
  // Remove and recreate to avoid duplicates
  chrome.contextMenus.remove('promptLibraryParent', () => {
    // Ignore error if doesn't exist
    const lastError = chrome.runtime.lastError;
    
    // Always create parent menu
    chrome.contextMenus.create({
      id: 'promptLibraryParent',
      title: '📋 Inject Prompt',
      contexts: ['editable']
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating Inject Prompt menu:', chrome.runtime.lastError.message);
        return;
      }

      if (!prompts || prompts.length === 0) {
        // Show message when no prompts exist
        chrome.contextMenus.create({
          id: 'promptLibraryEmpty',
          parentId: 'promptLibraryParent',
          title: '(No prompts saved yet)',
          contexts: ['editable'],
          enabled: false
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error creating empty menu item:', chrome.runtime.lastError.message);
          }
        });
        return;
      }

      // Sort by most recently updated and limit to 10 items
      const sortedPrompts = [...prompts]
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, 10);

      // Add each prompt as a submenu item
      sortedPrompts.forEach((prompt, index) => {
        const title = prompt.title.length > 50 
          ? prompt.title.substring(0, 47) + '...' 
          : prompt.title;
        
        chrome.contextMenus.create({
          id: `inject_prompt_${prompt.id}`,
          parentId: 'promptLibraryParent',
          title: title,
          contexts: ['editable']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error(`Error creating menu for prompt ${prompt.id}:`, chrome.runtime.lastError.message);
          }
        });
      });

      // Add "More..." option to open popup/options
      if (prompts.length > 10) {
        chrome.contextMenus.create({
          id: 'promptLibraryMore',
          parentId: 'promptLibraryParent',
          title: `--- More prompts (${prompts.length - 10}) ---`,
          contexts: ['editable']
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error creating More menu item:', chrome.runtime.lastError.message);
          }
        });
      }
    });
  });
}

async function injectPromptIntoPage(tabId, promptText) {
  try {
    // Inject content script first
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.js']
    });

    // Send message to inject the prompt
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'INJECT_PROMPT',
      text: promptText
    });

    return response;
  } catch (error) {
    console.error('Injection failed:', error);
    return { success: false, message: error.message };
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'saveAsPrompt' && info.selectionText) {
    chrome.storage.local.get(['prompts'], (result) => {
      const prompts = result.prompts || [];
      
      const newPrompt = {
        id: generateUUID(),
        title: 'Saved from Web',
        prompt_content: info.selectionText,
        tags: [],
        source_url: tab.url || null,
        is_template: false,
        variables: [],
        versions: [],
        usage_context: null,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      
      prompts.push(newPrompt);
      
      chrome.storage.local.set({ prompts });
    });
  } else if (info.menuItemId.startsWith('inject_prompt_')) {
    const promptId = info.menuItemId.replace('inject_prompt_', '');
    
    chrome.storage.local.get(['prompts'], async (result) => {
      const prompts = result.prompts || [];
      const prompt = prompts.find(p => p.id === promptId);
      
      if (prompt && tab.id) {
        await injectPromptIntoPage(tab.id, prompt.prompt_content);
      }
    });
  } else if (info.menuItemId === 'promptLibraryMore') {
    // Open extension popup or options page
    chrome.action.openPopup().catch(() => {
      chrome.runtime.openOptionsPage();
    });
  }
});

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
