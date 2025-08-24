# Modal System Usage Guide

## Overview

The custom modal system has replaced SweetAlert2 and now uses Lucide React icons for better consistency with the rest of the application.

## Available Modal Types

### 1. Confirmation Dialog

```typescript
import Swal from '@/components/modals/modal';

const result = await Swal.fire({
	title: 'Confirm Action',
	text: 'Are you sure you want to proceed?',
	icon: 'warning', // Options: 'warning', 'error', 'success', 'info', 'question'
	showCancelButton: true,
	confirmButtonText: 'Yes, proceed!',
	cancelButtonText: 'Cancel',
});

if (result.isConfirmed) {
	// User confirmed
}
```

### 2. Choice Dialog (Three Options)

```typescript
const result = await Swal.fire({
	title: 'Choose an Option',
	text: 'Select how you want to proceed',
	icon: 'question',
	showCancelButton: true,
	showDenyButton: true,
	confirmButtonText: 'Option 1',
	denyButtonText: 'Option 2',
	cancelButtonText: 'Cancel',
});

if (result.isConfirmed) {
	// Option 1 selected
} else if (result.isDenied) {
	// Option 2 selected
}
```

### 3. Input Dialog

```typescript
const result = await Swal.fire({
	title: 'Enter Value',
	input: 'text',
	inputPlaceholder: 'Enter your name',
	showCancelButton: true,
});

if (result.value) {
	const userInput = result.value;
	// Process the input
}
```

### 4. Custom HTML Dialog

```typescript
const result = await Swal.fire({
	title: 'Custom Content',
	html: `
    <div class="space-y-4">
      <p>This is custom HTML content</p>
      <ul class="list-disc pl-5">
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    </div>
  `,
	showCancelButton: true,
	preConfirm: async () => {
		// Optional: Perform validation or async operations
		return someValue;
	},
});

if (result.isConfirmed && result.value) {
	// Process the result
}
```

### 5. Loading Indicator

```typescript
// Show loading
Swal.showLoading();

// Perform async operation
await someAsyncOperation();

// Close the loading modal
Swal.close();
```

## Icon Types with Lucide React

The modal system now uses Lucide React icons instead of emojis:

- `warning`: AlertTriangle (yellow) - ⚠️ replaced with proper icon
- `error`: XCircle (red) - ❌ replaced with proper icon
- `success`: CheckCircle (green) - ✅ replaced with proper icon
- `info`: Info (blue) - ℹ️ replaced with proper icon
- `question`: HelpCircle (gray) - ❓ replaced with proper icon

## Using with swalConfig Helper Functions

For consistency, use the helper functions from `utils/swalConfig.ts`:

```typescript
import { showConfirmDialog, showChoiceDialog, showInputDialog } from '@/utils/swalConfig';

// Confirmation dialog
const confirmed = await showConfirmDialog({
	title: 'Delete Item',
	text: 'This action cannot be undone',
	icon: 'warning',
	confirmButtonText: 'Delete',
});

// Choice dialog
const choice = await showChoiceDialog({
	title: 'Select Action',
	text: 'What would you like to do?',
	confirmButtonText: 'Save',
	denyButtonText: 'Discard',
	cancelButtonText: 'Cancel',
});

// Input dialog
const input = await showInputDialog({
	title: 'Enter Name',
	inputPlaceholder: 'Type here...',
});
```

## Benefits of the New System

1. **Lucide React Icons**: Consistent icon library across the application
2. **No External Dependencies**: Removed SweetAlert2 dependency
3. **Full React Integration**: Native React components with proper lifecycle
4. **TypeScript Support**: Fully typed interfaces
5. **Customizable**: Easy to extend and modify
6. **Dark Theme**: Built-in support for the app's dark theme

## Migration from SweetAlert2

The API is largely compatible with SweetAlert2, so most code requires minimal changes:

- Import from `@/components/modals/modal` instead of `sweetalert2`
- Icons now render as proper React components instead of emojis
- All styling is handled through Tailwind CSS classes
