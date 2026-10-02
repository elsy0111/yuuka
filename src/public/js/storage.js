// Storage may be unavailable in embedded browsers or private browsing modes.
const fallback = new Map();
export const storage = {
  getItem(key) {
    try {
      return localStorage.getItem(key) ?? fallback.get(key) ?? null;
    } catch {
      return fallback.get(key) ?? null;
    }
  },
  setItem(key, value) {
    fallback.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Keep this tab usable. */
    }
  },
  removeItem(key) {
    fallback.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Nothing persisted. */
    }
  },
};
