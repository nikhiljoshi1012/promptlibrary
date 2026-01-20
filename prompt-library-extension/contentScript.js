function isEditableElement(element) {
  if (!element) {
    return false;
  }

  const tagName = element.tagName ? element.tagName.toLowerCase() : '';
  const isInput = tagName === 'input' && (element.type === 'text' || element.type === 'search' || element.type === 'url' || element.type === 'email' || element.type === 'tel' || element.type === 'password');
  const isTextArea = tagName === 'textarea';
  const isContentEditable = element.isContentEditable === true;

  if (isInput || isTextArea || isContentEditable) {
    if (element.disabled || element.readOnly) {
      return false;
    }
    return true;
  }

  return false;
}

function insertTextIntoElement(element, text) {
  const tagName = element.tagName ? element.tagName.toLowerCase() : '';

  if (tagName === 'textarea' || tagName === 'input') {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const value = element.value;

    element.value = value.slice(0, start) + text + value.slice(end);
    const cursor = start + text.length;
    element.setSelectionRange(cursor, cursor);

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (element.isContentEditable) {
    element.focus();
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : document.createRange();
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'INJECT_PROMPT') {
    return;
  }

  const activeElement = document.activeElement;
  if (!isEditableElement(activeElement)) {
    sendResponse({ success: false, message: 'No editable input focused.' });
    return;
  }

  const inserted = insertTextIntoElement(activeElement, message.text || '');
  if (inserted) {
    sendResponse({ success: true });
  } else {
    sendResponse({ success: false, message: 'Failed to insert text.' });
  }

  return true;
});
