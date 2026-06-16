import os
import json
import time
import requests
import feedparser
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
CACHE_FILE = 'releases_cache.json'
FEED_URL = 'https://docs.cloud.google.com/feeds/bigquery-release-notes.xml'

def fetch_and_parse_feed():
    """Fetches the Atom feed and parses it into a clean JSON structure."""
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        response = requests.get(FEED_URL, headers=headers, timeout=15)
        response.raise_for_status()
        
        feed = feedparser.parse(response.content)
        
        releases = []
        for entry in feed.entries:
            title = entry.get('title', 'BigQuery Update')
            link = entry.get('link', '')
            published = entry.get('published', entry.get('updated', ''))
            
            # Content parsing
            content_value = ''
            if 'content' in entry and len(entry.content) > 0:
                content_value = entry.content[0].value
            elif 'summary' in entry:
                content_value = entry.summary
                
            # Formatting published date
            date_str = published
            timestamp = 0
            if 'published_parsed' in entry and entry.published_parsed:
                date_str = time.strftime('%B %d, %Y', entry.published_parsed)
                timestamp = int(time.mktime(entry.published_parsed))
            elif 'updated_parsed' in entry and entry.updated_parsed:
                date_str = time.strftime('%B %d, %Y', entry.updated_parsed)
                timestamp = int(time.mktime(entry.updated_parsed))
                
            # Classify type based on title or content keywords
            title_lower = title.lower()
            content_lower = content_value.lower()
            category = 'General'
            if 'feature' in title_lower or 'new' in title_lower:
                category = 'Feature'
            elif 'change' in title_lower or 'changed' in title_lower or 'update' in title_lower:
                category = 'Change'
            elif 'deprecated' in title_lower or 'deprecation' in title_lower:
                category = 'Deprecation'
            elif 'fix' in title_lower or 'resolved' in title_lower or 'bug' in title_lower:
                category = 'Fix'
            elif 'announcement' in title_lower:
                category = 'Announcement'
            
            # Check content for headers if title is generic (e.g., "BigQuery release notes for June 17, 2026")
            # Sometimes GCP feed title is just the release date, and actual updates are inside the content
            # Let's inspect content for categories as well
            if category == 'General':
                if 'feature:' in content_lower or '<strong>feature' in content_lower:
                    category = 'Feature'
                elif 'change:' in content_lower or '<strong>change' in content_lower:
                    category = 'Change'
                elif 'deprecated:' in content_lower or '<strong>deprecation' in content_lower:
                    category = 'Deprecation'
                elif 'fix:' in content_lower or '<strong>fix' in content_lower:
                    category = 'Fix'

            releases.append({
                'id': entry.get('id', link),
                'title': title,
                'link': link,
                'published': published,
                'date': date_str,
                'timestamp': timestamp,
                'category': category,
                'content': content_value
            })
            
        # Cache the results
        cache_data = {
            'last_updated': int(time.time()),
            'releases': releases
        }
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
            
        return releases, None
    except Exception as e:
        return None, str(e)

def load_cached_releases():
    """Loads cached releases from disk."""
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return data.get('releases', []), data.get('last_updated', 0)
        except Exception:
            pass
    return None, 0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    releases, last_updated = load_cached_releases()
    
    # Fetch fresh if cache doesn't exist, force refresh, or cache older than 1 hour
    cache_age = int(time.time()) - last_updated
    if force_refresh or not releases or cache_age > 3600:
        new_releases, error = fetch_and_parse_feed()
        if error:
            # If fetch fails but we have cache, return cache with warning
            if releases:
                return jsonify({
                    'releases': releases,
                    'last_updated': last_updated,
                    'warning': f"Failed to refresh feed: {error}. Serving cached data."
                })
            return jsonify({'error': f"Failed to fetch release notes: {error}"}), 500
        
        releases = new_releases
        last_updated = int(time.time())

    return jsonify({
        'releases': releases,
        'last_updated': last_updated
    })

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
