const express = require('express');
const RssParser = require('rss-parser');
const cors = require('cors');

const app = express();

// --- CORRECTED PARSER CREATION ---
// We pass the options to the constructor, not to the parseURL function.
const options = {
    timeout: 10000 // 10 second timeout for each feed
};
const parser = new RssParser(options);
// --- END OF FIX ---

const PORT = process.env.PORT || 3000;

app.use(cors());

// --- CURATED LIST OF HIGH-QUALITY FEEDS ---
// (v3.4 - 15 feeds)
const FEEDS = [
    // --- Cameroon / Africa Specific (High Relevance) ---
    'https://fr.allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf', // AllAfrica (French)
    'https://allafrica.com/tools/headlines/rdf/cameroon/headlines.rdf',    // AllAfrica (English)
    'https://www.africanews.com/feed/rss',                                // Africanews
    'https://www.lemonde.fr/afrique/rss_full.xml',                        // Le Monde (Afrique)
    'https://www.france24.com/fr/afrique/rss',                            // France 24 (Afrique)
    'https://www.rfi.fr/fr/afrique/rss',                                  // RFI Afrique
    'https://www.jeuneafrique.com/feed/',                                  // Jeune Afrique
    
    // --- International Feeds (Broad Search) ---
    'http://rss.cnn.com/rss/cnn_world.rss',                              // CNN (World)
    'http://feeds.bbci.co.uk/news/world/africa/rss.xml',                 // BBC News (Africa)
    'https://www.aljazeera.com/xml/rss/all.xml',                         // Al Jazeera (All)
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',            // New York Times (World)
    'https://www.theguardian.com/world/rss',                             // The Guardian (World)
    'https://feeds.npr.org/1004/rss.xml',                                // NPR (World)
    'https://www.lemonde.fr/rss/une.xml',                                // Le Monde (International)
    'https://www.france24.com/en/rss'                                     // France 24 (English)
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

// --- Categorize Article ---
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

// --- Find Image or Video Media ---
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
