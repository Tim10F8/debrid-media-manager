interface ProxyRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: any;
}

interface ProxyResponse {
	response?: any;
	error?: string;
}

class IframeProxy {
	private iframe: HTMLIFrameElement | null = null;
	private messageId = 0;
	private pendingRequests = new Map<
		number,
		{
			resolve: (value: any) => void;
			reject: (reason: any) => void;
		}
	>();
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.initPromise = this.initialize();
		}
	}

	private async initialize(): Promise<void> {
		if (this.initialized) return;

		return new Promise((resolve) => {
			// Create iframe
			this.iframe = document.createElement('iframe');
			this.iframe.src = 'https://localhost.debridmediamanager.com';
			this.iframe.style.display = 'none';
			document.body.appendChild(this.iframe);

			// Setup message listener
			window.addEventListener('message', this.handleMessage.bind(this));

			// Wait for iframe to load
			this.iframe.onload = () => {
				this.initialized = true;
				resolve();
			};
		});
	}

	private handleMessage(event: MessageEvent) {
		// Only accept messages from the proxy iframe
		if (event.origin !== 'https://localhost.debridmediamanager.com') {
			return;
		}

		const { messageId, response, error } = event.data;
		const pending = this.pendingRequests.get(messageId);

		if (pending) {
			this.pendingRequests.delete(messageId);
			if (error) {
				pending.reject(new Error(error));
			} else {
				pending.resolve(response);
			}
		}
	}

	async request(request: ProxyRequest): Promise<any> {
		// Ensure iframe is initialized
		if (this.initPromise) {
			await this.initPromise;
		}

		if (!this.iframe || !this.initialized) {
			throw new Error('IframeProxy not initialized');
		}

		const messageId = ++this.messageId;

		return new Promise((resolve, reject) => {
			// Store the promise handlers
			this.pendingRequests.set(messageId, { resolve, reject });

			// Send message to iframe
			this.iframe!.contentWindow?.postMessage(
				{
					messageId,
					...request,
				},
				'https://localhost.debridmediamanager.com'
			);

			// Timeout after 30 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(messageId)) {
					this.pendingRequests.delete(messageId);
					reject(new Error('Request timeout'));
				}
			}, 30000);
		});
	}

	async uploadTorrentFile(accessToken: string, file: File): Promise<string> {
		// Convert file to base64 or array buffer
		const arrayBuffer = await file.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);

		const response = await this.request({
			url: 'https://app.real-debrid.com/rest/1.0/torrents/addTorrent',
			method: 'PUT',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/octet-stream',
			},
			body: Array.from(uint8Array), // Convert to regular array for JSON serialization
		});

		if (!response?.id) {
			throw new Error('Failed to upload torrent file via iframe proxy');
		}

		return response.id;
	}

	destroy() {
		if (this.iframe && this.iframe.parentNode) {
			this.iframe.parentNode.removeChild(this.iframe);
		}
		this.iframe = null;
		this.initialized = false;
		this.pendingRequests.clear();
	}
}

// Singleton instance
let proxyInstance: IframeProxy | null = null;

export const getIframeProxy = (): IframeProxy => {
	if (typeof window === 'undefined') {
		throw new Error('IframeProxy can only be used in browser environment');
	}

	if (!proxyInstance) {
		proxyInstance = new IframeProxy();
	}

	return proxyInstance;
};
