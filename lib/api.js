import Soup from 'gi://Soup';
import GLib from 'gi://GLib';

export class PrometheusAPI {
    constructor(hostname, auth) {
        this.baseUrl = hostname;
        this.auth = auth;
        console.log("Starting Soup session...")
        this.session = new Soup.Session();
    }

    async fetchQuery(promql) {
        const url = `${this.baseUrl}/api/v1/query?query=${encodeURIComponent(promql)}`;
        const message = Soup.Message.new('GET', url);

        if (this.auth) {
            message.request_headers.append('Authorization', this.auth);
        }

        try {
            const bytes = await this.session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null);
            
            if (message.get_status() !== Soup.Status.OK) {
                throw new Error(`HTTP Error: ${message.get_status()}`);
            }

            const decoder = new TextDecoder('utf-8');
            const response = JSON.parse(decoder.decode(bytes.get_data()));

            if (response.status === 'success' && response.data.result.length > 0) {
                return response.data.result[0].value[1]; 
            }
            return null;
        } catch (error) {
            console.error(`Prometheus query failed: ${promql}`, error);
            return null;
        }
    }
}