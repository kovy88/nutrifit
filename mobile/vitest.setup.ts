/// <reference types="vitest/globals" />

// Node prostředí nemá `__DEV__` global, který RN injektuje. Vitest si ho
// nastaví na true; produkční build to nezasáhne.
(globalThis as any).__DEV__ = true;
