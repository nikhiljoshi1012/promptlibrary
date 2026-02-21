# Prompt Library - Chrome Extension

A Chrome Extension (Manifest V3) that allows users to save, organize, search, and copy AI prompts with ease.

## Features

- ✅ **Save AI Prompts**: Create prompts with titles, content, tags, and source URLs
- ✅ **Context Menu Integration**: Right-click to save selected text as a prompt
- ✅ **Instant Search**: Search prompts by title, content, or tags
- ✅ **One-Click Copy**: Copy prompts to clipboard instantly
- ✅ **Advanced Management**: Edit, export, import, and bulk delete prompts
- ✅ **Offline-First**: All data stored locally using Chrome Storage API
- ✅ **Privacy-Preserving**: No external APIs or data transmission

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right corner)
3. Click "Load unpacked"
4. Select the `prompt-library-extension` folder
5. The extension is now installed and ready to use!

## Usage

### Creating Prompts

**Method 1: Using the Popup**
1. Click the Prompt Library extension icon in your browser toolbar
2. Fill in the prompt details:
   - Title (required)
   - Prompt content (required)
   - Tags (optional, comma-separated)
   - Source URL (optional)
3. Click "Save Prompt"

**Method 2: Context Menu**
1. Select any text on a webpage
2. Right-click and choose "Save as Prompt"
3. The selected text will be saved automatically with:
   - Title: "Saved from Web"
   - Content: Selected text
   - Source URL: Current page URL

### Searching Prompts

1. Open the extension popup
2. Use the search bar to find prompts by title, content, or tags
3. Results update instantly as you type

### Copying Prompts

1. Find your prompt in the list
2. Click the "Copy" button
3. The prompt content is now in your clipboard

### Deleting Prompts

1. Find the prompt you want to remove
2. Click the "Delete" button
3. The prompt is removed immediately

### Advanced Management

1. Right-click the extension icon and select "Options"
2. View statistics about your prompt library
3. Edit existing prompts
4. Export all prompts as JSON for backup
5. Import prompts from a JSON file
6. Bulk select and delete multiple prompts

## File Structure

```
prompt-library-extension/
│
├── manifest.json          # Extension configuration
│
├── popup.html            # Main popup interface
├── popup.js              # Popup logic and CRUD operations
├── popup.css             # Popup styling
│
├── background.js         # Service worker for context menu
│
├── options.html          # Advanced management interface
├── options.js            # Options page logic
│
└── icons/
    ├── icon16.png       # 16x16 icon
    ├── icon48.png       # 48x48 icon
    └── icon128.png      # 128x128 icon
```

## Data Model

Each prompt follows this schema:

```json
{
  "id": "uuid",
  "title": "string",
  "prompt_content": "string",
  "tags": ["string"],
  "source_url": "string | null",
  "created_at": 1700000000000,
  "updated_at": 1700000000000
}
```

All prompts are stored in Chrome's local storage under a single key:

```javascript
chrome.storage.local.get(['prompts'], (result) => {
  const prompts = result.prompts || [];
});
```

## Technology Stack

- **Manifest Version**: V3
- **Storage**: Chrome Storage Local API
- **Clipboard**: Navigator Clipboard API
- **Context Menus**: Chrome Context Menus API
- **UI**: Vanilla JavaScript, HTML, CSS
- **No External Dependencies**: Pure JavaScript implementation

## Browser Compatibility

- Chrome (Manifest V3 required)
- Edge (Chromium-based)
- Other Chromium-based browsers supporting Manifest V3

## Privacy

- All data is stored locally on your device
- No data is transmitted to external servers
- No analytics or tracking
- No external API calls
- Full policy: see `PRIVACY_POLICY.md`

## Permission Justification

- `storage`: Persist prompts and draft content locally.
- `clipboardWrite`: Copy prompts to clipboard from popup actions.
- `contextMenus`: Add "Save as Prompt" on selected text.
- `activeTab`: Target the currently active tab for prompt injection.
- `scripting`: Inject `contentScript.js` when user requests prompt injection.

## Development

The extension is built with vanilla JavaScript and requires no build process.

To modify the extension:
1. Edit the source files
2. Reload the extension in `chrome://extensions/`
3. Test your changes

## License

MIT. See `LICENSE`.

## Support

For issues, questions, or feature requests, please open an issue in the repository.
