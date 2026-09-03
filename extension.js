// QuickTiler — keyboard-driven zone tiling for GNOME Shell.
//
// This file is deliberately thin: it owns a settings object, a QuickTiler and a
// Panel, and its only real job is pairing each construction with a teardown.
//
// There are no timers and no work between keypresses. There are actors, but
// only the quick settings tile, and only while show-quick-settings is on —
// switch it off and the extension goes back to holding nothing but keybindings.

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
            // A callback rather than `this`, so modules/panel.js never holds
            // the Extension and cannot reach the rest of it.
            runAction: (key, target) => this._quicktiler.run(key, target),
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
