# Plugin System Specification

Vidilearn supports third-party plugins to expand its universal ingestion capabilities to other media networks.

---

## 1. Directory Structure

Plugins are loaded automatically from the `/plugins` directory inside the workspace or the default configurations folder:

```
~/.vidilearn/plugins/
  ├── twitter/
  │    ├── index.js
  │    └── package.json
  └── telegram/
       ├── index.js
       └── package.json
```

---

## 2. Ingest Driver Contract

Every plugin must export an object conforming to the custom ingestion driver interface:

```javascript
export default {
  name: "twitter-exporter",
  supportedExtensions: [".json"],
  supportedPrefixes: ["https://twitter.com/", "https://x.com/"],
  
  async extract(url, options = {}) {
    // 1. Fetch thread or file content
    // 2. Parse text content
    // 3. Return standardized schema
    return {
      sourceType: "twitter",
      title: "Twitter Thread Title",
      url: url,
      author: "@username",
      transcript: "Consolidated thread text...",
      extractedAt: new Date().toISOString()
    };
  }
};
```
