import Head from 'next/head';
import Link from 'next/link';

const OfflinePage = () => (
	<>
		<Head>
			<title>Offline | Debrid Media Manager</title>
		</Head>
		<main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-center text-zinc-100">
			<h1 className="text-3xl font-semibold">Looks like you are offline</h1>
			<p className="max-w-md text-base text-zinc-300">
				Debrid Media Manager needs a connection to sync the latest catalog. When you are
				back online, refresh any page to continue.
			</p>
			<Link
				className="rounded-md bg-emerald-500 px-4 py-2 text-base font-medium text-black transition-colors hover:bg-emerald-400"
				href="/"
			>
				Go to start page
			</Link>
		</main>
	</>
);

export default OfflinePage;
