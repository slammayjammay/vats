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
- implements info footer
- calculates state (cursor positions, scroll position, etc.)
- implements VI modes:
  - normal mode
  - command mode
- implements input modes:
  - Raw (enables keypress events)
  - Cooked: minimal input functionality using Node's readline
  - Allows other input functionality (e.g. inquirer)
- features TODO:
  - registers

### State properties
- documentWidth
- documentHeight
- windowWidth
- windowHeight
- scrollX
- scrollY
- cursorX
- cursorY
