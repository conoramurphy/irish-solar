import '@testing-library/jest-dom/vitest';

// Vitest is configured without globals, so Testing Library's auto-cleanup (which relies
// on a global afterEach) won't run unless we wire it up explicitly.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
