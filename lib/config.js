import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'load_bytes_async', 'load_bytes_finish');

const DEFAULT_CONFIG_DIR = 'observability';
const CONFIG_FILE_NAME = 'queries.json';
const SCHEMA_FILE_NAME = 'queries.schema.json';

export class ConfigLoader {
    constructor(configDir, configFileName, templatePath, templateSchemaPath) {
        this.configFileName = configFileName;
        this.configDir = configDir;
        this.templatePath = templatePath;
        this.templateSchemaPath = templateSchemaPath;

        this.configFile = Gio.File.new_build_filenamev([this.configDir, this.configFileName]);
        this._ensureConfigFile();

        this.decoder = new TextDecoder('utf-8');
        this._fileMonitor = null;
        this._debounceId = null;
        this._lastValidQueries = [];
    }

    /**
     * Factory method using default filenames.
     *
     *  @param {Gio.File} extensionDir indicating the extension's working directory
     */
    static createDefaultConfigLoader(extensionDir) {
        const configDir = GLib.build_filenamev([GLib.get_user_config_dir(), DEFAULT_CONFIG_DIR]);
        const templatePath = GLib.build_filenamev([extensionDir.get_path(), CONFIG_FILE_NAME]);
        const templateSchemaPath = GLib.build_filenamev([extensionDir.get_path(), SCHEMA_FILE_NAME]);

        return new ConfigLoader(configDir, CONFIG_FILE_NAME, templatePath, templateSchemaPath);
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

            this._debounceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
                this._debounceId = null;
                this.loadQueries().then(newQueries => {
                    onChanged(newQueries);
                });
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _ensureConfigFile() {
        const templateFile = Gio.File.new_for_path(this.templatePath);
        const templateSchemaFile = Gio.File.new_for_path(this.templateSchemaPath);
        const configDirFile = Gio.File.new_for_path(this.configDir);
        const destSchemaFile = Gio.File.new_build_filenamev([configDirFile.get_path(), templateSchemaFile.get_basename()]);

        if (!configDirFile.query_exists(null))
            configDirFile.make_directory_with_parents(null);


        if (templateFile.query_exists(null) && !this.configFile.query_exists(null)) {
            templateFile.copy(this.configFile, Gio.FileCopyFlags.NONE, null, null);
        } else if (!templateFile.query_exists(null) && !this.configFile.query_exists(null)) {
            const blankConfig = JSON.stringify({metrics: []}, null, 2);
            GLib.file_set_contents(this.configFile.get_path(), blankConfig);
        }

        if (templateSchemaFile.query_exists(null) && !destSchemaFile.query_exists(null))
            templateSchemaFile.copy(destSchemaFile, Gio.FileCopyFlags.NONE, null, null);
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
