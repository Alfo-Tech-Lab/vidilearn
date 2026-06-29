import fs from 'fs';
import path from 'path';
import os from 'os';

const PLUGINS_DIR_LOCAL = path.join(process.cwd(), 'plugins');
const PLUGINS_DIR_GLOBAL = path.join(os.homedir(), '.vidilearn', 'plugins');

class PluginLoader {
  constructor() {
    this.drivers = [];
  }

  async loadPlugins() {
    await this.scanDir(PLUGINS_DIR_LOCAL);
    await this.scanDir(PLUGINS_DIR_GLOBAL);
  }

  async scanDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const fullPath = path.join(dirPath, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        const indexPath = path.join(fullPath, 'index.js');
        if (fs.existsSync(indexPath)) {
          try {
            // Import the plugin driver dynamically
            const module = await import(`file://${indexPath}`);
            if (module.default && module.default.name && typeof module.default.extract === 'function') {
              console.log(`[Plugin System] Loaded driver: "${module.default.name}"`);
              this.drivers.push(module.default);
            }
          } catch (err) {
            console.error(`[Plugin System] Failed to load plugin from ${indexPath}:`, err.message);
          }
        }
      }
    }
  }

  // Check if a plugin supports a target URL/extension
  getDriverForTarget(target) {
    for (const driver of this.drivers) {
      if (driver.supportedPrefixes && Array.isArray(driver.supportedPrefixes)) {
        if (driver.supportedPrefixes.some(prefix => target.startsWith(prefix))) {
          return driver;
        }
      }
      if (driver.supportedExtensions && Array.isArray(driver.supportedExtensions)) {
        if (driver.supportedExtensions.some(ext => target.endsWith(ext))) {
          return driver;
        }
      }
    }
    return null;
  }
}

export const pluginLoader = new PluginLoader();
// Automatically scan and load when file is imported
await pluginLoader.loadPlugins();
