import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerTool, unregisterTool, getTool } from './registry.js';

export class PluginManager {
  constructor(options = {}) {
    const defaultPluginsDir = path.resolve(fileURLToPath(new URL('./plugins', import.meta.url)));
    this.pluginsDir = options.pluginsDir || defaultPluginsDir;
    this.plugins = new Map();
    this.toolHandlers = new Map();
    this.hooks = {
      preToolCall: [],
      postToolCall: [],
      agentStart: [],
      agentStop: [],
    };
  }

  async loadPlugin(pluginDirPath) {
    const resolvedPath = path.resolve(pluginDirPath);
    const manifestPath = path.join(resolvedPath, 'plugin.json');

    let manifestRaw;
    try {
      manifestRaw = await fs.readFile(manifestPath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read plugin manifest at ${manifestPath}: ${err.message}`);
    }

    let manifest;
    try {
      manifest = JSON.parse(manifestRaw);
    } catch (err) {
      throw new Error(`Invalid JSON in plugin manifest ${manifestPath}: ${err.message}`);
    }

    if (!manifest.name) {
      throw new Error(`Plugin manifest at ${manifestPath} missing 'name'`);
    }

    if (manifest.enabled === false) {
      return { skipped: true, name: manifest.name, reason: 'disabled' };
    }

    const mainFile = manifest.main || 'index.js';
    const entryPath = path.join(resolvedPath, mainFile);

    let pluginModule;
    try {
      const entryUrl = pathToFileURL(entryPath).href;
      pluginModule = await import(entryUrl);
    } catch (err) {
      throw new Error(`Failed to load plugin entrypoint ${entryPath}: ${err.message}`);
    }

    const instance = pluginModule.default || pluginModule;
    const registeredToolIds = [];

    // 1. Tool Registration
    let tools = [];
    if (typeof instance.registerTools === 'function') {
      tools = await instance.registerTools();
    } else if (Array.isArray(instance.tools)) {
      tools = instance.tools;
    }

    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (!t.id) continue;
        registerTool(t);
        registeredToolIds.push(t.id);
        if (typeof t.handler === 'function') {
          this.toolHandlers.set(t.id, t.handler);
        }
      }
    }

    // 2. Lifecycle Hooks Registration
    const hookNames = ['preToolCall', 'postToolCall', 'agentStart', 'agentStop'];
    for (const hookName of hookNames) {
      if (typeof instance[hookName] === 'function') {
        this.registerHook(hookName, instance[hookName].bind(instance), manifest.name);
      }
    }

    const pluginInfo = {
      name: manifest.name,
      version: manifest.version || '1.0.0',
      description: manifest.description || '',
      manifest,
      dir: resolvedPath,
      tools: registeredToolIds,
      module: instance,
      loadedAt: new Date().toISOString(),
    };

    this.plugins.set(manifest.name, pluginInfo);
    return pluginInfo;
  }

  async loadAllPlugins(dir = this.pluginsDir) {
    const resolvedDir = path.resolve(dir);
    let entries;
    try {
      entries = await fs.readdir(resolvedDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const loaded = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = path.join(resolvedDir, entry.name);
      const manifestPath = path.join(pluginDir, 'plugin.json');
      try {
        const stat = await fs.stat(manifestPath);
        if (stat.isFile()) {
          const info = await this.loadPlugin(pluginDir);
          if (info && !info.skipped) loaded.push(info);
        }
      } catch (err) {
        console.warn(`[plugins] Skipped ${entry.name}: ${err.message}`);
      }
    }
    return loaded;
  }

  registerHook(hookName, fn, pluginName = 'anonymous') {
    if (!this.hooks[hookName]) {
      throw new Error(`Unknown hook: ${hookName}. Must be one of: ${Object.keys(this.hooks).join(', ')}`);
    }
    const hookObj = { fn, pluginName };
    this.hooks[hookName].push(hookObj);
    return () => {
      const idx = this.hooks[hookName].indexOf(hookObj);
      if (idx >= 0) this.hooks[hookName].splice(idx, 1);
    };
  }

  async triggerHook(hookName, context = {}) {
    if (!this.hooks[hookName]) return;
    for (const { fn, pluginName } of this.hooks[hookName]) {
      try {
        await fn(context);
      } catch (err) {
        throw Object.assign(err, { hook: hookName, plugin: pluginName });
      }
    }
  }

  registerTool(toolDef, handler) {
    registerTool(toolDef);
    if (typeof handler === 'function') {
      this.toolHandlers.set(toolDef.id, handler);
    }
  }

  hasToolHandler(toolId) {
    return this.toolHandlers.has(toolId);
  }

  getToolHandler(toolId) {
    return this.toolHandlers.get(toolId);
  }

  getLoadedPlugins() {
    return Array.from(this.plugins.values()).map(({ name, version, description, tools, loadedAt }) => ({
      name, version, description, tools, loadedAt
    }));
  }

  unloadPlugin(name) {
    const plugin = this.plugins.get(name);
    if (!plugin) return false;

    for (const toolId of plugin.tools) {
      unregisterTool(toolId);
      this.toolHandlers.delete(toolId);
    }

    for (const hookName of Object.keys(this.hooks)) {
      this.hooks[hookName] = this.hooks[hookName].filter((h) => h.pluginName !== name);
    }

    this.plugins.delete(name);
    return true;
  }
}

export const pluginManager = new PluginManager();
export default pluginManager;
