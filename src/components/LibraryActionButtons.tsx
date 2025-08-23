import LibraryButton from './LibraryButton';

interface LibraryActionButtonsProps {
	onSelectShown: () => void;
	onResetSelection: () => void;
	onReinsertTorrents: () => void;
	onGenerateHashlist: () => void;
	onDeleteShownTorrents: () => void;
	onAddMagnet: (service: string) => void;
	onLocalRestore: (service: 'rd' | 'ad') => Promise<void>;
	onLocalBackup: () => Promise<void>;
	onDedupeBySize: () => void;
	onDedupeByRecency: () => void;
	onCombineSameHash: () => void;
	selectedTorrentsSize: number;
	rdKey: string | null;
	adKey: string | null;
	showDedupe: boolean;
	showHashCombine: boolean;
}

export default function LibraryActionButtons({
	onSelectShown,
	onResetSelection,
	onReinsertTorrents,
	onGenerateHashlist,
	onDeleteShownTorrents,
	onAddMagnet,
	onLocalRestore,
	onLocalBackup,
	onDedupeBySize,
	onDedupeByRecency,
	onCombineSameHash,
	selectedTorrentsSize,
	rdKey,
	adKey,
	showDedupe,
	showHashCombine,
}: LibraryActionButtonsProps) {
	return (
		<div className="mb-0 flex overflow-x-auto">
			<LibraryButton variant="orange" onClick={onSelectShown}>
				✅ Select Shown
			</LibraryButton>

			<LibraryButton variant="orange" onClick={onResetSelection}>
				❌ Unselect All
			</LibraryButton>

			<LibraryButton variant="green" onClick={onReinsertTorrents}>
				🔄 Reinsert{selectedTorrentsSize ? ` (${selectedTorrentsSize})` : ' List'}
			</LibraryButton>

			<LibraryButton variant="indigo" onClick={onGenerateHashlist}>
				🚀 Share{selectedTorrentsSize ? ` (${selectedTorrentsSize})` : ' List'}
			</LibraryButton>

			<LibraryButton variant="red" onClick={onDeleteShownTorrents}>
				🗑️ Delete{selectedTorrentsSize ? ` (${selectedTorrentsSize})` : ' List'}
			</LibraryButton>

			{rdKey && (
				<>
					<LibraryButton variant="teal" onClick={() => onAddMagnet('rd')}>
						🧲 RD&nbsp;Add
					</LibraryButton>
					<LibraryButton variant="indigo" onClick={() => onLocalRestore('rd')}>
						🪛 RD Restore
					</LibraryButton>
				</>
			)}

			{adKey && (
				<>
					<LibraryButton variant="teal" onClick={() => onAddMagnet('ad')}>
						🧲 AD&nbsp;Add
					</LibraryButton>
					<LibraryButton variant="indigo" onClick={() => onLocalRestore('ad')}>
						🪛 AD Restore
					</LibraryButton>
				</>
			)}

			<LibraryButton variant="indigo" onClick={onLocalBackup}>
				💾 Backup
			</LibraryButton>

			{showDedupe && (
				<>
					<LibraryButton variant="green" onClick={onDedupeBySize}>
						Size 🧹
					</LibraryButton>
					<LibraryButton variant="green" onClick={onDedupeByRecency}>
						Date 🧹
					</LibraryButton>
				</>
			)}

			{showHashCombine && (
				<LibraryButton variant="green" onClick={onCombineSameHash}>
					Hash 🧹
				</LibraryButton>
			)}
		</div>
	);
}
