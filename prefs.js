import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
            subtitle: 'Manage PromQL queries and UI labels',
        });

        const refreshRow = new Adw.ActionRow({
            title: 'Refresh extension',
            subtitle: 'Refresh the extension after modifying its configuration',
        });

        const openButton = new Gtk.Button({
            label: 'Open queries.json',
            valign: Gtk.Align.CENTER,
        });

        openButton.connect('clicked', () => {
            const fileUri = this.dir.get_child('queries.json').get_uri();
            Gio.AppInfo.launch_default_for_uri(fileUri, null);
        });

        const refreshButton = new Gtk.Button({
            label: 'Refresh',
            valign: Gtk.Align.CENTER,
        });

        refreshButton.connect('clicked', () => {
            const current = settings.get_int('queries-config-version');
            settings.set_int('queries-config-version', current + 1);
        });

        fileRow.add_suffix(openButton);
        refreshRow.add_suffix(refreshButton);
        queryGroup.add(fileRow);
        queryGroup.add(refreshRow);

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

function _buildPollingNote(seconds) {
    return `Query updates may take up to ${seconds} second${seconds !== 1 ? 's' : ''} to appear after a change.`;
}
