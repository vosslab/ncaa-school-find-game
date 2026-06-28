// dom_utils.ts - shared DOM element lookup helpers

//============================================
// Get DOM element by ID or throw error with the id name
export function getElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) {
    throw new Error(`DOM element not found: ${id}`);
  }
  return el;
}

//============================================
// Optional element lookup - returns null if not found
export function findElement(id: string): HTMLElement | null {
  return document.getElementById(id);
}
