import { RealDebridUser } from '@/hooks/auth';
import { TorBoxUser } from '@/services/types';
import { BookOpen, Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface MainActionsProps {
	rdUser: RealDebridUser | null;
	tbUser: TorBoxUser | null;
	isLoading: boolean;
}

const isLocalDev = process.env.NODE_ENV === 'development';

export function MainActions({ rdUser, tbUser, isLoading }: MainActionsProps) {
	const hasStremio = rdUser || tbUser;

	return (
		<div className="grid w-full grid-cols-3 gap-3">
			<Link
				href="/library"
				className="haptic flex items-center justify-center gap-2 rounded border-2 border-cyan-500 bg-cyan-900/30 p-3 text-cyan-100 transition-colors hover:bg-cyan-800/50"
			>
				<BookOpen className="mr-1 inline-block h-4 w-4 text-cyan-400" />
				Library
			</Link>
			<Link
				href={isLocalDev ? '/hashlists' : 'https://hashlists.debridmediamanager.com'}
				target={isLocalDev ? undefined : '_blank'}
				className="haptic flex items-center justify-center gap-2 rounded border-2 border-indigo-500 bg-indigo-900/30 p-3 text-indigo-100 transition-colors hover:bg-indigo-800/50"
			>
				<Rocket className="mr-1 inline-block h-4 w-4 text-indigo-400" />
				Hash lists
			</Link>
			{rdUser && !tbUser && (
				<Link
					href="/stremio"
					className="haptic flex items-center justify-center gap-2 rounded border-2 border-green-500 bg-green-900/30 p-3 text-green-100 transition-colors hover:bg-green-800/50"
				>
					<Sparkles className="mr-1 inline-block h-4 w-4 text-green-400" />
					Stremio
				</Link>
			)}
			{tbUser && !rdUser && (
				<Link
					href="/stremio-torbox"
					className="haptic flex items-center justify-center gap-2 rounded border-2 border-purple-500 bg-purple-900/30 p-3 text-purple-100 transition-colors hover:bg-purple-800/50"
				>
					<Sparkles className="mr-1 inline-block h-4 w-4 text-purple-400" />
					Stremio
				</Link>
			)}
			{rdUser && tbUser && (
				<div className="flex gap-1">
					<Link
						href="/stremio"
						className="haptic flex flex-1 items-center justify-center gap-1 rounded border-2 border-green-500 bg-green-900/30 p-3 text-green-100 transition-colors hover:bg-green-800/50"
						title="DMM Cast for Real-Debrid"
					>
						<Sparkles className="inline-block h-4 w-4 text-green-400" />
						<span className="text-xs">RD</span>
					</Link>
					<Link
						href="/stremio-torbox"
						className="haptic flex flex-1 items-center justify-center gap-1 rounded border-2 border-purple-500 bg-purple-900/30 p-3 text-purple-100 transition-colors hover:bg-purple-800/50"
						title="DMM Cast for TorBox"
					>
						<Sparkles className="inline-block h-4 w-4 text-purple-400" />
						<span className="text-xs">TB</span>
					</Link>
				</div>
			)}
		</div>
	);
}
