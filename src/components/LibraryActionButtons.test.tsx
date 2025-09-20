import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import LibraryActionButtons from './LibraryActionButtons';

const createHandlers = () => ({
	onSelectShown: vi.fn(),
	onResetSelection: vi.fn(),
	onReinsertTorrents: vi.fn(),
	onGenerateHashlist: vi.fn(),
	onDeleteShownTorrents: vi.fn(),
	onAddMagnet: vi.fn(),
	onLocalRestore: vi.fn().mockResolvedValue(undefined),
	onLocalBackup: vi.fn().mockResolvedValue(undefined),
	onDedupeBySize: vi.fn(),
	onDedupeByRecency: vi.fn(),
	onCombineSameHash: vi.fn(),
});

const buttonByLabel = (label: string) =>
	screen.getByRole('button', {
		name: (name) => name.replace(/\u00a0/g, ' ') === label,
	});

const queryButtonByLabel = (label: string) =>
	screen.queryByRole('button', {
		name: (name) => name.replace(/\u00a0/g, ' ') === label,
	});

describe('LibraryActionButtons', () => {
	it('wires all actions when services and tools are available', async () => {
		const handlers = createHandlers();
		render(
			<LibraryActionButtons
				{...handlers}
				selectedTorrentsSize={2}
				rdKey="rd"
				adKey="ad"
				tbKey="tb"
				showDedupe
				showHashCombine
			/>
		);

		const user = userEvent.setup();

		await user.click(screen.getByRole('button', { name: /Select Shown/i }));
		expect(handlers.onSelectShown).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /Unselect All/i }));
		expect(handlers.onResetSelection).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /Reinsert \(2\)/i }));
		expect(handlers.onReinsertTorrents).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /Share \(2\)/i }));
		expect(handlers.onGenerateHashlist).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /Delete \(2\)/i }));
		expect(handlers.onDeleteShownTorrents).toHaveBeenCalledTimes(1);

		await user.click(buttonByLabel('RD Add'));
		expect(handlers.onAddMagnet).toHaveBeenCalledWith('rd');

		await user.click(buttonByLabel('AD Add'));
		expect(handlers.onAddMagnet).toHaveBeenCalledWith('ad');

		await user.click(buttonByLabel('TB Add'));
		expect(handlers.onAddMagnet).toHaveBeenCalledWith('tb');

		await user.click(screen.getByRole('button', { name: /RD Restore/i }));
		expect(handlers.onLocalRestore).toHaveBeenCalledWith('rd');

		await user.click(screen.getByRole('button', { name: /AD Restore/i }));
		expect(handlers.onLocalRestore).toHaveBeenCalledWith('ad');

		await user.click(screen.getByRole('button', { name: /TB Restore/i }));
		expect(handlers.onLocalRestore).toHaveBeenCalledWith('tb');

		await user.click(screen.getByRole('button', { name: /Backup/i }));
		expect(handlers.onLocalBackup).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /^Size/i }));
		expect(handlers.onDedupeBySize).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /^Date/i }));
		expect(handlers.onDedupeByRecency).toHaveBeenCalledTimes(1);

		await user.click(screen.getByRole('button', { name: /^Hash/i }));
		expect(handlers.onCombineSameHash).toHaveBeenCalledTimes(1);
	});

	it('hides optional controls when prerequisites are missing', () => {
		const handlers = createHandlers();
		render(
			<LibraryActionButtons
				{...handlers}
				selectedTorrentsSize={0}
				rdKey={null}
				adKey={null}
				showDedupe={false}
				showHashCombine={false}
			/>
		);

		expect(screen.getByRole('button', { name: /Reinsert List/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Share List/i })).toBeInTheDocument();
		expect(queryButtonByLabel('RD Add')).toBeNull();
		expect(queryButtonByLabel('AD Add')).toBeNull();
		expect(queryButtonByLabel('TB Add')).toBeNull();
		expect(screen.queryByRole('button', { name: /^Size/i })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Hash/i })).toBeNull();
	});
});
