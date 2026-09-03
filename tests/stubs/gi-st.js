// St, as far as modules/panel.js uses it.
//
// Only what the panel actually constructs. A stub that offers more than the
// code needs invites the code to start needing it, and nothing here would
// notice if the real St disagreed.

import { FakeActor } from '../support/actors.js';

class Label extends FakeActor {}

export default {
    Label,
};
