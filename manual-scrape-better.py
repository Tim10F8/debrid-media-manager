#!/usr/bin/env python3
"""
Improved BitTorrent tracker scraping with proper bencode support
"""

import urllib.parse
import requests
import bencodepy
import binascii
from urllib.parse import urlparse

# The torrent hash we want to check
info_hash = "ba0e267579fa62981795dcc059fb61e1af5ca429"

def scrape_http_tracker(tracker_url, info_hash_hex):
    """Scrape an HTTP/HTTPS tracker with proper bencode parsing"""
    
    # Convert hex to binary
    info_hash_bytes = bytes.fromhex(info_hash_hex)
    
    # Replace 'announce' with 'scrape' in the URL
    if '/announce' in tracker_url:
        scrape_url = tracker_url.replace('/announce', '/scrape')
    else:
        scrape_url = tracker_url.rstrip('/') + '/scrape'
    
    try:
        print(f"Scraping {scrape_url}")
        
        # Send GET request with info_hash as raw bytes
        response = requests.get(
            scrape_url,
            params={'info_hash': info_hash_bytes},
            timeout=10,
            headers={'User-Agent': 'DMM-Scraper/1.0'}
        )
        
        if response.status_code == 200:
            # Decode bencode response
            try:
                data = bencodepy.decode(response.content)
                
                # The response structure is usually:
                # {b'files': {<info_hash_bytes>: {b'complete': X, b'incomplete': Y, b'downloaded': Z}}}
                if b'files' in data:
                    files = data[b'files']
                    # Look for our info hash in the files dict
                    if info_hash_bytes in files:
                        stats = files[info_hash_bytes]
                        seeders = stats.get(b'complete', 0)
                        leechers = stats.get(b'incomplete', 0)
                        downloads = stats.get(b'downloaded', 0)
                        print(f"✓ Seeders: {seeders}, Leechers: {leechers}, Downloads: {downloads}")
                        return {'seeders': seeders, 'leechers': leechers, 'downloads': downloads}
                    else:
                        print(f"✗ Info hash not found in response")
                else:
                    print(f"✗ No 'files' key in response")
                    print(f"Response keys: {list(data.keys())}")
            except Exception as e:
                print(f"✗ Failed to decode bencode: {e}")
                # Check if it's HTML (common for dead trackers)
                if b'<html' in response.content.lower()[:100]:
                    print("  (Tracker returned HTML instead of bencode)")
        else:
            print(f"✗ HTTP {response.status_code}")
            
    except requests.exceptions.Timeout:
        print(f"✗ Timeout")
    except requests.exceptions.ConnectionError as e:
        print(f"✗ Connection error: {str(e).split(':', 1)[0]}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    return None

# Test with working trackers (these are more likely to be up)
trackers = [
    "udp://tracker.opentrackr.org:1337/announce",  # UDP (won't work with HTTP scraping)
    "http://nyaa.tracker.wf:7777/announce",
    "http://tracker.files.fm:6969/announce",
    "http://1337.abcvg.info:80/announce",
    "http://bt.okmp3.ru:2710/announce",
    "https://tracker.tamersunion.org:443/announce",
    "http://open.tracker.ink:6969/announce",
    "http://tracker.mywaifu.best:6969/announce",
    "http://tracker.dler.org:6969/announce",
]

print(f"Testing tracker scraping for info hash: {info_hash}")
print(f"Binary hash: {binascii.hexlify(bytes.fromhex(info_hash)).decode()}\n")

http_count = 0
udp_count = 0
successful = []

for tracker in trackers:
    parsed = urlparse(tracker)
    if parsed.scheme in ['http', 'https']:
        http_count += 1
        result = scrape_http_tracker(tracker, info_hash)
        if result:
            successful.append((tracker, result))
    else:
        udp_count += 1
        print(f"Skipping {tracker} (UDP protocol requires different implementation)")
    print()

print(f"\nSummary:")
print(f"- Attempted HTTP/HTTPS trackers: {http_count}")
print(f"- Skipped UDP trackers: {udp_count}")
print(f"- Successful scrapes: {len(successful)}")

if successful:
    print(f"\nSuccessful results:")
    for tracker, result in successful:
        print(f"  {tracker}")
        print(f"    Seeders: {result['seeders']}, Leechers: {result['leechers']}, Downloads: {result['downloads']}")