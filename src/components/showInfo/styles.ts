export const buttonStyles = {
	download:
		'border-2 border-blue-500 bg-blue-900/30 text-blue-100 hover:bg-blue-800/50 transition-colors',
	watch: 'border-2 border-teal-500 bg-teal-900/30 text-teal-100 hover:bg-teal-800/50 transition-colors',
	cast: 'border-2 border-gray-500 bg-gray-900/30 text-gray-100 hover:bg-gray-800/50 transition-colors',
	castAll: 'border-2 border-gray-500 bg-gray-900/30 text-gray-100 hover:bg-gray-800/50',
	share: 'border-2 border-indigo-500 bg-indigo-900/30 text-indigo-100 hover:bg-indigo-800/50',
	delete: 'border-2 border-red-500 bg-red-900/30 text-red-100 hover:bg-red-800/50',
	magnet: 'border-2 border-pink-500 bg-pink-900/30 text-pink-100 hover:bg-pink-800/50',
	reinsert: 'border-2 border-green-500 bg-green-900/30 text-green-100 hover:bg-green-800/50',
	downloadAll: 'border-2 border-blue-500 bg-blue-900/30 text-blue-100 hover:bg-blue-800/50',
	exportLinks: 'border-2 border-sky-500 bg-sky-900/30 text-sky-100 hover:bg-sky-800/50',
	generateStrm:
		'border-2 border-purple-500 bg-purple-900/30 text-purple-100 hover:bg-purple-800/50',
};

// These are inline SVG strings because this component generates HTML for Swal popups
// The SVGs are from lucide-react icons, just in string format for compatibility
export const icons = {
	download:
		'<svg class="inline-block w-3 h-3 mr-1" style="color: #60a5fa;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
	watch: '<svg class="inline-block w-3 h-3 mr-1" style="color: #5eead4;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
	cast: '<svg class="inline-block w-3 h-3 mr-1" style="color: #9ca3af;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m5 7 5 5-5 5"/><path d="m12 19 7-7-7-7"/></svg>',
	castAll:
		'<svg class="inline-block w-3 h-3 mr-1" style="color: #9ca3af;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m5 7 5 5-5 5"/><path d="m12 19 7-7-7-7"/></svg>',
	share: '<svg class="inline-block w-4 h-4 mr-1" style="color: #a78bfa;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>',
	delete: '<svg class="inline-block w-4 h-4 mr-1" style="color: #f87171;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
	magnet: '<svg class="inline-block w-4 h-4 mr-1" style="color: #f9a8d4;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m10 13 5-5m0 0-5-5m5 5H3m18 0a9 9 0 11-9-9 9 9 0 019 9z"></path></svg>',
	reinsert:
		'<svg class="inline-block w-4 h-4 mr-1" style="color: #6ee7b7;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>',
	downloadAll:
		'<svg class="inline-block w-4 h-4 mr-1" style="color: #60a5fa;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
	exportLinks:
		'<svg class="inline-block w-4 h-4 mr-1" style="color: #7dd3fc;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
	generateStrm:
		'<svg class="inline-block w-4 h-4 mr-1" style="color: #c084fc;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>',
	saveSelection:
		'<svg class="inline w-4 h-4" style="color: #10b981;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
	selectVideos:
		'<svg class="inline w-4 h-4" style="color: #3b82f6;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
	unselectAll:
		'<svg class="inline w-4 h-4" style="color: #ef4444;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
	reset: '<svg class="inline-block w-4 h-4 mr-1" style="color: #eab308;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>',
};

export const defaultLabels = {
	download: 'Download',
	watch: 'Watch',
	cast: 'Cast',
	castAll: 'Cast',
	share: 'Hashlist',
	delete: 'Delete',
	magnet: 'Copy',
	reinsert: 'Reinsert',
	downloadAll: 'Download All',
	exportLinks: 'Get Links',
	generateStrm: 'STRM Files',
};
