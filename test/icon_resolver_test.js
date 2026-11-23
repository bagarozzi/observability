import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

const testConfigHome = GLib.Dir.make_tmp('obs-icon-test-config-XXXXXX');
GLib.setenv('XDG_CONFIG_HOME', testConfigHome, true);

const {IconResolver} = await import('../lib/icons.js');

function makeTempDir() {
    return GLib.Dir.make_tmp('obs-icon-test-XXXXXX');
}

function writeRaw(dir, filename, content) {
    const path = GLib.build_filenamev([dir, filename]);
    GLib.file_set_contents(path, content);
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

const tests = [];
function test(name, fn) {
    tests.push({name, fn});
}

test('getIcon: resolves bundled icon to Gio.FileIcon', () => {
    const extDir = makeTempDir();
    const iconsDir = GLib.build_filenamev([extDir, 'icons']);
    GLib.mkdir_with_parents(iconsDir, 0o755);
    writeRaw(iconsDir, 'test-metric-symbolic.svg', '<svg></svg>');

    const resolver = new IconResolver(extDir);
    const icon = resolver.getIcon('test-metric-symbolic');

    assert(icon instanceof Gio.FileIcon, 'should resolve to Gio.FileIcon');
    assertEqual(icon.file.get_basename(), 'test-metric-symbolic.svg', 'filename');
});

test('getIcon: resolves user custom icon over bundled icon', () => {
    const extDir = makeTempDir();
    const bundledIcons = GLib.build_filenamev([extDir, 'icons']);
    GLib.mkdir_with_parents(bundledIcons, 0o755);
    writeRaw(bundledIcons, 'my-metric.svg', '<svg>bundled</svg>');

    const userIconsDir = GLib.build_filenamev([GLib.get_user_config_dir(), 'observability', 'icons']);
    GLib.mkdir_with_parents(userIconsDir, 0o755);
    const testFile = GLib.build_filenamev([userIconsDir, 'my-metric.svg']);
    writeRaw(userIconsDir, 'my-metric.svg', '<svg>user</svg>');

    try {
        const resolver = new IconResolver(extDir);
        const icon = resolver.getIcon('my-metric');

        assert(icon instanceof Gio.FileIcon, 'should resolve to Gio.FileIcon');
        assertEqual(icon.file.get_parent().get_path(), userIconsDir, 'should resolve from user dir');
    } finally {
        const file = Gio.File.new_for_path(testFile);
        if (file.query_exists(null))
            file.delete(null);
    }
});

test('getIcon: falls back to Gio.ThemedIcon for system icons', () => {
    const extDir = makeTempDir();

    const resolver = new IconResolver(extDir);
    const icon = resolver.getIcon('view-refresh-symbolic');

    assert(icon instanceof Gio.ThemedIcon, 'should resolve to Gio.ThemedIcon');
    const names = icon.get_names();
    assert(names.includes('view-refresh-symbolic'), 'should include view-refresh-symbolic');
    assert(names.includes('computer-symbolic'), 'should include default fallback');
});

test('getIcon: returns default fallback when iconName is null or empty', () => {
    const resolver = new IconResolver('/tmp');
    const icon = resolver.getIcon(null);

    assert(icon instanceof Gio.ThemedIcon, 'should resolve to Gio.ThemedIcon');
    const names = icon.get_names();
    assert(names.includes('computer-symbolic'), 'should include default fallback');
});

test('getErrorIcon: returns Gio.ThemedIcon with network-error-symbolic', () => {
    const resolver = new IconResolver('/tmp');
    const icon = resolver.getErrorIcon();

    assert(icon instanceof Gio.ThemedIcon, 'should resolve to Gio.ThemedIcon');
    const names = icon.get_names();
    assert(names.includes('network-error-symbolic'), 'should include network-error-symbolic');
});

function runAll() {
    let passed = 0;
    let failed = 0;

    for (const {name, fn} of tests) {
        try {
            fn();
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

print('IconResolver tests:');
runAll();
