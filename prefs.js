import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {ConfigLoader} from './lib/config.js';

export default class PrometheusPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        const connGroup = new Adw.PreferencesGroup({title: 'Connection'});
        page.add(connGroup);

        const urlRow = new Adw.EntryRow({title: 'Prometheus URL'});
        settings.bind('prometheus-url', urlRow, 'text', Gio.SettingsBindFlags.DEFAULT);
        connGroup.add(urlRow);

        const intervalRow = new Adw.SpinRow({
            title: 'Polling Interval (seconds)',
            adjustment: new Gtk.Adjustment({lower: 1, upper: 3600, step_increment: 1}),
        });
        settings.bind('poll-interval', intervalRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        connGroup.add(intervalRow);

        const queryGroup = new Adw.PreferencesGroup({title: 'Metrics'});
        page.add(queryGroup);

        const fileRow = new Adw.ActionRow({
            title: 'Edit Configuration',
            subtitle: 'Manage PromQL queries and UI labels in ~/.config/observability',
        });

        const openFolderButton = new Gtk.Button({
            icon_name: 'folder-open-symbolic',
            valign: Gtk.Align.CENTER,
            tooltip_text: 'Open configuration folder',
        });

        openFolderButton.connect('clicked', () => {
            _launchConfigUri(this.dir.get_path(), true);
        });

        const openButton = new Gtk.Button({
            label: 'Open queries.json',
            valign: Gtk.Align.CENTER,
        });

        openButton.connect('clicked', () => {
            _launchConfigUri(this.dir.get_path(), false);
        });

        fileRow.add_suffix(openFolderButton);
        fileRow.add_suffix(openButton);
        queryGroup.add(fileRow);

        const pollingNote = new Gtk.Label({
            label: _buildPollingNote(settings.get_int('poll-interval')),
            css_classes: ['dim-label', 'caption'],
            margin_top: 8,
            margin_bottom: 8,
        });
        settings.connect('changed::poll-interval', () => {
            pollingNote.set_label(_buildPollingNote(settings.get_int('poll-interval')));
        });
        queryGroup.add(pollingNote);

        window.add(page);
    }
}

function _launchConfigUri(extensionDir, isFolder = false) {
    let loader = ConfigLoader.createDefaultConfigLoader(extensionDir);
    const target = isFolder ? loader.configFile.get_parent() : loader.configFile;
    const uri = target.get_uri();
    loader.destroy();
    loader = null;
    Gio.AppInfo.launch_default_for_uri(uri, null);
}

function _buildPollingNote(seconds) {
    return `Query updates may take up to ${seconds} second${seconds !== 1 ? 's' : ''} to appear after a change.`;
}
