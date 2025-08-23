import Link from 'next/link';
import { ReactNode } from 'react';

type ButtonVariant = 'orange' | 'yellow' | 'amber' | 'slate';

interface LibraryLinkButtonProps {
	href: string;
	variant: ButtonVariant;
	children: ReactNode;
	size?: 'xs' | 'sm';
	onClick?: (e: React.MouseEvent) => void;
}

const variantStyles: Record<ButtonVariant, string> = {
	orange: 'border-orange-500 bg-orange-900/30 text-orange-100 hover:bg-orange-800/50',
	yellow: 'border-yellow-500 bg-yellow-900/30 text-yellow-100 hover:bg-yellow-800/50',
	amber: 'border-amber-500 bg-amber-900/30 text-amber-100 hover:bg-amber-800/50',
	slate: 'border-slate-500 bg-slate-900/30 text-slate-100 hover:bg-slate-800/50',
};

export default function LibraryLinkButton({
	href,
	variant,
	children,
	size = 'xs',
	onClick,
}: LibraryLinkButtonProps) {
	const sizeClasses = size === 'xs' ? 'text-xs py-0.5' : 'text-xs py-0';

	return (
		<Link
			href={href}
			className={`mb-1 mr-2 rounded border-2 px-1 ${sizeClasses} ${variantStyles[variant]} transition-colors`}
			onClick={onClick}
		>
			{children}
		</Link>
	);
}
