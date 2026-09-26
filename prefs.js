// Preferences. Runs in its own process, with no access to gnome-shell's
// resource:// modules — so nothing here may import from modules/quicktiler.js.

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {
    ExtensionPreferences,
    gettext as _,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// These modules import nothing, so they are safe to pull into this process,
// which has no access to gnome-shell's resource:// modules. Sharing them is
// what stops the action list here — and the way a shortcut is spelled — from
// drifting away from what quicktiler.js binds and the quick settings menu shows.
import { acceleratorOf } from './modules/accelerator.js';
import { ACTIONS } from './modules/actions.js';
import { KEYS } from './modules/settings.js';
import {
    CAPTURE_ASSIGN,
    CAPTURE_CANCEL,
    CAPTURE_CLEAR,
    captureOutcome,
    conflictingActions,
} from './modules/shortcuts.js';

// The Gdk and Gtk values modules/shortcuts.js needs. Passed in rather than
// imported there, so the rules themselves stay testable on plain Node.
const GTK_BINDING = {
    escapeKey: Gdk.KEY_Escape,
    backspaceKey: Gdk.KEY_BackSpace,
    shiftMask: Gdk.ModifierType.SHIFT_MASK,
    acceleratorValid: (keyval, mask) => Gtk.accelerator_valid(keyval, mask),
};

const ShortcutRow = GObject.registerClass(
    class QuickTilerShortcutRow extends Adw.ActionRow {
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
            this._label.accelerator = acceleratorOf(this._settings.get_strv(this._key));
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

                // The decision lives in modules/shortcuts.js and is tested
                // there; this only carries it out on the widgets.
                const outcome = captureOutcome(keyval, mask, GTK_BINDING);

                if (outcome === CAPTURE_CANCEL) {
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }

                if (outcome === CAPTURE_CLEAR) {
                    this._settings.set_strv(this._key, []);
                    dialog.close();
                    return Gdk.EVENT_STOP;
                }

                if (outcome !== CAPTURE_ASSIGN) return Gdk.EVENT_STOP;

                const accelerator = Gtk.accelerator_name_with_keycode(
                    null,
                    keyval,
                    keycode,
                    mask,
                );

                // Mutter registers both actions and indexes the combination to
                // only one of them, so leaving both set would show a shortcut
                // here that does nothing at all. Clear the previous holder,
                // which is what GNOME Settings does.
                for (const other of conflictingActions(this._key, accelerator, key =>
                    this._settings.get_strv(key),
                ))
                    this._settings.set_strv(other, []);

                this._settings.set_strv(this._key, [accelerator]);
                dialog.close();
                return Gdk.EVENT_STOP;
            });
            dialog.add_controller(controller);

            // Mutter runs global keybindings before a focused client sees the
            // key, unless that client's surface inhibits system shortcuts
            // (keybindings.c, process_event). Without this the dialog could
            // never record a combination already bound — to one of this
            // extension's own actions, or to anything else — because pressing
            // it would perform that action instead. Rebinding one of ours over
            // another is exactly the case conflictingActions exists for.
            //
            // The first time, the Shell asks whether to allow it
            // (inhibitShortcutsDialog.js) and remembers the answer in the
            // permission store; GNOME Settings is the only app it allows
            // without asking. If it is refused, the dialog still captures every
            // combination nothing else holds.
            //
            // Inhibited on map rather than here because the surface only
            // exists once the window is realized, and restored on unmap so
            // that closing the dialog any way at all gives the shortcuts back.
            dialog.connect('map', () => {
                const surface = dialog.get_surface();
                if (surface instanceof Gdk.Toplevel)
                    surface.inhibit_system_shortcuts(null);
            });
            dialog.connect('unmap', () => {
                const surface = dialog.get_surface();
                if (surface instanceof Gdk.Toplevel) surface.restore_system_shortcuts();
            });

            dialog.present();
        }
    },
);

export default class QuickTilerPreferences extends ExtensionPreferences {
    /**
     * @param {Adw.PreferencesWindow} window Window to populate.
     */
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        // First, because it is the switch that decides whether the tile the
        // extension is named for exists at all.
        const panel = new Adw.PreferencesGroup({ title: _('Quick Settings') });
        const tile = new Adw.SwitchRow({
            title: _('Show the tile'),
            subtitle: _('Lists every action, with its shortcut, in the system menu'),
        });
        settings.bind(
            KEYS.SHOW_QUICK_SETTINGS,
            tile,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        panel.add(tile);
        page.add(panel);

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
        settings.bind(KEYS.GAP, gap, 'value', Gio.SettingsBindFlags.DEFAULT);
        layout.add(gap);
        page.add(layout);

        const shortcuts = new Adw.PreferencesGroup({
            title: _('Keyboard shortcuts'),
            description: _(
                'Press a direction repeatedly to cycle through that side’s zones.',
            ),
        });
        // The master switch sits above the per-action rows, because that is what
        // it is. It is also the way back when the tile is hidden: with no tile
        // in the panel, this row is the only thing that can un-pause.
        const active = new Adw.SwitchRow({
            title: _('Keyboard shortcuts'),
            subtitle: _('Releases every shortcut until you turn them back on'),
        });
        settings.bind(
            KEYS.SHORTCUTS_ENABLED,
            active,
            'active',
            Gio.SettingsBindFlags.DEFAULT,
        );
        shortcuts.add(active);

        // _() is called here rather than in modules/actions.js, which must stay
        // free of imports, and at row-build time rather than at module load so
        // the gettext domain is already bound.
        for (const { key, label } of ACTIONS)
            shortcuts.add(new ShortcutRow(settings, key, _(label)));
        page.add(shortcuts);

        window.add(page);
    }
}
