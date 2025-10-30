// Import necessary libraries
const express = require('express');
const RssParser = require('rss-parser');
const cors = require('cors');

// Initialize the app
const app = express();
const parser = new RssParser();
const PORT = process.env.PORT || 3000;

// Use CORS (Cross-Origin Resource Sharing)
// This is essential to allow your index.html to talk to this server
app.use(cors());

// List of RSS feeds to fetch
// We use feeds that cover all of Africa, then we will filter for Cameroon.
const FEEDS = [
    'https://fr.allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf', // AllAfrica (French) - Already filtered for Cameroon!
    'https://allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf',    // AllAfrica (English) - Already filtered for Cameroon!
    'https://www.africanews.com/feed/rss'                                 // Africanews (All Africa)
];

// This is where we store the news in memory
let cachedNews = [];

// Function to fetch and process the news
async function fetchNews() {
    console.log('Fetching news...');
    let allNews = [];

    // Create a list of promises for all feeds
    const feedPromises = FEEDS.map(feedUrl => 
        parser.parseURL(feedUrl)
            .then(feed => feed.items)
            .catch(err => {
                console.error(`Error fetching feed: ${feedUrl}`, err.message);
                return []; // Return empty array on error
            })
    );

    try {
        // Wait for all feeds to be fetched
        const allFeedItems = await Promise.all(feedPromises);
        
        // Flatten the array of arrays into one big array
        allNews = allFeedItems.flat();

        // Filter, process, and sort the news
        const processedNews = allNews
            // 1. Filter for Cameroon-related articles (if not already filtered like AllAfrica)
            .filter(item => {
                const title = item.title?.toLowerCase() || '';
                const content = (item.contentSnippet || item.content || '').toLowerCase();
                
                // Keep if "cameroon" or "cameroun" is in the title or content
                return title.includes('cameroun') || 
                       title.includes('cameroon') ||
                       content.includes('cameroun') ||
                       content.includes('cameroon');
            })
            // 2. Map to a clean format
            .map(item => {
                // Check for political keywords
                const title = item.title?.toLowerCase() || '';
                const isPolitical = title.includes('politique') || 
                                    title.includes('politics') || 
                                    title.includes('président') ||
                                    title.includes('gouvernement');
                
                return {
                    title: item.title,
                    link: item.link,
                    pubDate: item.isoDate || item.pubDate,
                    snippet: item.contentSnippet || (item.content || '').substring(0, 150),
                    source: new URL(item.link).hostname, // e.g., "fr.allafrica.com"
                    isPolitical: isPolitical
                };
            })
            // 3. Sort: Political news first, then by date
            .sort((a, b) => {
                if (a.isPolitical && !b.isPolitical) return -1; // a comes first
                if (!a.isPolitical && b.isPolitical) return 1;  // b comes first
                return new Date(b.pubDate) - new Date(a.pubDate); // Otherwise, newest first
            });

        // Remove duplicates (based on link)
        const uniqueNews = [...new Map(processedNews.map(item => [item['link'], item])).values()];
        
        cachedNews = uniqueNews;
        console.log(`News fetch complete. Found ${cachedNews.length} unique articles.`);

    } catch (error) {
        console.error('Error in fetchNews function:', error);
    }
}

// --- API Endpoints ---

// The main endpoint your website will call
app.get('/news', (req, res) => {
    res.json(cachedNews);
});

// A simple endpoint to check if the server is alive
app.get('/', (req, res) => {
    res.send('Elomo-scott news cameroun Backend is running!');
});

// --- Start the Server ---
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    // Fetch news immediately on startup
    fetchNews();
    // Then, fetch news every 30 minutes
    setInterval(fetchNews, 30 * 60 * 1000);
});