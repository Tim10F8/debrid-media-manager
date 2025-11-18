import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';

export default function PersonPage() {
	const router = useRouter();
	const personSlug = useMemo(() => {
		const raw = router.query.personSlug;
		return typeof raw === 'string' ? raw : '';
	}, [router.query.personSlug]);

	useEffect(() => {
		if (!router.isReady || !personSlug) return;
		void router.replace(`/person/${personSlug}/movies`);
	}, [router, personSlug]);

	return null;
}
