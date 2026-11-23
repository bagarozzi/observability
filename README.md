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

A custom icon can be set for each query, using the `icon` field of each metric. Check out `gtk3-icon-browser` or `gtk4-icon-browser` to see which icons are available on your system.