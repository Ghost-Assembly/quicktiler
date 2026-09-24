// Actor layer: the only file in QuickTiler that touches St, Clutter, PopupMenu
// or QuickSettings, and the only one besides modules/quicktiler.js that touches
// Main.
//
// It holds no decisions. Which actions exist and how they are grouped comes
// from modules/actions.js, how a shortcut is spelled comes from
// modules/accelerator.js, and performing an action is the injected runAction —
// all three import nothing and are covered by Vitest. What is left here is
// construction and, mostly, teardown.
//
// Teardown is the part worth reading. The extension's claim is that it leaks
// nothing across an enable/disable cycle, and an actor tree is the easiest way
// to break that: a handler connected to a row survives disconnectObject on the
// menu, because it was connected on the row.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';

import { bindingLabel } from './accelerator.js';
import { ACTIONS_BY_GROUP, ACTION_KEYS, GROUPS } from './actions.js';
import { KEYS, SettingsWatcher } from './settings.js';

// Injected by Panel's constructor rather than imported, so this module loads
// under Vitest without gnome-shell's resource:// gettext. Assigned before any
// class below is constructed, because Panel.enable() is what constructs them.
let _;

/** The name shown on the tile and in its menu header. */
const TITLE = 'QuickTiler';

/**
 * The tile: a switch that pauses the keybindings, over a menu of the actions.
 *
 * No class fields anywhere in this file. A field initializes after super()
 * returns, which is after _init has already run, so a field would silently
 * overwrite whatever _init set — in real GJS and in tests/support/actors.js
 * alike.
 */
