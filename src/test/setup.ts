// Mock localStorage for jsdom environment
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: Object.keys(store).length
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

import '@testing-library/jest-dom/vitest';

// Vitest is configured without globals, so Testing Library's auto-cleanup (which relies
// on a global afterEach) won't run unless we wire it up explicitly.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
