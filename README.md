# Vats
Inspired by `ranger`.

## Purpose
For interactive terminal applications that want to use some or all of VI functionality. Goal is to abstract away common and reusable VI features and allow a UI to be built on top. Some (many) VI features are specific for text editing and are more difficult to abstract, so are not to be implemented here.

## Does not implement:
- visual mode or insert mode
- anything UI-related, with CommandMode as the exception

## Features
- event-based (see Events section below)
- maps common VI keybindings and allows custom maps
- calculates state (cursor positions, scroll position, etc.)
- implements VI modes:
  - normal mode
  - command mode that uses minimist
- implements input modes:
  - Raw (enables keypress events)
  - Cooked: minimal input functionality using Node's readline
  - Allows other input functionality (e.g. inquirer)
- searching

## Features TODO
- registers

## Events
List of events emitted:
- `command` -- a command is entered via CommandMode.

- `command-mode:enter` -- emitted before entering CommandMode.

- `command-mode:exit` -- emitted after entering CommandMode.

- `keypress` -- when the user presses a key.

- `keybinding` -- a recognized vi keybinding.

- `search` -- only if `getSearchableItems` option is given. will search items and emit the found index when searching with vi keybindings.

- `state-change` -- only if `getViState` option is given. when vi keybindings are recognized, they will automatically change the provided state.

- `close` -- when the program ends.

- `SIGINT` -- a SIGINT signal was detected.

- `SIGCONT` -- a SIGCONT signal was detected.

- `SIGTERM` -- a SIGTERM signal was detected.

- `before-sig-stop` -- essentially a SIGSTOP signal. SIGSTOP signals cannot be caught or ignored, however certain keypresses ("ctrl+z") commonly send this signal. this event is emitted when those keys are pressed, and then the process is stopped immediately afterward.

## Options

- `commandModeOnBottom` -- CommandMode is on bottom left of the screen (like vim). Default: `true`.

- `getViState` -- A function that returns a `ViState`. Optional. If given, any recognized keybindings will update this state.

- `getSearchableItems` -- A function that returns an array of items. Optional. If given, will search through and emit the `search` event with the found index.

- `getSearchOptions` -- A function that returns options that will be passed to the `Searcher` instance. Optional.

## Vi State
A Vi state is an object with the following properties:
- `documentWidth`: the entire width of navigable content
- `documentHeight`: the entire height of navigable content
- `windowWidth`: the width of visible content
- `windowHeight`: the height of visible content
- `cursorX`: the cursor's horizontal position
- `cursorY`: the cursor's vertical position
- `scrollX`: the window's offset from the left
- `scrollY`: the window's offset from the top

See `ViStateHandler` for how state is updated. It ensures that the cursor always remains inside the window, and the window always remains inside the document.

## Keymaps
See `keymap.js` for default keybindings. It exports a `Map` instance with keypress strings as keys and actions as values. `'j': 'cursor-down'`, `'DOWN_ARROW': 'cursor-down'`.

Keys strings must be formatted correctly. The `InputHandler#formatCharKey` will take in the `char` and `key` parameters emitted by Node and return a correctly formatted string.

Meta keys must be in the correct order. if you press `j` while holding the keys `option`, `meta`, `shift`, and `ctrl`, the formatted string becomes `ctrl+option+meta+shift+j`, with the meta keys listed in that order. This formatting is also done inside `InputHandler#formatCharKey`. Note that the formatted string for the char `N` is `N`, not `shift+n`. Similarly, the key `!` is valid whereas `shift+1` is not.

Key strings can be combined with spaces (see the keymap `g g`). The resulting action will be fired when the user pressed the `g` key twice. Note that if the keymap `g g` is set along with `g`, the desired behavior is ambiguous -- `g` will end up being ignored (as a `keybinding`. It's still available in `keypress` events however).

Actions can be strings or objects. If an object is given, its signature is:
  - `action`: (string) the action to send
  - `read`: (string, optional) the name of the read function for additional characters
  - `...rest`: additional properties to include in the keybinding object

If `read` is given, `InputHandler` will delay firing a keybinding event and instead read an indefinite number of characters. The number of characters read and the characters sent is up to the read function. For more info on read functions, see the `InputHandler#readOneChar` function and the `InputHandler.readFunctions` map.

Any other properties in the given object will be included in the keybinding event. `action` and `read` will be stripped out.
