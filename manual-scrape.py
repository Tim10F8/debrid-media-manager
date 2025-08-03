#!/usr/bin/env python3
"""
Manual BitTorrent tracker scraping for HTTP trackers
"""

import urllib.parse
import requests
import struct
import binascii

# The torrent hash we want to check
info_hash = "ba0e267579fa62981795dcc059fb61e1af5ca429"

# Convert hex to URL-encoded format for HTTP trackers
def hex_to_url_encoded(hex_hash):
    """Convert 40-char hex hash to URL-encoded 20-byte format"""
    bytes_hash = bytes.fromhex(hex_hash)
    return urllib.parse.quote(bytes_hash, safe='')

# HTTP tracker scrape
def scrape_http_tracker(tracker_url, info_hash):
    """Scrape an HTTP/HTTPS tracker"""
    # Replace 'announce' with 'scrape' in the URL
    if '/announce' in tracker_url:
        scrape_url = tracker_url.replace('/announce', '/scrape')
    else:
        # Some trackers don't have /announce in URL
        scrape_url = tracker_url.rstrip('/') + '/scrape'
    
    # Add info_hash parameter
    encoded_hash = hex_to_url_encoded(info_hash)
    params = {'info_hash': encoded_hash}
    
    try:
        print(f"Scraping {scrape_url}")
        response = requests.get(scrape_url, params=params, timeout=10)
        
        if response.status_code == 200:
            # The response is bencoded, we need to decode it
            # For simplicity, we'll just look for the numbers
            content = response.content
            print(f"Response length: {len(content)} bytes")
            print(f"Raw response (first 200 bytes): {content[:200]}")
            
            # Try to parse bencode (simplified)
            # Look for patterns like "8:completei<number>e" for seeders
            import re
            complete_match = re.search(b'8:completei(\d+)e', content)
            incomplete_match = re.search(b'10:incompletei(\d+)e', content)
            downloaded_match = re.search(b'10:downloadedi(\d+)e', content)
            
            if complete_match or incomplete_match:
                seeders = int(complete_match.group(1)) if complete_match else 0
                leechers = int(incomplete_match.group(1)) if incomplete_match else 0
                downloads = int(downloaded_match.group(1)) if downloaded_match else 0
                print(f"✓ Seeders: {seeders}, Leechers: {leechers}, Downloads: {downloads}")
                return {'seeders': seeders, 'leechers': leechers, 'downloads': downloads}
            else:
                print("✗ Could not parse response")
        else:
            print(f"✗ HTTP {response.status_code}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    return None

# Test with some common HTTP trackers
http_trackers = [
    "http://tracker.opentrackr.org:1337/announce",
    "http://open.acgnxtracker.com:80/announce",
    "http://tracker.openbittorrent.com:80/announce",
    "http://tracker.internetwarriors.net:1337/announce",
    "http://exodus.desync.com:6969/announce",
]

print(f"Testing tracker scraping for info hash: {info_hash}\n")

for tracker in http_trackers:
    result = scrape_http_tracker(tracker, info_hash)
    print()

print("\nNote: UDP tracker scraping requires more complex binary protocol implementation.")
print("Most command-line torrent clients like 'aria2c' or 'transmission-cli' can also get this info.")