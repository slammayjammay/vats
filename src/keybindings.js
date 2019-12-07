// maps keys/chars to actions. keys/chars must be carefully formatted. actions
// can either be a string or an object with the key `action` pointing to a
// string. the object can also contain `read`, the name of a read function, to
// read additional characters. See README for more info.
module.exports = new Map([
	['escape', 'escape'],
	['enter', 'enter'],
	['return', 'enter'],

	['up', 'cursor-up'],
	['left', 'cursor-left'],
	['right', 'cursor-right'],
	['down', 'cursor-down'],

	['k', 'cursor-up'],
	['h', 'cursor-left'],
	['l', 'cursor-right'],
	['j', 'cursor-down'],

	['^', 'cursor-to-document-left'],
	['0', 'cursor-to-document-left'],
	['$', 'cursor-to-document-right'],
	['g g', 'cursor-to-document-top'],
	['G', 'cursor-to-document-bottom'],

	['H', 'cursor-to-window-top'],
	['M', 'cursor-to-window-middle'],
	['L', 'cursor-to-window-bottom'],

	['ctrl+f', 'scroll-full-window-down'],
	['ctrl+b', 'scroll-full-window-up'],
	['ctrl+d', 'scroll-half-window-down'],
	['ctrl+u', 'scroll-half-window-up'],

	['z t', 'scroll-cursor-to-window-top'],
	['z z', 'scroll-cursor-to-window-middle'],
	['z b', 'scroll-cursor-to-window-bottom'],

	['n', 'search-next'],
	['N', 'search-previous'],

	['f', { action: 'find', read: readOneChar }],

	[':', { action: 'enter-command-mode', commandAlias: null }],
	['/', { action: 'enter-command-mode', commandAlias: 'search-next' }],
	['?', { action: 'enter-command-mode', commandAlias: 'search-previous' }],

	['"', { action: 'register', read: readOneChar, resume: true }]
]);

function readOneChar(formattedChar, char, key) {
	return [formattedChar];
}