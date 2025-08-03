import { torrentScraper } from './src/utils/torrentScraper';

const testHash = 'ba0e267579fa62981795dcc059fb61e1af5ca429';

async function test() {
    console.log(`Testing scrape for hash: ${testHash}`);
    try {
        const stats = await torrentScraper.scrapeTorrent(testHash);
        console.log('Scrape results:', stats);
    } catch (error) {
        console.error('Error:', error);
    }
}

test();