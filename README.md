# Vats
Inspired by `ranger`.

## Purpose
For interactive terminal applications that want to use some or all of VI functionality. Goal is to abstract away common and reusable VI features and allow a UI to be built on top. Some (many) VI features are specific for text editing and are more difficult to abstract, so are not to be implemented here.

## Does not implement:
- visual mode or insert mode
- anything UI-related, with CommandMode as the exception

## Features
- event-based (see Events section below)
- maps common VI keybindings and allows custom
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
- fleshed out keymaps
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

- `promptModeKeys` -- Enters prompt/command mode when these keys are pressed. Default: `:`, `/`, `?`.

- `promptModeOnBottom` -- Prompt/command mode is on bottom left of the screen (like vim). Default: `true`.

- `commandModeKeyMap` -- When CommandMode is entered on these keys, the values will be the commands they send. Default:
  - `/`: `search-next`
  - `?`: `search-previous`


- `getViState` -- A function that returns a `ViState`. Optional. If given, any recognized keybindings will update this state.

- `getSearchableItems` -- A function that returns an array of items. Optional. If given, will search through and emit the `search` event with the found index.

- `getSearchOptions` -- A function that returns options that will be passed to the `Searcher` instance. Optional.