const QuickTilerToggle = GObject.registerClass(
    class QuickTilerToggle extends QuickSettings.QuickMenuToggle {
        /**
         * @param {object} options Injected dependencies.
         * @param {object} options.gicon Icon for the tile and the menu header.
         * @param {Gio.Settings} options.settings The extension's settings.
         * @param {(key: string) => void} options.onAction Perform one action.
         * @param {() => void} options.onOpenPreferences Open the preferences window.
         */
        _init({ gicon, settings, onAction, onOpenPreferences }) {
            super._init({ title: TITLE, gicon, toggleMode: true });

            this._gicon = gicon;
            this._settings = settings;
            this._onAction = onAction;
            this._onOpenPreferences = onOpenPreferences;

            // Schema key -> the St.Label showing that action's accelerator.
            // Kept so a rebinding can retext one label instead of rebuilding
            // the menu; see syncAccelerator().
            this._accelerators = new Map();
            this._menuBuilt = false;

            this.sync();

            this.connectObject('clicked', () => this._onClicked(), this);

            // The menu is built the first time it is opened, not here. It is
            // four sections, ten rows, ten St.Labels and a GSettings read per
            // row — and the extension is disabled on lock and re-enabled on
            // unlock, so all of it ran on the compositor's critical path at
            // every login and every unlock, for a menu many people never open.
            //
            // Nothing else needs it to exist: sync() only sets the header, and
            // syncAccelerator() already tolerates a row that is not there,
            // because a rebinding before the first open is picked up by the
            // get_strv the build itself does.
            this.menu.connectObject(
                'open-state-changed',
                (menu, open) => {
                    if (open) this._buildMenuOnce();
                },
                this,
            );
        }

        /** Build the menu, the first time it is opened. */
        _buildMenuOnce() {
            if (this._menuBuilt) return;
            this._menuBuilt = true;

            this._buildMenu();
        }

        /** Build the four sections, their rows, and the settings row. */
        _buildMenu() {
            for (const group of GROUPS) {
                const section = new PopupMenu.PopupSubMenuMenuItem(_(group.label));

                for (const action of ACTIONS_BY_GROUP.get(group.id))
                    section.menu.addMenuItem(this._actionRow(action));

                this.menu.addMenuItem(section);
            }

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const preferences = new PopupMenu.PopupMenuItem(_('Settings'));
            preferences.connectObject(
                'activate',
                () => this._onOpenPreferences(),
                this,
            );
            this.menu.addMenuItem(preferences);
        }

        /**
         * One action, labeled with the shortcut it currently holds.
         *
         * The row chains up to the default activate, so clicking it closes the
         * whole panel. That is right here and is the opposite of what a row
         * whose result appears in the menu should do: the result of tiling is a
         * window moving, and leaving a menu over it is the wrong answer.
         *
         * @param {{key: string, label: string}} action Action to build a row for.
         * @returns {PopupMenu.PopupMenuItem} The row.
         */
        _actionRow({ key, label }) {
            const row = new PopupMenu.PopupMenuItem(_(label));

            // So the accelerator sits hard right rather than beside the label.
            row.label.x_expand = true;

            const accelerator = new St.Label({
                text: bindingLabel(this._settings.get_strv(key)),
                y_align: Clutter.ActorAlign.CENTER,
                // Dimmed with the actor property rather than a style class, so
                // the bundle needs no stylesheet.css of its own.
                opacity: 160,
            });
            row.add_child(accelerator);
            this._accelerators.set(key, accelerator);

            row.connectObject('activate', () => this._onAction(key), this);

            return row;
        }

        /**
         * Retext one row after its shortcut was rebound.
         *
         * Deliberately not a rebuild. Nothing about a row's shape depends on
         * the accelerator — only one label's text does — so the rows are built
         * once and never replaced. That removes by construction the whole class
         * of bug where a row is destroyed while a click is still traveling
         * through it.
         *
         * @param {string} key Schema key whose accelerator changed.
         */
        syncAccelerator(key) {
            const label = this._accelerators.get(key);
            if (label) label.text = bindingLabel(this._settings.get_strv(key));
        }

        /** Show the pause state on the tile and in the menu header. */
        sync() {
            const enabled = this._settings.get_boolean(KEYS.SHORTCUTS_ENABLED);
            const subtitle = enabled ? _('Shortcuts active') : _('Shortcuts paused');

            // Set from the setting rather than left to toggleMode, which is
            // what makes the tile follow a change made in the preferences
            // window instead of drifting away from it.
            this.checked = enabled;
            this.subtitle = subtitle;
            this.menu.setHeader(this._gicon, _(TITLE), subtitle);
        }

        /** Write the pause; modules/quicktiler.js is what reacts to it. */
        _onClicked() {
            // toggleMode means the Shell has already flipped `checked`. Writing
            // the setting brings it back round through sync(), which re-asserts
            // it — so the tile and the preferences window cannot disagree.
            this._settings.set_boolean(KEYS.SHORTCUTS_ENABLED, this.checked);
        }

        /** Drop every handler this tile owns, including the rows'. */
        destroy() {
            // The rows carry their own 'activate' handlers, connected on the
            // rows. disconnectObject(this) releases what was connected on
            // *this*, so it does not reach them — destroying the rows is what
            // actually drops them.
            this.menu.removeAll();
            this._accelerators.clear();
            this.disconnectObject(this);

            super.destroy();
        }
    },
);

/** Owns the quick settings tile and the settings watches that feed it. */
export class Panel {
    /**
     * @param {object} options Injected dependencies.
     * @param {Gio.Settings} options.settings The extension's settings.
     * @param {string} options.iconPath Absolute path to the tile's icon.
     * @param {Function} [options.gettext] Translation function.
     * @param {(key: string, target: object|null) => void} [options.runAction]
     *   Perform one action on a window.
     * @param {() => void} [options.openPreferences] Open the preferences window.
     */
    constructor({ settings, iconPath, gettext, runAction, openPreferences }) {
        this._settings = settings;
        this._iconPath = iconPath;
        this._runAction = runAction ?? (() => {});
        this._openPreferences = openPreferences ?? (() => {});
        // Two groups with different lifetimes: the first pair of watches is
        // what brings the tile back after it is switched off, so it outlives
        // the tile; the accelerator watches only retext labels, so they go
        // when the labels do.
        this._watches = new SettingsWatcher(settings);
        this._tileWatches = new SettingsWatcher(settings);
        this._toggle = null;
        this._indicator = null;
        this._lastFocused = null;
        this._lastFocusedUnmanagedId = 0;

        _ = gettext ?? (message => message);
    }

