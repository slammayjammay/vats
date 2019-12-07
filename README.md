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
For all events, a single object is passed to listeners. All events share the `name` (string) and `preventDefault` (function) properties.

- `command`: a command is entered via CommandMode.
  - `input`: (string) what the user entered
  - `argv`: (object) the input parsed by [minimist](https://www.npmjs.com/package/minimist)


- `command-mode:enter`: emitted before entering CommandMode.

- `command-mode:exit`: emitted after entering CommandMode.

- `keypress`: when the user presses a key.
  - `formatted`: (string) the formatted key string.
  - `char`: (string|undefined) argument from Node's `keypress` event
  - `key`: (object) argument from Node's `keypress` event


- `keybinding`: a recognized vi keybinding.
  - `keyString`: (string) the string of character(s) entered.
  - `action`: (string) the resulting keybinding action fired.
  - `count`: (number) how many times the action should be performed.
  - `readResults`: (object) any characters read by a "read" function, scoped by the key action. See the `register` keybinding example below.
  - `...rest`: (optional) any additional arguments provided.
  - TODO: `register`


- `search`: only if `getSearchableItems` option is given. will search items and emit the found index when searching with vi keybindings.
  - `index`: if an item is found, returns the item's index. otherwise `-1`.


- `state-change`: only if `getViState` option is given. when vi keybindings are recognized, they will automatically change the provided state.
  - `state`: (object) the vi state.


- `close`: when the program ends.

- `SIGINT`: a SIGINT signal was detected.

- `SIGCONT`: a SIGCONT signal was detected.

- `SIGTERM`: a SIGTERM signal was detected.

- `before-sig-stop` -- essentially a SIGSTOP signal. SIGSTOP signals cannot be caught or ignored, however certain keypresses ("ctrl+z") commonly send this signal. this event is emitted when those keys are pressed, and then the process is stopped immediately afterward.

Some events have default behavior attached to them, which can be stopped by calling `preventDefault`:
- `command`: performs a search if the command is `search`, `search-next`, or `search-previous`.
- `keypress`: sends SIGINT signal on `ctrl+c`; sends SIGSTOP signal on `ctrl+z`; checks if a keybinding can be emitted.
- `keybinding`: performs a search if keybinding is `search-next` or `search-previous`; updates vi state per keybinding action (if `options.getViState` is given); enters CommandMode if char is `:`, `/`, or `?`.

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

## Keybindings

See `keybindings.js` for default keybindings. Exports a `Map` instance with formatted keypress strings as keys and actions as values. `'j': 'cursor-down'`, `'down': 'cursor-down'`.

### Key strings

Key strings must be formatted correctly. The `InputHandler#formatCharKey` will take in the `char` and `key` parameters emitted by Node and return a correctly formatted string.

Meta keys must be in the correct order inside the key string and separated by plus signs (`+`). The correct order is `ctrl`, `option`, `meta`, `shift`. So the key string `ctrl+option+meta+shift+j` is valid and `shift+meta+option+ctrl+j` is not. Also, the key strings `shift+n` and `shift+1` are not valid; they should be `N` and `!`.

Key strings can be combined with spaces (see the keybinding `g g`). The resulting action will be fired when the user pressed the `g` key twice. Note that if the keybinding `g g` is set along with `g`, the desired behavior is ambiguous; the `g` keybinding will end up being ignored.

### Key actions

Actions can either be a string for the name of the keybinding or an object. If an object is given, its signature is:

- `action`: (string) the name of the keybinding action.
- `read`: (function, optional) the function to read additional characters.
- `resume`: (boolean, optional) whether to continue looking for a keybinding after the read function ends (only applicable if `read` is given).
- `...rest`: additional properties to include in the keybinding object (all properties above will be stripped out).

If `read` is given, `InputHandler` will delay firing a keybinding event and instead read an indefinite number of characters. The return value of the read function will determine when to stop reading for characters and which characters to store. For as long as the return value is not an array of strings, the read function will be called for all subsequent characters. When the return value is an array of strings, the return value will be stored inside `readResults`, scoped under the keybinding action string.

#### Read function example

User presses `4"ap`. In Vi, paste contents of register "a" 4 times.

```js
const vats = new Vats();

vats.setKeybinding('p', 'paste');
vats.setKeybinding('"', { action: 'register', read: (key) => [key], resume: true });

vats.on('keybinding', ({ charsEntered, action, count, readResults }) => {
  console.log(charsEntered, action, count, readResults);
  // => '4"ap', 'paste', 4, { register: 'a' }
});
```

If the register keybinding didn't set `resume: true`, the keybinding would fire immediately after the user enters `4"a`, and the keybinding action would be `register`.
