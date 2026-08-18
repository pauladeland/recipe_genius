const DEFAULT_URL = 'data/library.json';

export function createStaticJsonSource(fetchImpl = fetch, url = DEFAULT_URL) {
  let cache = null;
  return {
    async loadPublic() {
      if (cache) return cache;
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Failed to load library data: ${res.status}`);
      cache = await res.json();
      return cache;
    },
    capabilities: { write: false, private: false },
  };
}
