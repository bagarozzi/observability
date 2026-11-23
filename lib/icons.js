import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const DEFAULT_FALLBACK_ICONS = [
    'computer-symbolic',
];

const ERROR_FALLBACK_ICONS = [
    'dialog-error-symbolic',
    'network-error-symbolic',
];

const USER_ICONS_DIR = GLib.build_filenamev([
    GLib.get_user_config_dir(),
    'observability',
    'icons',
]);

export class IconResolver {
    constructor(extensionDir) {
        this._extensionDir = typeof extensionDir === 'string'
            ? Gio.File.new_for_path(extensionDir)
            : extensionDir;
    }

    getIcon(iconName) {
        if (!iconName)
            return Gio.ThemedIcon.new_from_names(DEFAULT_FALLBACK_ICONS);

        const candidate = iconName.endsWith('.svg') ? iconName : `${iconName}.svg`;

        const userFile = Gio.File.new_build_filenamev([USER_ICONS_DIR, candidate]);
        if (userFile.query_exists(null))
            return new Gio.FileIcon({file: userFile});

        const bundledFile = this._extensionDir.get_child('icons').get_child(candidate);
        if (bundledFile.query_exists(null))
            return new Gio.FileIcon({file: bundledFile});

        const cleanName = iconName.replace(/\.svg$/, '');
        return Gio.ThemedIcon.new_from_names([cleanName, ...DEFAULT_FALLBACK_ICONS]);
    }

    getErrorIcon() {
        return Gio.ThemedIcon.new_from_names(ERROR_FALLBACK_ICONS);
    }
}
