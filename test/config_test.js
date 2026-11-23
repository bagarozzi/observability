import Gio from 'gi://Gio';
import System from 'system';
import {ConfigLoader} from '../lib/config.js';

Gio._promisify(Gio.File.prototype, 'load_bytes_async', 'load_bytes_finish');

async function runTest() {
    const testDir = Gio.File.new_for_uri(import.meta.url)
        .get_parent()
        .get_path();

    const loader = new ConfigLoader(
        testDir,
        'test_queries.json',
        '/nonexistent/template.json',
        '/nonexistent/schema.json'
    );
    const result = await loader.loadQueries();

    if (result.length !== 1)
        throw new Error(`Expected 1 query, got ${result.length}`);
    if (result[0].show_in_topbar !== true)
        throw new Error('Boolean flag mismatch: show_in_topbar should be true');

    loader.destroy();
    print('ConfigLoader smoke test passed.');
}

try {
    await runTest();
} catch (err) {
    printerr(`FAIL: ${err}`);
    System.exit(1);
}
