// Tiler — keyboard-driven zone tiling for GNOME Shell.
//
// The extension owns nothing but a settings object and a Tiler instance. There
// are no actors, no timers and no global signal connections, so between
// keypresses it costs exactly nothing.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Tiler } from './modules/tiler.js';

export default class TilerExtension extends Extension {
    enable() {
        this._tiler = new Tiler(this.getSettings());
        this._tiler.enable();

        // scripts/headless-check.sh greps for this line; keep the prefix stable.
        console.debug(`[tiler] enabled (v${this.metadata['version-name'] ?? '?'})`);
    }

    disable() {
        this._tiler?.disable();
        this._tiler = null;
    }
}
