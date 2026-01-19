# Testing Checklist for Prompt Library Chrome Extension

This document provides a comprehensive testing checklist to verify all features of the Prompt Library extension.

## Installation Testing

- [ ] Extension loads without errors in Chrome
- [ ] All icons display correctly
- [ ] Extension popup opens when clicking the toolbar icon
- [ ] Options page opens from extension menu

## Popup UI Testing

### Layout & Display
- [ ] Popup displays with correct width (500px)
- [ ] All sections are visible (Add Prompt, Search, Your Prompts)
- [ ] Form elements are properly styled
- [ ] Scrolling works for long prompt lists

### Form Validation
- [ ] Title field is required
- [ ] Prompt content field is required
- [ ] Tags field is optional
- [ ] Source URL field is optional
- [ ] Form doesn't submit with empty required fields

## Prompt Creation (Manual)

- [ ] Create prompt with title and content only
- [ ] Create prompt with all fields (title, content, tags, source URL)
- [ ] Tags are properly parsed from comma-separated string
- [ ] Prompt appears in the list immediately after creation
- [ ] Form clears after successful submission
- [ ] UUID is generated for new prompts
- [ ] Timestamps (created_at, updated_at) are set correctly

## Prompt Creation (Context Menu)

- [ ] Context menu item "Save as Prompt" appears when text is selected
- [ ] Context menu doesn't appear when no text is selected
- [ ] Selected text is saved as prompt content
- [ ] Title defaults to "Saved from Web"
- [ ] Source URL is set to current page URL
- [ ] Tags default to empty array
- [ ] Prompt is immediately available in popup

## Prompt Display

- [ ] Prompts are sorted by updated_at (newest first)
- [ ] Each prompt shows title, tags, content preview, and metadata
- [ ] Content preview is truncated at 200 characters with "..."
- [ ] Tags are displayed as styled pills
- [ ] Source URL is displayed when present
- [ ] Created date is formatted correctly
- [ ] Empty state shows when no prompts exist
- [ ] Prompt count updates correctly

## Search Functionality

- [ ] Search works for prompt titles
- [ ] Search works for prompt content
- [ ] Search works for tags
- [ ] Search is case-insensitive
- [ ] Results update instantly as user types
- [ ] Clearing search shows all prompts again
- [ ] Search with no results shows appropriate prompts

## Copy to Clipboard

- [ ] Copy button copies prompt content to clipboard
- [ ] Button shows "✓ Copied" feedback after copy
- [ ] Button returns to "Copy" after 2 seconds
- [ ] Only prompt content is copied (not title or tags)
- [ ] Copy works with special characters
- [ ] Copy works with multiline content

## Delete Prompt

- [ ] Delete button removes prompt from list
- [ ] Deletion is immediate (no page reload required)
- [ ] Storage is updated immediately
- [ ] Prompt count updates after deletion
- [ ] No confirmation dialog (as per requirements)

## Storage Persistence

- [ ] Prompts persist after closing popup
- [ ] Prompts persist after browser restart
- [ ] All prompt fields are preserved correctly
- [ ] Storage uses chrome.storage.local
- [ ] Data is stored under single "prompts" key

## Options Page Testing

### Statistics Display
- [ ] Total prompts count is correct
- [ ] Unique tags count is correct
- [ ] Total characters count is correct
- [ ] Statistics update when prompts change

### Prompt Table
- [ ] All prompts are listed in table
- [ ] Table shows checkbox, title, tags, preview, date, actions
- [ ] Content preview is truncated at 100 characters
- [ ] Tags are displayed with styling
- [ ] Table is sortable by updated_at (newest first)

### Selection Features
- [ ] Individual prompt checkboxes work
- [ ] "Select All" checkbox selects all prompts
- [ ] "Select All" button selects all prompts
- [ ] "Deselect All" button clears all selections
- [ ] Selection state is maintained when scrolling

