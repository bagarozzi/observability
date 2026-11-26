<img src="icons/main-icon.svg" width="200px">

# Observability
[![Staging](https://github.com/bagarozzi/observability/actions/workflows/stage.yml/badge.svg?event=pull_request)](https://github.com/bagarozzi/observability/actions/workflows/stage.yml)

A GNOME extension that gives a glance over custom metrics from a Prometheus API.

### Features
- Write custom metrics on the configuration file, add a label and a symbol
- Visualize in a top-bar applet
- Add custom icons from "

### Configuration
At the first startup the `~/.config/observability` directory gets populated with a template configuration file and the schema.

Open `~/.config/observability/queries.json` with an editor that supports JSON validation to write the configuration according to the schema.

### Icons
A custom icon can be set for each query, using the `icon` field of each metric. Check out `gtk3-icon-browser` or `gtk4-icon-browser` to see which icons are available on your system.

Alternatively, the user can add custom SVG symbolic icons to the `icons` directory in the configuration path of the extension,
these icons' names can be used directly in the `icon` fields of the `queries.json` file.

### Credits

The **icons** [bundled](./icons/) with this extension are the same as in [Vitals](https://github.com/corecoding/Vitals/), follows a credit for each type of icon:
* (battery | storage)-symbolic.svg - from [Adwaita Icon Theme](https://gitlab.gnome.org/GNOME/adwaita-icon-theme).
* (memory | network* | swap | system | voltage)-symbolic.svg - from [Icon Development Kit](https://gitlab.gnome.org/Teams/Design/icon-development-kit).
* fan-symbolic.svg - inherited from [Freon](https://github.com/UshakovVasilii/gnome-shell-extension-freon) project, with mild modifications.
* (temperature | cpu)-symbolic.svg - designed by [daudix](https://github.com/daudix).