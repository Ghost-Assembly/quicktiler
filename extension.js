// QuickTiler — keyboard-driven zone tiling for GNOME Shell.
//
// The extension owns nothing but a settings object and a QuickTiler instance. There
// are no actors, no timers and no global signal connections, so between
// keypresses it costs exactly nothing.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { QuickTiler } from './modules/quicktiler.js';

export default class QuickTilerExtension extends Extension {
    enable() {
        this._quicktiler = new QuickTiler(this.getSettings());
        this._quicktiler.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(
            `[quicktiler] enabled (v${this.metadata['version-name'] ?? '?'})`,
        );
    }

    disable() {
        this._quicktiler?.disable();
        this._quicktiler = null;
    }
}
