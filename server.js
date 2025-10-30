const express = require('express');
const RssParser = require('rss-parser');
const cors = require('cors');

const app = express();
const parser = new RssParser();
const PORT = process.env.PORT || 3000;

app.use(cors());

// --- NEW FEED LIST ---
// We've added international feeds to find more Cameroon news
const FEEDS = [
    'https://fr.allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf', // AllAfrica (French)
    'https://allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf',    // AllAfrica (English)
    'https://www.africanews.com/feed/rss',                                // Africanews
    'http://feeds.bbci.co.uk/news/world/africa/rss.xml',                 // BBC News - Africa
    'https://www.aljazeera.com/xml/rss/all.xml'                           // Al Jazeera - All (will be filtered)
];

let cachedNews = [];

// --- NEW FUNCTION TO FIND IMAGES ---
function findImageUrl(item) {
    // 1. Check for <media:content> (Best case)
    if (item['media:content'] && item['media:content'].$ && item['media:content'].$.url) {
        return item['media:content'].$.url;
    }
    // 2. Check for <enclosure> (Common case)
    if (item.enclosure && item.enclosure.url && item.enclosure.type.startsWith('image')) {
        return item.enclosure.url;
    }
    // 3. Check for image inside the HTML <content> (Harder case)
    if (item.content) {
        const match = item.content.match(/<img.*?src="(.*?)"/);
        if (match && match[1]) {
            return match[1];
        }
    }
    // 4. If no image is found, return null
    return null;
}

async function fetchNews() {
    console.log('Fetching news from all sources...');
    let allNews = [];

    const feedPromises = FEEDS.map(feedUrl => 
        parser.parseURL(feedUrl)
            .then(feed => feed.items)
            .catch(err => {
                console.error(`Error fetching feed: ${feedUrl}`, err.message);
                return [];
            })
    );

    try {
        const allFeedItems = await Promise.all(feedPromises);
        allNews = allFeedItems.flat();

        const processedNews = allNews
            // 1. Filter for Cameroon-related articles
            .filter(item => {
                const title = item.title?.toLowerCase() || '';
                const content = (item.contentSnippet || item.content || '').toLowerCase();
                
                return title.includes('cameroun') || 
                       title.includes('cameroon') ||
                       content.includes('cameroun') ||
                       content.includes('cameroon');
            })
            // 2. Map to a clean format (NOW WITH IMAGES)
            .map(item => {
                const title = item.title?.toLowerCase() || '';
                const isPolitical = title.includes('politique') || 
                                    title.includes('politics') || 
                                    title.includes('président') ||
                                    title.includes('gouvernement') ||
                                    title.includes('biya') || // Added a specific keyword
                                    title.includes('assembly');
                
                // --- NEW IMAGE LOGIC ---
                const imageUrl = findImageUrl(item);
                
                return {
                    title: item.title,
                    link: item.link,
                    pubDate: item.isoDate || item.pubDate,
                    snippet: item.contentSnippet || (item.content || '').substring(0, 150).replace(/<[^>]+>/g, ''), // Clean snippet
                    source: new URL(item.link).hostname,
                    isPolitical: isPolitical,
                    imageUrl: imageUrl // <-- ADDED THE IMAGE URL
                };
            })
            // 3. Sort: Political news first, then by date
            .sort((a, b) => {
                if (a.isPolitical && !b.isPolitical) return -1;
                if (!a.isPolitical && b.isPolitical) return 1;
                return new Date(b.pubDate) - new Date(a.pubDate);
            });

        // 4. Remove duplicates
        const uniqueNews = [...new Map(processedNews.map(item => [item['link'], item])).values()];
        
        cachedNews = uniqueNews;
        console.log(`News fetch complete. Found ${cachedNews.length} unique Cameroon articles.`);

    } catch (error) {
        console.error('Error in fetchNews function:', error);
    }
}

// --- API Endpoints (No change here) ---
app.get('/news', (req, res) => {
    res.json(cachedNews);
});

app.get('/', (req, res) => {
    res.send('Elomo-scott news cameroun Backend is running! (v2 with images)');
});

// --- Start the Server (No change here) ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    fetchNews();
    setInterval(fetchNews, 30 * 60 * 1000); // 30 minutes
});
