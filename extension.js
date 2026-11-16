import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {ConfigLoader} from './lib/config.js';
import {PrometheusAPI} from './lib/api.js';

export default class PrometheusExtension extends Extension {
    async enable() {
        this._settings = this.getSettings();
        const prometheusUrl = this._settings.get_string('prometheus-url');

        console.log('Welcome to Observability.');

        this._api = new PrometheusAPI(prometheusUrl, null);
        this._configLoader = new ConfigLoader(`${this.dir.get_path()}/queries.json`);
        this._queries = [];

        this._indicator = new PanelMenu.Button(0.0, 'Observability', false);
        this._topBarBox = new St.BoxLayout({vertical: false, style_class: 'panel-status-indicators-box'});

        this._statusIcon = new St.Icon({
            icon_name: 'network-offline-symbolic',
            style_class: 'system-status-icon',
        });
        this._topBarBox.add_child(this._statusIcon);

        this._topBarLabels = {};
        this._isUpdating = false;

        this._indicator.add_child(this._topBarBox);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._connectSettings();

        await this._loadQueries();
        this._configLoader.startWatching(newQueries => {
            console.log('Queries config reloaded from disk watcher, restarting loop...');
            this._queries = newQueries;
            this._restartPolling();
        });
        this._startPolling();
    }

    disable() {
        this._disconnectSettings();

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._configLoader) {
            this._configLoader.destroy();
            this._configLoader = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        if (this._statusIcon) {
            this._statusIcon.destroy();
            this._statusIcon = null;
        }

        if (this._topBarBox) {
            this._topBarBox.destroy();
            this._topBarBox = null;
        }

        this._topBarLabels = {};
        this._isUpdating = false;
        this._queries = [];
        this._settings = null;
        this._api.cleanup();
        this._api = null;
        this._configLoader = null;
    }

    /**
     * Reads queries.json and stores the result in this._queries.
     */
    async _loadQueries() {
        this._queries = await this._configLoader.loadQueries();
        console.log(`Loaded ${this._queries.length} queries from configuration.`);
    }

    _startPolling() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        const interval = this._settings.get_int('poll-interval');

        this._updateMetrics();

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._updateMetrics();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartPolling() {
        this._startPolling();
    }

    async _updateMetrics() {
        if (this._isUpdating)
            return;
        this._isUpdating = true;

        try {
            let allSuccess = true;
            const pinnedIds = new Set();
            const menuEntries = [];

            const results = await Promise.all(
                this._queries.map(async queryConfig => {
                    const value = await this._api.fetchQuery(queryConfig.promql);
                    return {queryConfig, value};
                })
            );

            for (const {queryConfig, value} of results) {
                const dropdownText = value !== null
                    ? `${queryConfig.dropdown_label}: ${parseFloat(value).toFixed(2)}${queryConfig.unit}`
                    : `${queryConfig.dropdown_label}: N/A`;

                const topbarText = value !== null
                    ? `${queryConfig.topbar_label}: ${parseFloat(value).toFixed(2)}${queryConfig.unit}`
                    : `${queryConfig.topbar_label}: N/A`;

                if (value === null)
                    allSuccess = false;

                menuEntries.push({text: dropdownText, success: value !== null});

                if (queryConfig.show_in_topbar && value !== null) {
                    pinnedIds.add(queryConfig.id);

                    if (!this._topBarLabels[queryConfig.id]) {
                        const lbl = new St.Label({
                            text: topbarText,
                            y_align: Clutter.ActorAlign.CENTER,
                            style: 'margin-left: 5px; margin-right: 5px;',
                        });
                        this._topBarLabels[queryConfig.id] = lbl;
                        this._topBarBox.add_child(lbl);
                    } else {
                        this._topBarLabels[queryConfig.id].set_text(topbarText);
                    }
                }
            }

            this._indicator.menu.removeAll();
            for (const {text, success} of menuEntries) {
                const item = new PopupMenu.PopupImageMenuItem(
                    text,
                    success ? 'object-selected-symbolic' : 'object-stop-symbolic'
                );
                this._indicator.menu.addMenuItem(item);
            }

            this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this._indicator.menu.addAction('Preferences', () => this.openPreferences());

            for (const id of Object.keys(this._topBarLabels)) {
                if (!pinnedIds.has(id)) {
                    this._topBarBox.remove_child(this._topBarLabels[id]);
                    delete this._topBarLabels[id];
                }
            }

            this._statusIcon.set_icon_name(
                allSuccess && this._queries.length > 0
                    ? 'network-server-symbolic'
                    : 'network-error-symbolic'
            );
        } finally {
            this._isUpdating = false;
        }
    }

    _connectSettings() {
        this._settingsChangedId = this._settings.connect(
            'changed::poll-interval',
            () => {
                console.log('Poll interval changed, restarting loop...');
                this._restartPolling();
            }
        );

        this._urlChangedId = this._settings.connect(
            'changed::prometheus-url',
            () => {
                console.log('Prometheus URL changed, reconnecting...');
                this._api.changeHostname(
                    this._settings.get_string('prometheus-url'),
                    null
                );
                this._restartPolling();
            }
        );
    }

    _disconnectSettings() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        if (this._urlChangedId) {
            this._settings.disconnect(this._urlChangedId);
            this._urlChangedId = null;
        }
    }
}
