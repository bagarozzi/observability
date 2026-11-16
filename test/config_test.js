import Gio from 'gi://Gio';
import System from 'system';
import {ConfigLoader} from '../lib/config.js';

async function runTest() {
    const testFile = Gio.File.new_for_uri(import.meta.url)
        .get_parent()
        .get_child('test_queries.json');

    const loader = new ConfigLoader(testFile.get_path());
    const result = await loader.loadQueries();

    if (result.length !== 1)
        throw new Error(`Expected 1 query, got ${result.length}`);
    if (result[0].show_in_topbar !== true)
        throw new Error('Boolean flag mismatch: show_in_topbar should be true');

    print('ConfigLoader tests passed successfully.');
}

try {
    await runTest();
} catch (err) {
    printerr(`FAIL: ${err}`);
    System.exit(1);
}
