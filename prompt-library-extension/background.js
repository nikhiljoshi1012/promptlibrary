importScripts('storage.js');

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
  dbLoadPrompts().then((prompts) => {
    buildPromptContextMenu(prompts || []);
  }).catch(console.error);
}

// Rebuild context menu when prompts change
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PROMPTS_UPDATED') {
    dbLoadPrompts().then(prompts => buildPromptContextMenu(prompts)).catch(console.error);
  }
});

function buildPromptContextMenu(prompts) {
  // Remove and recreate to avoid duplicates
  chrome.contextMenus.remove('promptLibraryParent', () => {
    const lastError = chrome.runtime.lastError;
    
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
        chrome.contextMenus.create({
          id: 'promptLibraryEmpty',
          parentId: 'promptLibraryParent',
          title: '(No prompts saved yet)',
          contexts: ['editable'],
          enabled: false
        });
        return;
      }

      const tagGroups = { 'Uncategorized': [] };
      prompts.forEach(prompt => {
        if (!prompt.tags || prompt.tags.length === 0) {
          tagGroups['Uncategorized'].push(prompt);
        } else {
          prompt.tags.forEach(tag => {
            if (!tagGroups[tag]) tagGroups[tag] = [];
            tagGroups[tag].push(prompt);
          });
        }
      });

      Object.keys(tagGroups).sort().forEach(tag => {
        const groupPrompts = tagGroups[tag];
        if (groupPrompts.length === 0) return;

        const tagSafe = tag.replace(/[^a-zA-Z0-9]/g, '_');
        const tagMenuId = `tag_${tagSafe}`;
        
        chrome.contextMenus.create({
          id: tagMenuId,
          parentId: 'promptLibraryParent',
          title: `📁 ${tag} (${groupPrompts.length})`,
          contexts: ['editable']
        });

        groupPrompts.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
          .slice(0, 15)
          .forEach((prompt) => {
            const title = prompt.title.length > 40 ? prompt.title.substring(0, 37) + '...' : prompt.title;
            chrome.contextMenus.create({
              id: `inject_prompt_${prompt.id}_${tagSafe}`,
              parentId: tagMenuId,
              title: title,
              contexts: ['editable']
            });
          });
          
        if (groupPrompts.length > 15) {
          chrome.contextMenus.create({
            id: `promptLibraryMore_${tagSafe}`,
            parentId: tagMenuId,
            title: `--- More (${groupPrompts.length - 15}) ---`,
            contexts: ['editable']
          });
        }
      });
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
    const title = generatePromptTitle(info.selectionText);
    
    let sourceTags = [];
    if (tab && tab.url) {
      try {
        const urlObj = new URL(tab.url);
        const hostname = urlObj.hostname.replace(/^www\./, '');
        if (hostname) {
          sourceTags.push(hostname);
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    }
    
    const newPrompt = {
      id: generateUUID(),
      title: title,
      prompt_content: info.selectionText,
      tags: sourceTags,
      source_url: tab.url || null,
      is_template: false,
      variables: [],
      versions: [],
      usage_context: null,
      created_at: Date.now(),
      updated_at: Date.now()
    };
    
    dbSavePrompt(newPrompt).catch(console.error);
  } else if (info.menuItemId.startsWith('inject_prompt_')) {
    const match = info.menuItemId.match(/inject_prompt_([a-f0-9\-]+)/);
    if (match) {
      const promptId = match[1];
      dbGetPrompt(promptId).then(async (prompt) => {
        if (prompt && tab.id) {
          await injectPromptIntoPage(tab.id, prompt.prompt_content);
        }
      }).catch(console.error);
    }
  } else if (info.menuItemId.startsWith('promptLibraryMore')) {
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

function generatePromptTitle(text) {
  if (!text || !text.trim()) return 'Saved from Web Prompt';

  const cleanText = text.trim();
  
  // 1. Try to extract an action phrase
  const actionRegex = /^(?:please\s+)?(?:can you\s+)?(?:could you\s+)?(write|create|generate|make|explain|summarize|translate|convert|refactor|debug|analyze|help|provide)\b/i;
  const actionMatch = cleanText.match(actionRegex);
  
  if (actionMatch) {
    const firstSentence = cleanText.split(/[.?!]/)[0].replace(/\s+/g, ' ').trim();
    const words = firstSentence.split(' ');
    const title = words.slice(0, 10).join(' ') + (words.length > 10 ? '...' : '');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  // 2. Simple NLP keyword extraction (TF-based)
  const stopWords = new Set(['a','an','and','are','as','at','be','by','for','from','has','he','in','is','it','its','of','on','that','the','to','was','were','will','with','i','you','my','your','we','our','they','their','this','that','these','those','what','which','who','whom','whose','when','where','why','how','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','can','will','just','should','now','please','could','would','do','does','did','am','been','being','have','had','having','doing']);
  
  const wordsForNlp = cleanText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  
  if (wordsForNlp.length > 0) {
    const freqs = {};
    wordsForNlp.forEach(w => freqs[w] = (freqs[w] || 0) + 1);
    
    const uniqueWords = [...new Set(wordsForNlp)];
    uniqueWords.sort((a, b) => {
      const freqDiff = freqs[b] - freqs[a];
      if (freqDiff !== 0) return freqDiff;
      return wordsForNlp.indexOf(a) - wordsForNlp.indexOf(b);
    });

    const topKeywords = uniqueWords.slice(0, 3);
    const capitalizedKeywords = topKeywords.map(w => w.charAt(0).toUpperCase() + w.slice(1));
    return capitalizedKeywords.join(' ') + ' Prompt';
  }

  // 3. Fallback: just use the first few words
  const words = cleanText.split(/\s+/);
  if (words.length > 0) {
    const title = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  return 'Saved from Web Prompt';
}
