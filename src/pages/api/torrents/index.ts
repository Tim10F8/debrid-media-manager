import { RATE_LIMIT_CONFIGS, withIpRateLimit } from '@/services/rateLimit/withRateLimit';
import { repository } from '@/services/repository';
import * as v from '@badrap/valita';
import { Prisma } from '@prisma/client';
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
	api: {
		bodyParser: {
			sizeLimit: '10mb',
		},
	},
};

const GenericStream = v
	.object({
		index: v.number(),
		codec_name: v.string(),
		bit_rate: v.string(),
		tags: v.object({}).rest(v.string()).nullable(),
	})
	.rest(v.unknown());

const VideoStream = v.object({
	codec_type: v.literal('video'),
	avg_frame_rate: v.string(),
	profile: v.string(),
	pix_fmt: v.string(),
	level: v.number(),
	color_range: v.string(),
	width: v.number(),
	height: v.number(),
});

const AudioStream = v.object({
	codec_type: v.literal('audio'),
	channels: v.number(),
	channel_layout: v.string(),
	sample_fmt: v.string(),
	sample_rate: v.string(),
	tags: v
		.object({
			language: v.string(),
		})
		.rest(v.string())
		.nullable(),
});

const SubtitleStream = v.object({
	codec_type: v.literal('subtitle'),
	tags: v
		.object({
			language: v.string(),
		})
		.rest(v.string())
		.nullable(),
});

const Stream = GenericStream.rest(v.union(VideoStream, AudioStream, SubtitleStream)).rest(
	v.unknown()
);

const Format = v
	.object({
		filename: v.string(),
		nb_streams: v.number(),
		nb_programs: v.number(),
		format_name: v.string(),
		start_time: v.string(),
		duration: v.string(),
		size: v.string(),
		bit_rate: v.string(),
		probe_score: v.number(),
		tags: v.object({}).rest(v.string()).nullable(),
	})
	.rest(v.unknown());

const MediaInfo = v
	.object({
		streams: v.array(Stream),
		format: Format,
	})
	.rest(v.unknown());

const SelectedFile = v
	.object({
		State: v.literal('ok_file'),
		id: v.number(),
		path: v.string(),
		bytes: v.number(),
		selected: v.number(),
		Link: v.string(),
		Ended: v.string(),
		MediaInfo: MediaInfo,
	})
	.rest(v.unknown());

const TorrentSchema = v
	.object({
		Name: v.string(),
		OriginalName: v.string(),
		Hash: v.string(),
		SelectedFiles: v.object({}).rest(SelectedFile),
		Unfixable: v.literal(''),
		State: v.literal('ok_torrent'),
		Version: v.literal('0.10.0'),
		Added: v
			.string()
			.assert(
				(value) =>
					/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?$/.test(
						value
					),
				'Invalid format for "Added"'
			),
	})
	.rest(v.unknown());

const FIELDS_TO_REMOVE = ['DownloadedIDs', 'Rename', 'UnassignedLinks', 'Unfixable'];

function parseRequestBody(req: NextApiRequest): unknown {
	if (typeof req.body === 'string') {
		try {
			return JSON.parse(req.body);
		} catch (error) {
			console.error('Failed to parse JSON body', error);
			throw new Error('Invalid JSON body');
		}
	}
	return req.body;
}

function sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
	const sanitized: Record<string, unknown> = { ...payload };
	for (const field of FIELDS_TO_REMOVE) {
		delete sanitized[field];
	}
	return sanitized;
}

function extractHash(payload: Record<string, unknown>): string | null {
	const hash = (payload['Hash'] ?? payload['hash']) as unknown;
	return typeof hash === 'string' ? hash : null;
}

function deriveSnapshotId(hash: string, added: unknown): { id: string; date: Date } {
	let datePart = '';
	if (typeof added === 'string' && added.length >= 10) {
		datePart = added.slice(0, 10);
	}
	if (!datePart) {
		datePart = new Date().toISOString().slice(0, 10);
	}
	let addedDate = new Date(datePart);
	if (Number.isNaN(addedDate.getTime()) && typeof added === 'string') {
		addedDate = new Date(added);
	}
	if (Number.isNaN(addedDate.getTime())) {
		addedDate = new Date();
	}
	return {
		id: `${hash}:${datePart}`,
		date: addedDate,
	};
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
	if (req.method !== 'POST') {
		return res.status(405).json({ message: 'Method not allowed' });
	}

	let rawBody: unknown;
	try {
		rawBody = parseRequestBody(req);
	} catch (error) {
		return res.status(400).json({ message: 'Invalid JSON body' });
	}

	try {
		TorrentSchema.parse(rawBody);
	} catch (error) {
		console.error(error);
		return res.status(400).json({ message: 'Invalid torrent payload' });
	}

	const payload = sanitizePayload((rawBody ?? {}) as Record<string, unknown>);
	const hash = extractHash(payload);

	if (!hash) {
		console.error('Validated payload missing hash');
		return res.status(400).json({ message: 'Missing torrent hash' });
	}

	const addedValue = (payload['Added'] ?? payload['added']) as string | undefined;
	const { id, date } = deriveSnapshotId(hash, addedValue);

	try {
		await repository.upsertTorrentSnapshot({
			id,
			hash,
			addedDate: date,
			payload: payload as Prisma.InputJsonValue,
		});
	} catch (error) {
		console.error('Failed to persist torrent snapshot', error);
		return res.status(500).json({ message: 'Internal server error' });
	}

	return res.status(201).json({ success: true, id });
}

export default withIpRateLimit(handler, RATE_LIMIT_CONFIGS.torrents);
