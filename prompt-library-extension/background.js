chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'saveAsPrompt',
    title: 'Save as Prompt',
    contexts: ['selection']
  });
  
  chrome.storage.local.get(['prompts'], (result) => {
    if (!result.prompts) {
      chrome.storage.local.set({ prompts: [] });
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
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
        usage_context: null,
        created_at: Date.now(),
        updated_at: Date.now()
      };
      
      prompts.push(newPrompt);
      
      chrome.storage.local.set({ prompts });
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
