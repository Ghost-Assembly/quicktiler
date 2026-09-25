// QuickTiler — keyboard-driven zone tiling for GNOME Shell.
//
// This file is deliberately thin: it owns a settings object, a QuickTiler and a
// Panel, and its only real job is pairing each construction with a teardown.
//
// There are no timers. There are actors, and one global signal — the display's
// notify::focus-window, which lets a menu row act on the window that was
// focused before the menu opened — but only for the quick settings tile, and
// only while show-quick-settings is on. Switch it off and the extension goes
// back to holding nothing but keybindings and its settings watches.

import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';

import { Panel } from './modules/panel.js';
import { QuickTiler } from './modules/quicktiler.js';

export default class QuickTilerExtension extends Extension {
    enable() {
        const settings = this.getSettings();

        // QuickTiler first: the Panel's rows call into it, so it must be
        // enabled before anything can click one.
        this._quicktiler = new QuickTiler(settings);
        this._quicktiler.enable();

        this._panel = new Panel({
            settings,
            iconPath: `${this.path}/icons/quicktiler-symbolic.svg`,
            gettext: _,
            // A bound method rather than an arrow, so modules/panel.js holds
            // the QuickTiler and nothing else. An arrow defined here would
            // capture `this` — the Extension, and with it enable()'s whole
            // scope — which is the reach this indirection exists to deny.
            runAction: this._quicktiler.run.bind(this._quicktiler),
            // This one genuinely needs the Extension: openPreferences is the
            // Extension's own method and there is nothing smaller to hold.
            openPreferences: () => this.openPreferences(),
        });
        this._panel.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(
            `[quicktiler] enabled (v${this.metadata['version-name'] ?? '?'})`,
        );
    }

    disable() {
        // The inverse of enable(). The Panel is the only thing that calls into
        // QuickTiler, so releasing it first means nothing can reach a
        // half-disabled one.
        this._panel?.disable();
        this._panel = null;

        this._quicktiler?.disable();
        this._quicktiler = null;
    }
}
