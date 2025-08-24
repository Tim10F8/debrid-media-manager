import { RealDebridUser } from '@/hooks/auth';
import { BookOpen, Rocket, Sparkles } from 'lucide-react';
import Link from 'next/link';

interface MainActionsProps {
	rdUser: RealDebridUser | null;
	isLoading: boolean;
}

export function MainActions({ rdUser, isLoading }: MainActionsProps) {
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
				href="https://hashlists.debridmediamanager.com"
				target="_blank"
				className="haptic flex items-center justify-center gap-2 rounded border-2 border-indigo-500 bg-indigo-900/30 p-3 text-indigo-100 transition-colors hover:bg-indigo-800/50"
			>
				<Rocket className="mr-1 inline-block h-4 w-4 text-indigo-400" />
				Hash lists
			</Link>
			{rdUser && (
				<Link
					href="/stremio"
					className="haptic flex items-center justify-center gap-2 rounded border-2 border-purple-500 bg-purple-900/30 p-3 text-purple-100 transition-colors hover:bg-purple-800/50"
				>
					<Sparkles className="mr-1 inline-block h-4 w-4 text-purple-400" />
					Stremio
				</Link>
			)}
		</div>
	);
}
