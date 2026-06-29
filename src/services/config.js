import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const CONFIG_DIR = path.join(os.homedir(), '.vidilearn');
const CONFIG_JSON_PATH = path.join(CONFIG_DIR, 'config.json');
const CONFIG_YAML_PATH = path.join(CONFIG_DIR, 'config.yaml');

const DEFAULTS = {
  embedding: {
    provider: 'transformers', // 'transformers' or 'ollama'
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384
  },
  chunking: {
    size: 500,
    overlap: 100,
    mode: 'sentence'
  },
  search: {
    limit: 5,
    semanticWeight: 0.7,
    keywordWeight: 0.3
  },
  ollama: {
    host: 'http://127.0.0.1:11434',
    model: 'qwen2.5'
  }
};

class ConfigService {
  constructor() {
    this.config = { ...DEFAULTS };
    this.load();
  }

  load() {
    // 1. Try loading YAML config
    if (fs.existsSync(CONFIG_YAML_PATH)) {
      try {
        const fileContent = fs.readFileSync(CONFIG_YAML_PATH, 'utf8');
        const parsed = yaml.load(fileContent);
        this.config = this.deepMerge(this.config, parsed);
        return;
      } catch (err) {
        console.warn("Failed to parse config.yaml, trying JSON:", err.message);
      }
    }

    // 2. Fallback to JSON config
    if (fs.existsSync(CONFIG_JSON_PATH)) {
      try {
        const fileContent = fs.readFileSync(CONFIG_JSON_PATH, 'utf8');
        const parsed = JSON.parse(fileContent);
        this.config = this.deepMerge(this.config, parsed);
      } catch (err) {
        console.warn("Failed to parse config.json, using defaults:", err.message);
      }
    } else {
      this.save(); // Save defaults as config.json
    }
  }

  save() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_JSON_PATH, JSON.stringify(this.config, null, 2));
    // Also save config.yaml for easy reference
    fs.writeFileSync(CONFIG_YAML_PATH, yaml.dump(this.config));
  }

  deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target) {
        Object.assign(source[key], this.deepMerge(target[key], source[key]));
      }
    }
    Object.assign(target || {}, source);
    return target;
  }

  get(keyPath) {
    const keys = keyPath.split('.');
    let value = this.config;
    for (const key of keys) {
      if (value && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    return value;
  }

  set(keyPath, value) {
    const keys = keyPath.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in obj)) {
        obj[key] = {};
      }
      obj = obj[key];
    }
    obj[keys[keys.length - 1]] = value;
    this.save();
  }
}

export const configService = new ConfigService();
