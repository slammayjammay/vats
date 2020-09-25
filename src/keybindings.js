module.exports = new Map([
	['up', { name: 'cursor-up', type: 'cursor-move' }],
	['down', { name: 'cursor-down', type: 'cursor-move' }],
	['left', { name: 'cursor-left', type: 'cursor-move' }],
	['right', { name: 'cursor-right', type: 'cursor-move' }],

	['k', { name: 'cursor-up', type: 'cursor-move' }],
	['j', { name: 'cursor-down', type: 'cursor-move' }],
	['h', { name: 'cursor-left', type: 'cursor-move' }],
	['l', { name: 'cursor-right', type: 'cursor-move' }],

	['^', { name: 'cursor-to-document-left', type: 'cursor-move' }],
	['0', { name: 'cursor-to-document-left', type: 'cursor-move' }],
	['$', { name: 'cursor-to-document-right', type: 'cursor-move' }],
	['G', { name: 'cursor-to-document-bottom', type: 'cursor-move' }],

	['H', { name: 'cursor-to-window-top', type: 'cursor-move' }],
	['M', { name: 'cursor-to-window-middle', type: 'cursor-move' }],
	['L', { name: 'cursor-to-window-bottom', type: 'cursor-move' }],

	['ctrl+f', { name: 'scroll-full-window-down', type: 'cursor-move' }],
	['ctrl+b', { name: 'scroll-full-window-up', type: 'cursor-move' }],
	['ctrl+d', { name: 'scroll-half-window-down', type: 'cursor-move' }],
	['ctrl+u', { name: 'scroll-half-window-up', type: 'cursor-move' }],

	[':', { name: 'enter-command-mode', type: 'command-mode' }],
	['/', { name: 'enter-command-mode', type: 'command-mode', command: 'search-next' }],
	['?', { name: 'enter-command-mode', type: 'command-mode', command: 'search-previous' }],

	['n', { name: 'search-next', type: 'cursor-move' }],
	['N', { name: 'search-previous', type: 'cursor-move' }],

	['g', {
		keybindings: new Map([
			['g', { name: 'cursor-to-document-top', type: 'cursor-move' }]
		])
	}],

	['z', {
		keybindings: new Map([
			['t', { name: 'scroll-cursor-to-window-top', type: 'cursor-move' }],
			['z', { name: 'scroll-cursor-to-window-middle', type: 'cursor-move' }],
			['b', { name: 'scroll-cursor-to-window-bottom', type: 'cursor-move' }],
		])
	}],

	['f', {
		name: 'find',
		behavior: ({ read, done }, kb) => {
			read(1, keys => {
				kb.store.find = keys[0];
				done();
			});
		}
	}],

	['"', {
		name: 'register',
		behavior: ({ read, done }, kb) => {
			read(1, keys => {
				kb.store.register = keys[0];
				done();
			});
		}
	}]
]);
