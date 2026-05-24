import { App, PluginSettingTab, Setting } from 'obsidian';
import type CollectorsPlugin from './main';

export class CollectorsSettingTab extends PluginSettingTab {
  plugin: CollectorsPlugin;

  constructor(app: App, plugin: CollectorsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Collectors Settings' });

    new Setting(containerEl)
      .setName('Collections folder')
      .setDesc(
        'Folder to scan for collection files. Leave empty to scan the entire vault. ' +
        'Example: "004 MTG"'
      )
      .addText(t =>
        t
          .setPlaceholder('e.g. 004 MTG')
          .setValue(this.plugin.settings.collectionsFolder)
          .onChange(async v => {
            this.plugin.settings.collectionsFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Auto-detect collections')
      .setDesc('Detect collection files by their checkbox table format, not only by frontmatter.')
      .addToggle(t =>
        t
          .setValue(this.plugin.settings.autoDetect)
          .onChange(async v => {
            this.plugin.settings.autoDetect = v;
            await this.plugin.saveSettings();
          })
      );
  }
}
