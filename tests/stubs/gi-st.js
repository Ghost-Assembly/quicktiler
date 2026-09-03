// St, as far as modules/panel.js uses it.
//
// Only what the panel actually constructs. A stub that offers more than the
// code needs invites the code to start needing it, and nothing here would
// notice if the real St disagreed.

import { FakeActor } from '../support/actors.js';

class Widget extends FakeActor {}
class BoxLayout extends Widget {}
class Icon extends Widget {}
class Label extends Widget {}

export default {
    Widget,
    BoxLayout,
    Icon,
    Label,

    Align: { START: 0, MIDDLE: 1, END: 2 },
};
