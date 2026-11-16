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

        // Status icon — always visible, reflects Prometheus connection state
        this._statusIcon = new St.Icon({
            icon_name: 'network-offline-symbolic',
            style_class: 'system-status-icon',
        });
        this._topBarBox.add_child(this._statusIcon);

        // Map of queryConfig.id -> St.Label currently shown in the topbar
        this._topBarLabels = {};
        this._isUpdating = false;

        this._indicator.add_child(this._topBarBox);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._connectSettings();

        await this._loadQueries();
        this._startPolling();
    }

    disable() {
        this._disconnectSettings();

        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._topBarBox = null;
        this._statusIcon = null;
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
     * Called once on enable() and again whenever queries-config-version changes.
     */
    async _loadQueries() {
        this._queries = (await this._configLoader.loadQueries()).metrics || [];
        console.log(`Loaded ${this._queries.length} queries from configuration.`);
    }

    /**
     * Triggered by the "Reload Metrics" button in prefs via the
     * queries-config-version GSettings key incrementing.
     * Re-reads the JSON config and restarts the polling loop.
     */
    async _reloadQueries() {
        console.log('Queries config reloaded, restarting loop...');
        await this._loadQueries();
        this._restartPolling();
    }

    _startPolling() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        const interval = this._settings.get_int('poll-interval');

        this._updateMetrics(); // Immediate first fetch

        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._updateMetrics();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _restartPolling() {
        this._startPolling();
    }

    async _updateMetrics() {
        // Prevent overlapping runs if Prometheus is slower than the poll interval
        if (this._isUpdating)
            return;
        this._isUpdating = true;

        try {
            let allSuccess = true;
            const pinnedIds = new Set();
            const menuEntries = []; // Collected during fetches, applied atomically at the end

            for (const queryConfig of this._queries) {
                const value = await this._api.fetchQuery(queryConfig.promql);

                const dropdownText = value !== null
                    ? `${queryConfig.dropdown_label}: ${parseFloat(value).toFixed(2)}${queryConfig.unit}`
                    : `${queryConfig.dropdown_label}: N/A`;

                const topbarText = value !== null
                    ? `${queryConfig.topbar_label}: ${parseFloat(value).toFixed(2)}${queryConfig.unit}`
                    : `${queryConfig.topbar_label}: N/A`;

                if (value === null)
                    allSuccess = false;

                // Stage menu entry — applied after all fetches complete
                menuEntries.push({text: dropdownText, success: value !== null});

                // Sync topbar labels based on show_in_topbar flag
                if (queryConfig.show_in_topbar && value !== null) {
                    pinnedIds.add(queryConfig.id);

                    if (!this._topBarLabels[queryConfig.id]) {
                        // Label doesn't exist yet — create and add it
                        const lbl = new St.Label({
                            text: topbarText,
                            y_align: Clutter.ActorAlign.CENTER,
                            style: 'margin-left: 5px; margin-right: 5px;',
                        });
                        this._topBarLabels[queryConfig.id] = lbl;
                        this._topBarBox.add_child(lbl);
                    } else {
                        // Label already exists — just update the text
                        this._topBarLabels[queryConfig.id].set_text(topbarText);
                    }
                }
            }

            // All fetches done — rebuild the menu atomically so it is never
            // left empty while awaiting network responses
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

            // Remove labels for metrics no longer in the config or no longer show_in_topbar
            for (const id of Object.keys(this._topBarLabels)) {
                if (!pinnedIds.has(id)) {
                    this._topBarBox.remove_child(this._topBarLabels[id]);
                    delete this._topBarLabels[id];
                }
            }

            // Update connection status icon
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

        this._configVersionChangedId = this._settings.connect(
            'changed::queries-config-version',
            this._reloadQueries.bind(this)
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

        if (this._configVersionChangedId) {
            this._settings.disconnect(this._configVersionChangedId);
            this._configVersionChangedId = null;
        }
    }
}
