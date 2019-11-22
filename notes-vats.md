# Vats
## Purpose
For interactive terminal applications that want to use some or all of VI
functionality. Inspired by ranger; goal is to abstract away common and reusable
VI features and allow a UI to be built on top. Some (many) VI features are
specific for text editing and are more difficult to abstract, so are not to be
implemented here.

## Does not implement:
- anything UI-related, with these optional exceptions:
  - command mode input at bottom of screen
  - info footer
- visual mode or insert mode

## Features
- maps common VI keybindings
- implements normal mode and command mode
- implements info footer
- stores and calculates state (cursor positions, scroll position, etc.)
- VI modes:
  - normal mode
  - command mode
- input modes:
  - Raw: keypress events
  - Cooked: minimal input functionality
  - Other
    - Provides Node Readline behavior out of box
    - Allows other input functionality (e.g. inquirer)
- features TODO:
  - registers

## State
- How to handle state?
- How to handle multiple states (panes/tabs)?
- Needs to be an association between UI and Vats so that correct state can be
calculated

### State properties
- documentWidth
- documentHeight
- windowWidth
- windowHeight
- scrollX
- scrollY
- cursorX
- cursorY

### Psuedo code POC

```js
const VI_STATE_PROPS = [
  'documentWidth',
  'documentHeight',
  'windowWidth',
  'windowHeight',
  'scrollX',
  'scrollY',
  'cursorX',
  'cursorY'
];

function updateViState(from, diff, output = {}) {
  const diffEntries = Object.entries(diff);

  if (!diff || diffEntries.length === 0) {
    return from;
  }

  output = output === true ? from : { ...from, ...output };

  // need to make sure that cursor remains inside the window. this can either
  // be done by changing the cursor position or scrolling the window, depending
  // on what the action is inside `diff`. if `diff` sets either the scroll
  // or cursor positions, but not both, then the position not set might need to
  // be adjusted so that the cursor remains inside the window. if `diff` sets
  // both values, there are two choices available: 1) assume both values do not
  // need to be adjusted or 2) adjust the cursor position.

  const prevState = { ...from };

  const adjustCursorX = diff.cursorX !== undefined && diff.scrollX === undefined;
  const adjustCursorY = diff.cursorY !== undefined && diff.scrollY === undefined;

  diffEntries.forEach(([key, val]) => output[key] = val);

  if (adjustCursorX) {
    output.cursorX = correctCursorX(output.cursorX, prevState);
  } else {
    output.scrollX = correctScrollX(output.scrollX, prevState);
  }

  if (adjustCursorY) {
    output.cursorY = correctCursorY(output.cursorY, prevState);
  } else {
    output.scrollY = correctScrollY(output.scrollY, prevState);
  }

  return output;
}

function defaultBehaviorForKeybinding({ keyAction }) {
  const state = this.options.getViState();
  const diff = getViStateDiffForKeybinding(keyAction);
  const newState = updateViState(state, diff, this.options.updateViStateOnKeybinding);

  !areStatesEqual(state, newState) && this.emit('state-change', newState);
}

function getViStateDiffForKeybinding(viKeyString) {
  const diff = {};

  if (viKeyString === 'vi:cursor-down') {
    diff.cursorY = state.cursorY + 1;
  } else if (viKeyString === 'vi:cursor-left') {
    diff.cursorX = state.cursorX - 1;
  } else if (viKeyString === 'vi:scroll-full-page-down') {
    diff.cursorY = state.cursorY + state.windowHeight;
    diff.scrollY = state.scrollY + state.windowHeight;
  }

  return diff;
}

areStatesEqual(state1, state2) {
  for (const key of VI_STATE_PROPS) {
    if (state1[key] !== state2[key]) {
      return false;
    }
  }

  return true;
}
```

