# Privacy Policy for Prompt Library

Effective date: February 21, 2026

Prompt Library is a local-first browser extension. This policy explains what data the extension processes and how it is handled.

## Data We Process

The extension stores prompt data that you create or import, which can include:

- Prompt titles and content
- Tags
- Optional source URLs
- Optional template metadata
- Timestamps

All of this data is stored locally using the browser `storage` API.

## Data Collection and Sharing

- No personal data is sold.
- No analytics SDKs are used.
- No external APIs are called by the extension for prompt storage or processing.
- Prompt data is not transmitted to remote servers by the extension code in this repository.

## Permissions

- `storage`: Save and load your prompts locally.
- `clipboardWrite`: Copy prompt text when you click copy actions.
- `contextMenus`: Save selected text from a page to your prompt library.
- `activeTab`: Access the active tab only when user-triggered actions run.
- `scripting`: Inject the content script to insert prompt text into focused editable fields.

## Import and Export

When you export prompts, a JSON file is generated locally on your device.  
When you import prompts, the selected file is parsed locally in the extension.

## Data Retention and Deletion

Your data remains in browser local storage until you delete prompts, clear extension data, or uninstall the extension.

## Contact

For privacy questions, use the repository issue tracker where this extension is maintained.
