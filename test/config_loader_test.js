/* eslint-disable no-await-in-loop */
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';
import {ConfigLoader} from '../lib/config.js';

Gio._promisify(Gio.File.prototype, 'load_bytes_async', 'load_bytes_finish');

function makeTempDir() {
    return GLib.Dir.make_tmp('obs-test-XXXXXX');
}

function writeJson(dir, filename, obj) {
    const path = GLib.build_filenamev([dir, filename]);
    GLib.file_set_contents(path, JSON.stringify(obj, null, 2));
}

function writeRaw(dir, filename, content) {
    const path = GLib.build_filenamev([dir, filename]);
    GLib.file_set_contents(path, content);
}

function fileExists(dir, filename) {
    const file = Gio.File.new_build_filenamev([dir, filename]);
    return file.query_exists(null);
}

function readFileContents(dir, filename) {
    const path = GLib.build_filenamev([dir, filename]);
    const [, contents] = GLib.file_get_contents(path);
    return new TextDecoder('utf-8').decode(contents);
}

function deleteFile(dir, filename) {
    const file = Gio.File.new_build_filenamev([dir, filename]);
    if (file.query_exists(null))
        file.delete(null);
}

const sleep = ms => new Promise(resolve => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    });
});

async function spinUntil(predicate, timeoutMs, intervalMs = 50) {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs)
            break;
        await sleep(intervalMs);
    }
}

function assert(condition, msg) {
    if (!condition)
        throw new Error(msg);
}

