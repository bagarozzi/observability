import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import { ConfigLoader } from '../lib/config.js';

async function runTest() {
    // 1. Arrange
    const testDirPath = GLib.Dir.make_tmp('prometheus-test-XXXXXX');
    const testDir = Gio.File.new_for_path(testDirPath);
    const testFile = testDir.get_child('queries.json');
    
    const mockData = { queries: [{ id: "test_metric", show_in_topbar: true }] };
    const encoder = new TextEncoder();
    testFile.replace_contents(encoder.encode(JSON.stringify(mockData)), null, false, Gio.FileCreateFlags.NONE, null);

    // 2. Act - Pass the explicit file path to the constructor
    const loader = new ConfigLoader(testFile.get_path());
    const result = await loader.loadQueries();

    // 3. Assert
    if (result.queries.length !== 1)
        throw new Error(`Expected 1 query, got ${result.queries.length}`);
    if (result.queries[0].show_in_topbar !== true)
        throw new Error('Boolean flag mismatch: show_in_topbar should be true');

    print('ConfigLoader tests passed successfully.');
}

try {
    await runTest();
} catch (err) {
    printerr('FAIL: ' + err);
    System.exit(1);
}
