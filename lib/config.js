import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_bytes_async', 'load_bytes_finish');

export class ConfigLoader {
    constructor(filePath) {
        this.configFile = Gio.File.new_for_path(filePath);
        this.decoder = new TextDecoder('utf-8');
        this._fileMonitor = null;
        this._debounceId = null;
        this._lastValidQueries = [];
    }

    /**
     * Parses the configuration file specified in the constructor.
     * If the file is not parsed correctly or does not exist it returns an empty array.
     *
     * @returns {Promise<Array>} An array of metrics, as specified in the configuration schema, an empty array otherwise.
     */
    async loadQueries() {
        try {
            if (!this.configFile.query_exists(null)) {
                console.warn('config file passed was not found, retaining previous or empty config.');
                return this._lastValidQueries;
            }

            const [bytes] = await this.configFile.load_bytes_async(null);
            const data = JSON.parse(this.decoder.decode(bytes.toArray()));

            if (!data || !Array.isArray(data.metrics))
                throw new Error('config file must contain a "metrics" array');

            this._lastValidQueries = data.metrics;
            return this._lastValidQueries;
        } catch (error) {
            console.warn('Failed to parse config file, keeping previous or empty configuration:', error);
            return this._lastValidQueries;
        }
    }

    startWatching(onChanged) {
        this._fileMonitor = this.configFile.monitor_file(Gio.FileMonitorFlags.NONE, null);
        this._fileMonitor.connect('changed', (monitor, file, otherFile, eventType) => {
            if (eventType !== Gio.FileMonitorEvent.CHANGES_DONE_HINT &&
                eventType !== Gio.FileMonitorEvent.CHANGED &&
                eventType !== Gio.FileMonitorEvent.CREATED)
                return;

            if (this._debounceId) {
                GLib.source_remove(this._debounceId);
                this._debounceId = null;
            }

            this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, async () => {
                this._debounceId = null;
                const newQueries = await this.loadQueries();
                onChanged(newQueries);
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    destroy() {
        if (this._debounceId) {
            GLib.source_remove(this._debounceId);
            this._debounceId = null;
        }
        if (this._fileMonitor) {
            this._fileMonitor.cancel();
            this._fileMonitor = null;
        }
    }
}
