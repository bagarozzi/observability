import Gio from 'gi://Gio';

Gio._promisify(Gio.File.prototype, 'load_bytes_async', 'load_bytes_finish');

export class ConfigLoader {
    /**
     * @param {string} filePath - The absolute path to the queries.json file.
     */
    constructor(filePath) {
        this.configFile = Gio.File.new_for_path(filePath);
        this.decoder = new TextDecoder('utf-8');
    }

    /**
     * Reads the JSON configuration file to parse the user's specific PromQL queries and display preferences.
     * @returns {Promise<Object>} The parsed configuration object.
     */
    async loadQueries() {
        try {
            if (!this.configFile.query_exists(null)) {
                console.warn('queries.json not found. Returning empty query list.');
                return { queries: [] };
            }

            const [bytes, etag] = await this.configFile.load_bytes_async(null);
            
            
            const jsonString = this.decoder.decode(bytes.toArray());
            
            return JSON.parse(jsonString);
        } catch (error) {
            console.error('Failed to parse queries.json:', error);
        }
        
        return { queries: [] };
    }
}