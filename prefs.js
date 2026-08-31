// Preferences. Runs in its own process, with no access to gnome-shell's
// resource:// modules — so nothing here may import from modules/tiler.js.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KEYBINDINGS = [
    ['tile-left', () => _('Tile left')],
    ['tile-right', () => _('Tile right')],
    ['tile-center', () => _('Tile centre')],
    ['tile-maximize', () => _('Maximize')],
    ['focus-left', () => _('Focus left')],
    ['focus-right', () => _('Focus right')],
    ['swap-left', () => _('Swap left')],
    ['swap-right', () => _('Swap right')],
    ['move-monitor-next', () => _('Move to next monitor')],
];

/**
 * Whether a captured key combination is usable as a global shortcut.
 *
 * A bare key would steal it from every application, and Shift alone just types
 * a capital letter.
 *
 * @param {number} mask Modifier mask, already reduced to the default mod mask.
 * @param {number} keyval Key value.
 * @returns {boolean} True if the combination may be bound.
 */
function isValidBinding(mask, keyval) {
    if (mask === 0 || mask === Gdk.ModifierType.SHIFT_MASK) return false;

    return Gtk.accelerator_valid(keyval, mask);
}

const ShortcutRow = GObject.registerClass(
    class TilerShortcutRow extends Adw.ActionRow {
        /**
         * @param {Gio.Settings} settings Extension settings.
         * @param {string} key Schema key holding the binding.
         * @param {string} title Human-readable action name.
         */
        _init(settings, key, title) {
            super._init({ title, activatable: true });

            this._settings = settings;
            this._key = key;

            this._label = new Gtk.ShortcutLabel({
                disabled_text: _('Disabled'),
                valign: Gtk.Align.CENTER,
            });
            this.add_suffix(this._label);

            this._sync();
            this._changedId = settings.connect(`changed::${key}`, () => this._sync());
            this.connect('destroy', () => {
                if (this._changedId) {
                    this._settings.disconnect(this._changedId);
                    this._changedId = 0;
                }
            });
            this.connect('activated', () => this._capture());
        }

        /** Refresh the displayed accelerator from settings. */
        _sync() {
            this._label.accelerator = this._settings.get_strv(this._key)[0] ?? '';
        }

        /** Open a modal window that records the next key combination. */
        _capture() {
            const dialog = new Adw.Window({
                modal: true,
                transient_for: this.get_root(),
                default_width: 420,
                default_height: 220,
            });

            const view = new Adw.ToolbarView();
            view.add_top_bar(new Adw.HeaderBar({ show_end_title_buttons: false }));
            view.content = new Adw.StatusPage({
                title: _('Press a shortcut'),
                description: _('Backspace clears it, Escape cancels.'),
            });
            dialog.content = view;

            const controller = new Gtk.EventControllerKey();
            controller.connect('key-pressed', (_controller, keyval, keycode, state) => {
                const mask = state & Gtk.accelerator_get_default_mod_mask();

                if (keyval === Gdk.KEY_Escape && mask === 0) {
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }

                if (keyval === Gdk.KEY_BackSpace && mask === 0) {
                    this._settings.set_strv(this._key, []);
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }

                if (!isValidBinding(mask, keyval)) return Gdk.EVENT_STOP;

                this._settings.set_strv(this._key, [
                    Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask),
                ]);
                dialog.close();
                return Gdk.EVENT_STOP;
            });
            dialog.add_controller(controller);

            dialog.present();
        }
    },
);

export default class TilerPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window Window to populate.
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const layout = new Adw.PreferencesGroup({ title: _('Layout') });
        const gap = new Adw.SpinRow({
            title: _('Gap'),
            subtitle: _('Pixels between tiled windows and at the screen edge'),
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 200,
                step_increment: 1,
                page_increment: 8,
            }),
        });
        settings.bind('gap', gap, 'value', Gio.SettingsBindFlags.DEFAULT);
        layout.add(gap);
        page.add(layout);

        const shortcuts = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts'),
            description: _(
                'Press a direction repeatedly to cycle through that side’s zones.',
            ),
        });
        for (const [key, title] of KEYBINDINGS)
            shortcuts.add(new ShortcutRow(settings, key, title()));
        page.add(shortcuts);

        window.add(page);
    }
}
