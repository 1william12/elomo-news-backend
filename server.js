const express = require('express');
const RssParser = require('rss-parser');
const cors = require('cors');

const app = express();
const parser = new RssParser();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- CURATED LIST OF HIGH-QUALITY FEEDS ---
// This is a stable and powerful list for a free server.
const FEEDS = [
    // --- Cameroon / Africa Specific (High Relevance) ---
    'https://fr.allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf', // AllAfrica (French)
    'https://allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf',    // AllAfrica (English)
    'https://www.africanews.com/feed/rss',                                // Africanews
    'https://www.lemonde.fr/afrique/rss_full.xml',                        // Le Monde (Afrique)
    'https://www.france24.com/fr/afrique/rss',                            // France 24 (Afrique)
    
    // --- International Feeds (Broad Search) ---
    'http://feeds.reuters.com/reuters/worldNews',                        // Reuters (World)
    'http://feeds.bbci.co.uk/news/world/africa/rss.xml',                 // BBC News (Africa)
    'https://www.aljazeera.com/xml/rss/all.xml',                         // Al Jazeera (All)
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',            // New York Times (World)
    'https://www.theguardian.com/world/rss',                             // The Guardian (World)
    'http://www.voaafrique.com/api/z-gq-e-v-qpo',                        // VOA Afrique
    'https://www.jeuneafrique.com/feed/'                                  // Jeune Afrique
];

// --- KEYWORD LISTS FOR CATEGORIZATION ---
const POLITICS_KEYWORDS = [
    'politique', 'president', 'biya', 'gouvernement', 'parlement', 'élection', 'diplomatie', 
    'assemblée', 'ministre', 'politics', 'government', 'election', 'president', 'minister'
];
const SPORTS_KEYWORDS = [
    'sport', 'football', 'fecafoot', 'lions indomptables', 'onuana', 'cameroun vs', 
    'coupe d\'afrique', 'sports', 'soccer', 'indomitable lions', 'caf', 'fifa', 'samuel eto\'o'
];
const ECONOMY_KEYWORDS = [
    'économie', 'finance', 'gicam', 'port de douala', 'croissance', 'fmi', 'banque mondiale', 
    'investir', 'pib', 'economy', 'finance', 'growth', 'imf', 'world bank', 'invest', 'gdp'
];

let cachedNews = [];

// --- NEW FUNCTION: Categorize Article ---
function getCategory(title, snippet) {
    const text = (title + ' ' + snippet).toLowerCase();
    
    for (const keyword of SPORTS_KEYWORDS) {
        if (text.includes(keyword)) return 'sports';
    }
    for (const keyword of ECONOMY_KEYWORDS) {
        if (text.includes(keyword)) return 'economy';
    }
    for (const keyword of POLITICS_KEYWORDS) {
        if (text.includes(keyword)) return 'politics';
    }
    return 'other'; // Default category
}

// --- NEW FUNCTION: Find Image or Video Media ---
function findMedia(item) {
    // 1. Check for <media:content>
    if (item['media:content'] && item['media:content'].$) {
        const media = item['media:content'].$;
        if (media.medium === 'video' || (media.url && media.url.endsWith('.mp4'))) {
            return { type: 'video', url: media.url };
        }
        if (media.medium === 'image' || (media.url && (media.url.endsWith('.jpg') || media.url.endsWith('.png') || media.url.endsWith('.jpeg')))) {
            return { type: 'image', url: media.url };
        }
    }
    // 2. Check for <enclosure>
    if (item.enclosure && item.enclosure.url) {
        const url = item.enclosure.url;
        const type = item.enclosure.type;
        
        if (type.startsWith('video') || url.endsWith('.mp4')) {
            return { type: 'video', url: url };
        }
        if (type.startsWith('image') || url.endsWith('.jpg') || url.endsWith('.png')) {
            return { type: 'image', url: url };
        }
    }
    // 3. Check for image inside the HTML <content>
    if (item.content) {
        const match = item.content.match(/<img.*?src="(.*?)"/);
        if (match && match[1]) {
            return { type: 'image', url: match[1] };
        }
    }
    // 4. If no media is found, return null
    return { type: null, url: null };
}

async function fetchNews() {
    console.log(`Fetching news from ${FEEDS.length} sources...`);
    let allNews = [];

    const feedPromises = FEEDS.map(feedUrl => 
        parser.parseURL(feedUrl)
            .then(feed => feed.items)
            .catch(err => {
                console.warn(`WARN: Failed to fetch feed: ${feedUrl}. Reason: ${err.message}`);
                return [];
            })
    );

    try {
        const allFeedItems = await Promise.all(feedPromises);
        allNews = allFeedItems.flat();

        const processedNews = allNews
            // 1. Filter for Cameroon-related articles (BROADER)
            .filter(item => {
                const title = item.title?.toLowerCase() || '';
                const content = (item.contentSnippet || item.content || '').toLowerCase();
                
                return title.includes('cameroun') || 
                       title.includes('cameroon') ||
                       content.includes('cameroun') ||
                       content.includes('cameroon') ||
                       title.includes('fecafoot') || // Add some specific keywords
                       title.includes('lions indomptables');
            })
            // 2. Map to a clean, categorized format
            .map(item => {
                const title = item.title || 'Titre non disponible';
                const snippet = (item.contentSnippet || (item.content || '...')).substring(0, 150).replace(/<[^>]+>/g, '');
                
                // --- NEW CATEGORY & MEDIA LOGIC ---
                const category = getCategory(title, snippet);
                const media = findMedia(item);
                
                return {
                    title: title,
                    link: item.link,
                    pubDate: item.isoDate || item.pubDate,
                    snippet: snippet,
                    source: new URL(item.link).hostname.replace('www.', ''),
                    category: category,
                    media: media
                };
            })
            // 3. Sort: Newest first
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

        // 4. Remove duplicates (essential with so many feeds)
        const uniqueNews = [...new Map(processedNews.map(item => [item['link'], item])).values()];
        
        cachedNews = uniqueNews;
        console.log(`News fetch complete. Found ${cachedNews.length} unique Cameroon articles.`);

    } catch (error) {
        console.error('CRITICAL ERROR in fetchNews function:', error);
    }
}

// --- API Endpoints (No change here) ---
app.get('/news', (req, res) => {
    res.json(cachedNews);
});

app.get('/', (req, res) => {
    res.send('Elomo-scott news cameroun Backend is running! (v3 - Categorized)');
});

// --- Start the Server (No change here) ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    fetchNews();
    setInterval(fetchNews, 30 * 60 * 1000); // 30 minutes
});