    /** Watch the settings, and build the tile unless it is switched off. */
    enable() {
        // Watched even when the tile is hidden, so turning it on in the
        // preferences window brings it up without a re-enable.
        this._watches.watch(KEYS.SHOW_QUICK_SETTINGS, () => this._syncVisibility());
        this._watches.watch(KEYS.SHORTCUTS_ENABLED, () => this._toggle?.sync());

        this._syncVisibility();
    }

    /** Build or tear down the tile, to match the show-quick-settings key. */
    _syncVisibility() {
        if (this._settings.get_boolean(KEYS.SHOW_QUICK_SETTINGS)) this._build();
        else this._teardown();
    }

    /** Construct the tile and install it in the system menu. */
    _build() {
        if (this._indicator) return;

        const gicon = Gio.icon_new_for_string(this._iconPath);

        this._toggle = new QuickTilerToggle({
            gicon,
            settings: this._settings,
            onAction: key => this._runAction(key, this._lastFocused),
            onOpenPreferences: () => this._openPreferences(),
        });

        // A bare SystemIndicator, with no _addIndicator() call. A permanent top
        // bar icon that never changes is noise, and this extension does nothing
        // between keypresses that a status icon could report.
        this._indicator = new QuickSettings.SystemIndicator();
        this._indicator.quickSettingsItems.push(this._toggle);

        // The supported placement API, which puts the tile where the Shell
        // wants it relative to brightness and background apps, rather than
        // splicing it into _indicators at a chosen index.
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);

        // One watch per action rather than a single broad 'changed', which
        // fires for keys this file ignores. The explicit list is also the thing
        // a test can enumerate.
        for (const key of ACTION_KEYS)
            this._tileWatches.watch(key, () => this._toggle?.syncAccelerator(key));

        global.display.connectObject(
            'notify::focus-window',
            () => this._rememberFocus(),
            this,
        );
        this._rememberFocus();
    }

    /**
     * Keep the last window that was actually focused.
     *
     * Opening the quick settings menu takes a Clutter grab, and Mutter's focus
     * window can be null while it is held — so reading the display at the
     * moment a row is clicked can answer nothing at all, and the row would do
     * nothing with no way to tell. Remembering it here does not depend on the
     * answer either way; it is what _build's onAction hands to runAction.
     */
    _rememberFocus() {
        const window = global.display.get_focus_window();
        if (!window || window === this._lastFocused) return;

        this._forgetFocus();
        this._lastFocused = window;

        // Mutter unmanages a window when it closes, and focus does not always
        // move on afterwards — close the last window on a workspace and nothing
        // takes it. Without this the tile would hold that MetaWindow, keeping
        // it from being finalized, until something else was focused.
        this._lastFocusedUnmanagedId = window.connect('unmanaged', () =>
            this._forgetFocus(),
        );
    }

    /** Drop the remembered window, and the handler watching for its close. */
    _forgetFocus() {
        if (this._lastFocusedUnmanagedId) {
            this._lastFocused.disconnect(this._lastFocusedUnmanagedId);
            this._lastFocusedUnmanagedId = 0;
        }

        this._lastFocused = null;
    }

    /**
     * Destroy the tile and the watches that only it needed.
     *
     * The show-quick-settings and shortcuts-enabled watches stay: they are what
     * bring the tile back when it is switched on again, without a re-enable.
     */
    _teardown() {
        this._tileWatches.release();

        global.display.disconnectObject(this);

        // The Shell reparents quickSettingsItems into its own grid, so
        // destroying the indicator does not destroy the toggle. Both, in order.
        this._toggle?.destroy();
        this._toggle = null;

        this._indicator?.destroy();
        this._indicator = null;

        this._forgetFocus();
    }

    /** Release everything. */
    disable() {
        // Watches first: no changed:: callback may fire into an actor that is
        // about to be taken apart.
        this._watches.release();

        this._teardown();
    }
}