### Edit Functionality
- [ ] Edit button opens modal with prompt data
- [ ] Modal displays all current prompt fields
- [ ] All fields are editable
- [ ] Save button updates prompt
- [ ] updated_at timestamp is updated
- [ ] Table refreshes after edit
- [ ] Close button (X) closes modal
- [ ] Clicking outside modal closes it

### Delete Functionality
- [ ] Delete button shows confirmation dialog
- [ ] Confirming deletes the prompt
- [ ] Canceling keeps the prompt
- [ ] Table updates after deletion
- [ ] Statistics update after deletion

### Bulk Delete
- [ ] Delete Selected button works with selected prompts
- [ ] Confirmation shows number of prompts to delete
- [ ] All selected prompts are deleted
- [ ] Unselected prompts are preserved
- [ ] Statistics and table update correctly

### Export Functionality
- [ ] Export button downloads JSON file
- [ ] Filename includes timestamp
- [ ] JSON is properly formatted
- [ ] All prompt fields are included
- [ ] File is valid JSON
- [ ] Success notification appears

### Import Functionality
- [ ] File input accepts .json files
- [ ] Import button requires file selection
- [ ] Valid JSON file imports successfully
- [ ] Duplicate prompts (same ID) are skipped
- [ ] New prompts are added to existing library
- [ ] Statistics and table update after import
- [ ] Success notification shows count of imported prompts
- [ ] Invalid JSON shows error message

### Notifications
- [ ] Success notifications appear after actions
- [ ] Notifications auto-dismiss after 3 seconds
- [ ] Notification animation works correctly

## Error Handling

- [ ] Invalid JSON import shows error
- [ ] Empty file import shows error
- [ ] Clipboard API errors are caught
- [ ] Storage errors are handled gracefully
- [ ] Missing permissions don't crash extension

## Data Model Compliance

- [ ] Prompts follow exact schema (id, title, prompt_content, tags, source_url, created_at, updated_at)
- [ ] ID is valid UUID format
- [ ] Title is string
- [ ] prompt_content is string
- [ ] tags is array of strings
- [ ] source_url is string or null
- [ ] created_at is timestamp in milliseconds
- [ ] updated_at is timestamp in milliseconds

## UI/UX Quality

- [ ] Consistent color scheme throughout
- [ ] Buttons have hover states
- [ ] Focus states are visible
- [ ] Typography is readable
- [ ] Spacing is consistent
- [ ] Icons are appropriate size
- [ ] No UI elements overlap
- [ ] Responsive within popup constraints

## Performance

- [ ] Popup loads quickly
- [ ] Search is instantaneous
- [ ] No lag with 50+ prompts
- [ ] Smooth scrolling in prompt list
- [ ] Options page handles 100+ prompts well

## Browser Compatibility

- [ ] Works in Chrome (latest)
- [ ] Works in Edge (latest)
- [ ] No console errors
- [ ] No manifest warnings

## Manifest V3 Compliance

- [ ] Uses service_worker for background
- [ ] All required permissions are declared
- [ ] No deprecated APIs used
- [ ] Proper icon sizes defined

## Edge Cases

- [ ] Very long prompt content (10,000+ characters)
- [ ] Prompt with no tags
- [ ] Prompt with many tags (20+)
- [ ] Special characters in all fields
- [ ] Unicode characters (emoji, etc.)
- [ ] URL with special characters
- [ ] Empty search query
- [ ] Rapid consecutive actions
- [ ] Multiple tabs using extension simultaneously

## Final Verification

- [ ] No TODO comments in code
- [ ] No placeholder text in code
- [ ] No console.log in production code (except background.js)
- [ ] All features from requirements implemented
- [ ] No external dependencies
- [ ] No frameworks used
- [ ] Code is clean and modular
- [ ] Extension description is accurate

---

## Test Results Summary

Date: _______________
Tester: _______________
Chrome Version: _______________

Total Tests: _______________
Passed: _______________
Failed: _______________
Not Applicable: _______________

Critical Issues Found: _______________

Notes:
_______________________________________________
_______________________________________________
_______________________________________________
