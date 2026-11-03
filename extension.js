import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { ConfigLoader } from './lib/config.js';
import { PrometheusAPI } from './lib/api.js';

export default class PrometheusExtension extends Extension {
    async enable() {
        // 1. Initialize Settings and Libraries
        this._settings = this.getSettings('org.gnome.shell.extensions.observability');
        const prometheusUrl = this._settings.get_string('prometheus-url');

        console.log("Welcome to Observability.");
        

        this._api = new PrometheusAPI(prometheusUrl, null);
        this._configLoader = new ConfigLoader(`${this.dir.get_path()}/queries.json`);
        this._queries = (await this._configLoader.loadQueries()).metrics || [];

        console.log(`Loaded ${this._queries.length} queries from configuration.`);

        this._indicator = new PanelMenu.Button(0.0, 'Observability', false);
        this._topBarBox = new St.BoxLayout({ vertical: false, style_class: 'panel-status-indicators-box' });
        
        this._statusIcon = new St.Icon({
            icon_name: 'network-offline-symbolic',
            style_class: 'system-status-icon'
        });
        this._topBarBox.add_child(this._statusIcon);
        
        this._topBarLabels = {};
        this._indicator.add_child(this._topBarBox);
        Main.panel.addToStatusArea(this.uuid, this._indicator);

        const pollInterval = this._settings.get_int('poll-interval');
        this._updateMetrics(); // Initial fetch
        this._timeoutId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            pollInterval,
            () => {
                this._updateMetrics();
                return GLib.SOURCE_CONTINUE;
            }
        );

        this._settingsChangedId = this._settings.connect(
            'changed::poll-interval',
            this._restartPolling.bind(this)
        );
        this._startPolling();
    }

    async _updateMetrics() {
        let allSuccess = true;
        this._indicator.menu.removeAll(); // Clear expandable dropdown menu

        for (const queryConfig of this._queries) {
            const value = await this._api.fetchQuery(queryConfig.promql);
            
            if (value === null) {
                allSuccess = false;
                continue;
            }

            const formattedText = `${queryConfig.label}: ${parseFloat(value).toFixed(2)}${queryConfig.unit}`;

            // Populate Top Bar Applet
            if (queryConfig.show_in_topbar) {
                if (!this._topBarLabels[queryConfig.id]) {
                    this._topBarLabels[queryConfig.id] = new St.Label({
                        text: formattedText,
                        y_align: Clutter.ActorAlign.CENTER,
                        style: 'margin-left: 5px; margin-right: 5px;'
                    });
                    this._topBarBox.add_child(this._topBarLabels[queryConfig.id]);
                } else {
                    this._topBarLabels[queryConfig.id].set_text(formattedText);
                }
            }

            // Populate Expandable Dropdown Menu
            this._indicator.menu.addAction(formattedText, () => {});
        }

        // Update Connection State
        if (allSuccess && this._queries.length > 0) {
            this._statusIcon.set_icon_name('network-server-symbolic'); // Active
        } else {
            this._statusIcon.set_icon_name('network-error-symbolic'); // Error/Offline
        }
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }


        // Destroy UI toolkit elements
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._topBarBox = null;
        this._statusIcon = null;
        this._topBarLabels = {};
        this._settings = null;
        this._api = null;
        this._configLoader = null;
    }
}