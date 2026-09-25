// A recording stand-in for a Clutter actor.
//
// The stubs under tests/stubs/ are built on this. It exists so that
// tests/panel.test.js can assert QuickTiler's own bookkeeping — how many handlers
// are connected, how many are left after destroy, which children were added —
// rather than asserting that a stub behaves like a stub.
//
// It models only what modules/panel.js actually touches. That is the same rule
// the `destroyed` note below records the cost of breaking: a stub method with a
// plausible name is an invitation for production code to start depending on it,
// and the suite cannot tell the difference between a real API and a fake one.
//
// GObject subclasses in gnome-shell are constructed through _init rather than a
// constructor, so the base here calls _init from its constructor and
// registerClass is the identity. That is why nothing in modules/panel.js may
// use class fields: they initialize after super() returns, which is after
// _init has already run — exactly as in real GJS.

/** Handlers connected anywhere, so a test can prove they were all released. */
export const liveHandlers = new Set();

// Per emitter, as gnome-shell's signalTracker.js is: emitter.disconnectObject
// (owner) releases only the handlers on THAT emitter. A stub that released an
// owner's handlers on every emitter at once would let the panel forget one
// and still look leak-free here.

/** Reset between tests. */
export function resetActors() {
    liveHandlers.clear();
}

let nextHandlerId = 1;

/** The behavior every fake actor and menu item shares. */
export class FakeActor {
    constructor(...args) {
        this.children = [];
        this._parentActor = null;

        // Underscored on purpose. This is the stub's own bookkeeping, not an
        // API that exists: ClutterActor installs no `destroyed` property and
        // gnome-shell never reads one. A stub that offers a plausible-looking
        // name invites production code to depend on it, which is exactly what
        // happened — a guard reading `row.destroyed` was dead in a real Shell
        // and green in this suite.
        this._wasDestroyed = false;

        // Handler id -> {signal, callback, owner}
        this.handlers = new Map();

        this._init(...args);
    }

    /**
     * @param {object} [props] Properties to assign, as GJS does.
     */
    _init(props = {}) {
        Object.assign(this, props);
    }

    connect(signal, callback) {
        const id = nextHandlerId++;
        this.handlers.set(id, { signal, callback, owner: null });
        liveHandlers.add(id);
        return id;
    }

    disconnect(id) {
        this.handlers.delete(id);
        liveHandlers.delete(id);
    }

    /** gnome-shell's owner-scoped connect, which modules/panel.js uses throughout. */
    connectObject(...args) {
        const owner = args.pop();
        while (args.length >= 2) {
            const [signal, callback] = args.splice(0, 2);
            const id = nextHandlerId++;
            this.handlers.set(id, { signal, callback, owner });
            liveHandlers.add(id);
        }
    }

    disconnectObject(owner) {
        for (const [id, handler] of [...this.handlers])
            if (handler.owner === owner) this.disconnect(id);
    }

    /** Fire every handler for a signal, as the Shell would. */
    emit(signal, ...args) {
        for (const handler of [...this.handlers.values()])
            if (handler.signal === signal) handler.callback(this, ...args);
    }

    add_child(child) {
        this.children.push(child);
        child._parentActor = this;
    }

    remove_all_children() {
        for (const child of this.children) child._parentActor = null;
        this.children = [];
    }

    /** Real API, unlike the removed `destroyed`. Null once unparented. */
    get_parent() {
        return this._parentActor;
    }

    destroy() {
        this._wasDestroyed = true;
        this._parentActor = null;
        for (const id of [...this.handlers.keys()]) this.disconnect(id);

        for (const child of this.children) child.destroy?.();
        this.children = [];
    }
}