function assertEqual(actual, expected, label) {
    assert(
        actual === expected,
        `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
}

const CONFIG_FILE = 'queries.json';
const SCHEMA_FILE = 'queries.schema.json';

const VALID_CONFIG = {
    metrics: [
        {
            id: 'cpu', dropdown_label: 'CPU Load', topbar_label: 'CPU',
            promql: 'up', unit: '%', show_in_topbar: true, icon: 'cpu-symbolic',
        },
    ],
};

const VALID_CONFIG_2 = {
    metrics: [
        {
            id: 'mem', dropdown_label: 'RAM Free', topbar_label: 'MEM',
            promql: 'mem_free', unit: 'GB', show_in_topbar: false, icon: 'memory-symbolic',
        },
    ],
};

const MULTI_METRIC_CONFIG = {
    metrics: [
        {
            id: 'cpu', dropdown_label: 'CPU', topbar_label: 'CPU',
            promql: 'up', unit: '%', show_in_topbar: true, icon: 'cpu-symbolic',
        },
        {
            id: 'mem', dropdown_label: 'MEM', topbar_label: 'MEM',
            promql: 'mem_free', unit: 'GB', show_in_topbar: false, icon: 'memory-symbolic',
        },
    ],
};

function makeLoader(configDir, templateDir) {
    const tpl = templateDir ?? '/nonexistent';
    return new ConfigLoader(
        configDir,
        CONFIG_FILE,
        GLib.build_filenamev([tpl, CONFIG_FILE]),
        GLib.build_filenamev([tpl, SCHEMA_FILE])
    );
}

const tests = [];

function test(name, fn) {
    tests.push({name, fn});
}

test('loadQueries: returns metrics from valid file', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);

    const result = await loader.loadQueries();

    assertEqual(result.length, 1, 'metric count');
    assertEqual(result[0].id, 'cpu', 'metric id');
    assertEqual(result[0].show_in_topbar, true, 'show_in_topbar');
    loader.destroy();
});

test('loadQueries: returns multiple metrics', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, MULTI_METRIC_CONFIG);
    const loader = makeLoader(dir);

    const result = await loader.loadQueries();

    assertEqual(result.length, 2, 'metric count');
    assertEqual(result[0].id, 'cpu', 'first id');
    assertEqual(result[1].id, 'mem', 'second id');
    loader.destroy();
});

test('loadQueries: returns [] for missing metrics key', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, {foo: 'bar'});
    const loader = makeLoader(dir);

    const result = await loader.loadQueries();

    assertEqual(result.length, 0, 'metric count for missing key');
    loader.destroy();
});

test('loadQueries: returns [] for invalid JSON', async () => {
    const dir = makeTempDir();
    writeRaw(dir, CONFIG_FILE, '{{{broken');
    const loader = makeLoader(dir);

    const result = await loader.loadQueries();

    assertEqual(result.length, 0, 'metric count for broken JSON');
    loader.destroy();
});

test('loadQueries: returns [] when metrics is not an array', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, {metrics: 'not-an-array'});
    const loader = makeLoader(dir);

    const result = await loader.loadQueries();

    assertEqual(result.length, 0, 'metric count for non-array metrics');
    loader.destroy();
});

test('loadQueries: retains last valid config after bad edit', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);

    const first = await loader.loadQueries();
    assertEqual(first.length, 1, 'first load count');

    writeRaw(dir, CONFIG_FILE, 'NOT JSON');
    const second = await loader.loadQueries();

    assertEqual(second.length, 1, 'retained count after bad edit');
    assertEqual(second[0].id, 'cpu', 'retained metric id');
    loader.destroy();
});

test('loadQueries: retains last valid config when file deleted', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);

    await loader.loadQueries();
    deleteFile(dir, CONFIG_FILE);
    const result = await loader.loadQueries();

    assertEqual(result.length, 1, 'retained count after delete');
    assertEqual(result[0].id, 'cpu', 'retained metric id');
    loader.destroy();
});


test('ensureConfigFile: creates dir and blank config when no template', () => {
    const parent = makeTempDir();
    const configDir = GLib.build_filenamev([parent, 'new-config-dir']);

    // Constructor triggers _ensureConfigFile
    const loader = new ConfigLoader(
        configDir, CONFIG_FILE,
        '/nonexistent/queries.json',
        '/nonexistent/queries.schema.json'
    );

    assert(fileExists(configDir, CONFIG_FILE), 'config file should exist');
    const content = JSON.parse(readFileContents(configDir, CONFIG_FILE));
    assert(Array.isArray(content.metrics), 'blank config should have metrics array');
    assertEqual(content.metrics.length, 0, 'blank config metric count');
    loader.destroy();
});

test('ensureConfigFile: copies template when it exists', () => {
    const templateDir = makeTempDir();
    writeJson(templateDir, CONFIG_FILE, VALID_CONFIG);
    writeJson(templateDir, SCHEMA_FILE, {$schema: 'test'});

    const parent = makeTempDir();
    const configDir = GLib.build_filenamev([parent, 'fresh-config']);

    const loader = new ConfigLoader(
        configDir, CONFIG_FILE,
        GLib.build_filenamev([templateDir, CONFIG_FILE]),
        GLib.build_filenamev([templateDir, SCHEMA_FILE])
    );

    assert(fileExists(configDir, CONFIG_FILE), 'config file should be copied');
    const content = JSON.parse(readFileContents(configDir, CONFIG_FILE));
    assertEqual(content.metrics.length, 1, 'copied template metric count');
    assertEqual(content.metrics[0].id, 'cpu', 'copied metric id');
    loader.destroy();
});

test('ensureConfigFile: copies schema alongside config', () => {
    const templateDir = makeTempDir();
    writeJson(templateDir, CONFIG_FILE, VALID_CONFIG);
    writeJson(templateDir, SCHEMA_FILE, {type: 'object'});

    const parent = makeTempDir();
    const configDir = GLib.build_filenamev([parent, 'schema-test']);

    const loader = new ConfigLoader(
        configDir, CONFIG_FILE,
        GLib.build_filenamev([templateDir, CONFIG_FILE]),
        GLib.build_filenamev([templateDir, SCHEMA_FILE])
    );

    assert(fileExists(configDir, SCHEMA_FILE), 'schema file should be copied');
    loader.destroy();
});

test('ensureConfigFile: does not overwrite existing config', () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);

    const templateDir = makeTempDir();
    writeJson(templateDir, CONFIG_FILE, VALID_CONFIG);

    const loader = new ConfigLoader(
        dir, CONFIG_FILE,
        GLib.build_filenamev([templateDir, CONFIG_FILE]),
        GLib.build_filenamev([templateDir, SCHEMA_FILE])
    );

    const content = JSON.parse(readFileContents(dir, CONFIG_FILE));
    assertEqual(content.metrics[0].id, 'mem', 'existing config should not be overwritten');
    loader.destroy();
});

test('ensureConfigFile: idempotent — constructing twice is safe', () => {
    const parent = makeTempDir();
    const configDir = GLib.build_filenamev([parent, 'idempotent-test']);

    const loader1 = new ConfigLoader(
        configDir, CONFIG_FILE,
        '/nonexistent/queries.json',
        '/nonexistent/queries.schema.json'
    );
    loader1.destroy();

    // Second construction on same directory should not throw
    const loader2 = new ConfigLoader(
        configDir, CONFIG_FILE,
        '/nonexistent/queries.json',
        '/nonexistent/queries.schema.json'
    );
    assert(fileExists(configDir, CONFIG_FILE), 'config file should still exist');
    loader2.destroy();
});

test('startWatching: fires callback on file change', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let callbackResult = null;
    loader.startWatching(queries => {
        callbackResult = queries;
    });

    writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);
    await spinUntil(() => callbackResult !== null, 2000);

    assert(callbackResult !== null, 'callback should have been called');
    assertEqual(callbackResult.length, 1, 'callback metric count');
    assertEqual(callbackResult[0].id, 'mem', 'callback metric id');
    loader.destroy();
});

test('startWatching: debounces rapid writes into single callback', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let callCount = 0;
    loader.startWatching(() => {
        callCount++;
    });

    for (let i = 0; i < 5; i++)
        writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);

    await spinUntil(() => callCount > 0, 2000);
    await sleep(400);

    assertEqual(callCount, 1, 'debounced call count');
    loader.destroy();
});

test('startWatching: callback receives previous valid config on bad edit', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let callbackResult = null;
    loader.startWatching(queries => {
        callbackResult = queries;
    });

    writeRaw(dir, CONFIG_FILE, 'GARBAGE {{{');
    await spinUntil(() => callbackResult !== null, 2000);

    assert(callbackResult !== null, 'callback should fire even for bad edits');
    assertEqual(callbackResult.length, 1, 'should retain previous valid metrics');
    assertEqual(callbackResult[0].id, 'cpu', 'retained metric id');
    loader.destroy();
});

test('startWatching: callback fires on file recreation', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let callbackResult = null;
    loader.startWatching(queries => {
        callbackResult = queries;
    });

    deleteFile(dir, CONFIG_FILE);
    await sleep(100);
    writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);
    await spinUntil(() => callbackResult !== null && callbackResult[0].id === 'mem', 2000);

    assert(callbackResult !== null, 'callback should fire after recreate');
    assertEqual(callbackResult[0].id, 'mem', 'recreated file metric id');
    loader.destroy();
});

test('destroy: stops watcher from firing', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let called = false;
    loader.startWatching(() => {
        called = true;
    });
    loader.destroy();

    writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);
    await sleep(600);

    assert(!called, 'callback must NOT fire after destroy');
});

test('destroy: cancels pending debounce', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    let called = false;
    loader.startWatching(() => {
        called = true;
    });

    writeJson(dir, CONFIG_FILE, VALID_CONFIG_2);
    loader.destroy();
    await sleep(600);

    assert(!called, 'pending debounce must be cancelled by destroy');
});

test('destroy: safe to call twice', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    loader.startWatching(() => {});
    loader.destroy();
    loader.destroy(); // should not throw
});

test('destroy: safe to call without startWatching', async () => {
    const dir = makeTempDir();
    writeJson(dir, CONFIG_FILE, VALID_CONFIG);
    const loader = makeLoader(dir);
    await loader.loadQueries();

    loader.destroy();
});

async function runAll() {
    let passed = 0;
    let failed = 0;

    for (const {name, fn} of tests) {
        try {
            await fn();
            print(`  ✓ ${name}`);
            passed++;
        } catch (e) {
            printerr(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }

    print(`\n${passed} passed, ${failed} failed`);

    if (failed > 0)
        System.exit(1);
}

print('ConfigLoader tests:');
await runAll();
